import { decodeBase64, decodeHex } from "../crypto/decode-bytes";
import { encodeBase64 } from "../crypto/encode-bytes";
import {
  isValidSecp256k1PrivateKey,
  secp256k1EvmAddressFromPrivateKey,
  signSecp256k1EvmPersonalMessage,
} from "../crypto/secp256k1-sign";
import type { PubKey, PubKeyAlgorithm, PubKeyEncoding } from "../types/web3-types";
import * as pubKey from "./pub-key";
import type { SecretAuthPubKey } from "./types";

const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

type ImportedKey =
  | { kind: "Ed25519"; key: CryptoKey }
  | { kind: "secp256k1"; bytes: Uint8Array };

type PrivateKeyJson = {
  type: PubKeyAlgorithm;
  value: string;
  encoding: PubKeyEncoding;
};

function decodeValue(value: string, encoding: PubKeyEncoding) {
  if (encoding === "hex") return decodeHex(value);
  if (encoding === "base64") return decodeBase64(value);

  return null;
}

function decodeLoose(value: string) {
  const trimmed = value.trim();

  return decodeHex(trimmed) ?? decodeBase64(trimmed);
}

function ed25519Pkcs8FromSeed(seed: Uint8Array) {
  const out = new Uint8Array(ED25519_PKCS8_PREFIX.length + seed.length);
  out.set(ED25519_PKCS8_PREFIX);
  out.set(seed, ED25519_PKCS8_PREFIX.length);
  return out;
}

function base64UrlToBase64(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));

  return padded + pad;
}

async function importEd25519Pkcs8(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Ed25519 requires Web Crypto (crypto.subtle)");
  }

  return crypto.subtle.importKey("pkcs8", bytes as BufferSource, { name: "Ed25519" }, true, ["sign"]);
}

async function importEd25519Jwk(jwk: JsonWebKey) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Ed25519 requires Web Crypto (crypto.subtle)");
  }

  return crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, true, ["sign"]);
}

async function ed25519PublicKey(key: CryptoKey): Promise<PubKey> {
  const jwk = (await crypto.subtle.exportKey("jwk", key)) as JsonWebKey;

  if (!jwk.x) {
    throw new Error("Cannot derive Ed25519 public key");
  }

  const raw = decodeBase64(base64UrlToBase64(jwk.x));

  if (!raw || raw.length !== 32) {
    throw new Error("Invalid Ed25519 public key material");
  }

  return { type: "Ed25519", value: encodeBase64(raw), encoding: "base64" };
}

async function importEd25519Bytes(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.length === 32) {
    return importEd25519Pkcs8(ed25519Pkcs8FromSeed(bytes));
  }

  if (bytes[0] === 0x30) {
    return importEd25519Pkcs8(bytes);
  }

  throw new Error("Ed25519 private key must be a 32-byte seed or PKCS8");
}

async function importEd25519(input: string): Promise<CryptoKey> {
  const trimmed = input.trim();

  if (!trimmed) throw new Error("Private key is required");

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as JsonWebKey | PrivateKeyJson;

    if ("kty" in parsed && parsed.kty === "OKP") {
      return importEd25519Jwk(parsed);
    }

    if ("type" in parsed && parsed.type === "Ed25519") {
      const bytes = decodeValue(parsed.value, parsed.encoding);

      if (!bytes) throw new Error("Cannot decode Ed25519 private key");

      return importEd25519Bytes(bytes);
    }
  }

  const bytes = decodeLoose(trimmed);

  if (!bytes) throw new Error("Private key must be hex or base64");

  return importEd25519Bytes(bytes);
}

function importSecp256k1(input: string): Uint8Array {
  const trimmed = input.trim();

  if (!trimmed) throw new Error("Private key is required");

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as PrivateKeyJson;

    if (parsed.type !== "secp256k1") {
      throw new Error("Expected secp256k1 private key JSON");
    }

    const bytes = decodeValue(parsed.value, parsed.encoding);

    if (!bytes || !isValidSecp256k1PrivateKey(bytes)) {
      throw new Error("Invalid secp256k1 private key");
    }

    return bytes;
  }

  const bytes = decodeLoose(trimmed);

  if (!bytes || !isValidSecp256k1PrivateKey(bytes)) {
    throw new Error("secp256k1 private key must be 32 bytes (hex or base64)");
  }

  return bytes;
}

async function importKey(input: string): Promise<ImportedKey> {
  const trimmed = input.trim();

  if (!trimmed) throw new Error("Private key is required");

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as JsonWebKey | PrivateKeyJson;

    if ("kty" in parsed && parsed.kty === "OKP") {
      return { kind: "Ed25519", key: await importEd25519Jwk(parsed) };
    }

    if ("type" in parsed) {
      if (parsed.type === "Ed25519") {
        return { kind: "Ed25519", key: await importEd25519(trimmed) };
      }

      if (parsed.type === "secp256k1") {
        return { kind: "secp256k1", bytes: importSecp256k1(trimmed) };
      }
    }
  }

  const bytes = decodeLoose(trimmed);

  if (!bytes) throw new Error("Private key must be hex or base64");

  return { kind: "Ed25519", key: await importEd25519Bytes(bytes) };
}

async function signEd25519(key: CryptoKey, message: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Ed25519 signing requires Web Crypto (crypto.subtle)");
  }

  const bytes = new TextEncoder().encode(message);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, bytes));

  return encodeBase64(signature);
}

export async function generateEd25519KeyPair(): Promise<{ publicKey: PubKey; privateKey: CryptoKey }> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Ed25519 key generation requires Web Crypto (crypto.subtle)");
  }

  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));

  return {
    publicKey: { type: "Ed25519", value: encodeBase64(rawPublicKey), encoding: "base64" },
    privateKey: keyPair.privateKey,
  };
}

export async function signWithEphemeralEd25519(
  message: string,
): Promise<{ pubKey: SecretAuthPubKey; signature: string; publicKey: PubKey }> {
  const { publicKey, privateKey } = await generateEd25519KeyPair();
  const signature = await signEd25519(privateKey, message);

  return {
    pubKey: pubKey.build("Ed25519", "raw", publicKey.value, publicKey.encoding),
    signature,
    publicKey,
  };
}

export async function exportEd25519PrivateKeyBase64(privateKey: CryptoKey): Promise<string> {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));

  return encodeBase64(pkcs8);
}

export async function previewPublicKey(input: string): Promise<PubKey> {
  const imported = await importKey(input);

  if (imported.kind === "Ed25519") {
    return ed25519PublicKey(imported.key);
  }

  const address = secp256k1EvmAddressFromPrivateKey(imported.bytes);

  if (!address) throw new Error("Cannot derive secp256k1 public key");

  return { type: "secp256k1", value: address, encoding: "hex" };
}

export async function signWithPrivateKey(
  input: string,
  message: string,
): Promise<{ pubKey: SecretAuthPubKey; signature: string; publicKey: PubKey }> {
  const imported = await importKey(input);

  if (imported.kind === "Ed25519") {
    const publicKey = await ed25519PublicKey(imported.key);
    const signature = await signEd25519(imported.key, message);

    return {
      pubKey: pubKey.build("Ed25519", "raw", publicKey.value, publicKey.encoding),
      signature,
      publicKey,
    };
  }

  const address = secp256k1EvmAddressFromPrivateKey(imported.bytes);

  if (!address) {
    throw new Error("Cannot derive secp256k1 public key");
  }

  const signature = signSecp256k1EvmPersonalMessage(imported.bytes, new TextEncoder().encode(message));

  if (!signature) throw new Error("secp256k1 signing failed");

  const publicKey: PubKey = { type: "secp256k1", value: address, encoding: "hex" };

  return {
    pubKey: pubKey.build("secp256k1", "raw", address, "hex"),
    signature,
    publicKey,
  };
}
