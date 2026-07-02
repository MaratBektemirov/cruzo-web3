import {
  isEvmAddressPubKey,
  isTronAddressPubKey,
} from "../crypto/account-signature";
import type { WalletKind } from "../providers/wallet";
import type { PubKey, PubKeyEncoding } from "../types/web3-types";
import type { SecretAuthAlgorithm, SecretAuthEncoding, SecretAuthPubKey, SecretAuthSource } from "./types";

const ALGORITHMS = new Set<SecretAuthAlgorithm>(["secp256k1", "Ed25519", "ES256"]);
const SOURCES = new Set<SecretAuthSource>(["ethereum", "tron", "ton", "solana", "raw", "webauthn"]);

function walletContext(kind: WalletKind): { algorithm: SecretAuthAlgorithm; source: SecretAuthSource } {
  if (kind === "ethereum" || kind === "tron") {
    return { algorithm: "secp256k1", source: kind };
  }

  return { algorithm: "Ed25519", source: kind };
}

function assertPair(algorithm: SecretAuthAlgorithm, source: SecretAuthSource) {
  const valid =
    (algorithm === "secp256k1" && (source === "ethereum" || source === "tron" || source === "raw")) ||
    (algorithm === "Ed25519" && (source === "ton" || source === "solana" || source === "raw")) ||
    (algorithm === "ES256" && source === "webauthn");

  if (!valid) {
    throw new Error("Invalid SecretAuth pubKey algorithm/source pair");
  }
}

function assertEncoding(source: SecretAuthSource, encoding: SecretAuthEncoding) {
  const valid = source === "webauthn" ? encoding === "base64url" : encoding !== "base64url";

  if (!valid) {
    throw new Error("Invalid SecretAuth pubKey source/encoding pair");
  }
}

export function build(
  algorithm: SecretAuthAlgorithm,
  source: SecretAuthSource,
  value: string,
  encoding: SecretAuthEncoding,
): SecretAuthPubKey {
  return parse({ algorithm, source, value, encoding });
}

export function fromWallet(pubKey: PubKey, kind: WalletKind): SecretAuthPubKey {
  const { algorithm, source } = walletContext(kind);

  return build(algorithm, source, pubKey.value, pubKey.encoding);
}

export function infer(pubKey: PubKey): SecretAuthPubKey | null {
  if (isEvmAddressPubKey(pubKey)) {
    return build("secp256k1", "ethereum", pubKey.value, pubKey.encoding);
  }

  if (isTronAddressPubKey(pubKey)) {
    return build("secp256k1", "tron", pubKey.value, pubKey.encoding);
  }

  if (pubKey.type === "Ed25519") {
    return build("Ed25519", "raw", pubKey.value, pubKey.encoding);
  }

  return null;
}

export function toCrypto(pubKey: SecretAuthPubKey): PubKey {
  if (pubKey.source === "webauthn") {
    throw new Error("WebAuthn pubKey cannot be converted to crypto PubKey");
  }

  if (pubKey.algorithm === "ES256") {
    throw new Error("ES256 pubKey cannot be converted to crypto PubKey");
  }

  return {
    type: pubKey.algorithm,
    value: pubKey.value,
    encoding: pubKey.encoding as PubKeyEncoding,
  };
}

export function usesEvmPersonalSign(pubKey: SecretAuthPubKey): boolean {
  return pubKey.algorithm === "secp256k1" && (pubKey.source === "ethereum" || pubKey.source === "raw");
}

export function usesAccountSignature(pubKey: SecretAuthPubKey): boolean {
  return (
    pubKey.algorithm === "secp256k1" &&
    (pubKey.source === "ethereum" || pubKey.source === "tron" || pubKey.source === "raw")
  );
}

export function isWebAuthnPubKey(pubKey: SecretAuthPubKey): boolean {
  return pubKey.source === "webauthn" && pubKey.algorithm === "ES256";
}

export function parse(value: unknown): SecretAuthPubKey {
  if (!value || typeof value !== "object") {
    throw new Error("SecretAuth pubKey must be an object");
  }

  const pubKey = value as SecretAuthPubKey;

  if (typeof pubKey.algorithm !== "string" || !ALGORITHMS.has(pubKey.algorithm as SecretAuthAlgorithm)) {
    throw new Error("SecretAuth pubKey algorithm must be secp256k1, Ed25519, or ES256");
  }

  if (typeof pubKey.source !== "string" || !SOURCES.has(pubKey.source as SecretAuthSource)) {
    throw new Error("SecretAuth pubKey source must be ethereum, tron, ton, solana, raw, or webauthn");
  }

  assertPair(pubKey.algorithm, pubKey.source);

  if (typeof pubKey.value !== "string" || !pubKey.value.length) {
    throw new Error("SecretAuth pubKey value must be a non-empty string");
  }

  if (
    pubKey.encoding !== "hex" &&
    pubKey.encoding !== "base64" &&
    pubKey.encoding !== "base58" &&
    pubKey.encoding !== "base64url"
  ) {
    throw new Error("SecretAuth pubKey encoding must be hex, base64, base58, or base64url");
  }

  assertEncoding(pubKey.source, pubKey.encoding);

  return {
    algorithm: pubKey.algorithm,
    source: pubKey.source,
    value: pubKey.value,
    encoding: pubKey.encoding,
  };
}
