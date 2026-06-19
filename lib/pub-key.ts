import { normalizeSecp256k1Signature } from "./crypto/ecdsa-signature";
import { decodeEncodedBytes } from "./crypto/decode-bytes";
import { Web3Error } from "./errors/web3-error";
import type { PubKey, PubKeyAlgorithm, PubKeyEncoding } from "./types/web3-types";

const ALGORITHMS = new Set<PubKeyAlgorithm>(["secp256k1", "Ed25519", "sr25519"]);
const ENCODINGS = new Set<PubKeyEncoding>(["hex", "base64", "base58"]);

const ALGORITHM_LIST = [...ALGORITHMS].join(", ");
const ENCODING_LIST = [...ENCODINGS].join(", ");

const ENCODING_RE: Record<PubKeyEncoding, RegExp> = {
  hex: /^[0-9a-fA-F]+$/,
  base64: /^[A-Za-z0-9+/]+={0,2}$/,
  base58: /^[1-9A-HJ-NP-Za-km-z]+$/,
};

type ByteCheck = (bytes: Uint8Array) => string | null;

const PUBLIC_KEY_CHECKS: Record<PubKeyAlgorithm, ByteCheck> = {
  Ed25519: (bytes) =>
    bytes.length === 32 ? null : `Ed25519 public key must be 32 bytes, got ${bytes.length}`,
  secp256k1: (bytes) =>
    isSecp256k1PublicKey(bytes)
      ? null
      : "secp256k1 public key must be 33-byte compressed or 65-byte uncompressed",
  sr25519: () => "sr25519 public key verification is not supported yet",
};

const SIGNATURE_CHECKS: Record<PubKeyAlgorithm, ByteCheck> = {
  Ed25519: (bytes) =>
    bytes.length === 64 ? null : `Ed25519 signature must be 64 bytes, got ${bytes.length}`,
  secp256k1: (bytes) =>
    normalizeSecp256k1Signature(bytes)
      ? null
      : "secp256k1 signature must be 64/65-byte raw or DER encoded",
  sr25519: () => "sr25519 signature verification is not supported yet",
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSecp256k1PublicKey(bytes: Uint8Array) {
  const compressed = bytes.length === 33 && (bytes[0] === 2 || bytes[0] === 3);
  const uncompressed = bytes.length === 65 && bytes[0] === 4;
  return compressed || uncompressed;
}

function readEncoding(encoding: string): PubKeyEncoding {
  if (!ENCODINGS.has(encoding as PubKeyEncoding)) {
    throw Web3Error.invalidPubKey(`Encoding must be one of: ${ENCODING_LIST}`);
  }

  return encoding as PubKeyEncoding;
}

function isValidEncodedValue(value: string, encoding: PubKeyEncoding) {
  return isNonEmptyString(value) && ENCODING_RE[encoding].test(value);
}

export function isPubKey(value: unknown): value is PubKey {
  if (!value || typeof value !== "object") return false;

  const pubKey = value as PubKey;

  return (
    ALGORITHMS.has(pubKey.type) &&
    isNonEmptyString(pubKey.value) &&
    ENCODINGS.has(pubKey.encoding)
  );
}

export function isValidPubKeyValue(value: string, encoding: PubKeyEncoding) {
  return isValidEncodedValue(value, encoding);
}

export function isValidPubKey(pubKey: PubKey) {
  return isPubKey(pubKey) && isValidPubKeyValue(pubKey.value, pubKey.encoding);
}

export function parsePubKey(value: unknown): PubKey {
  if (!value || typeof value !== "object") {
    throw Web3Error.invalidPubKey("PubKey must be an object");
  }

  const pubKey = value as PubKey;

  if (!ALGORITHMS.has(pubKey.type)) {
    throw Web3Error.invalidPubKey(`PubKey.type must be one of: ${ALGORITHM_LIST}`);
  }

  if (!isNonEmptyString(pubKey.value)) {
    throw Web3Error.invalidPubKey("PubKey.value must be a non-empty string");
  }

  readEncoding(pubKey.encoding);

  if (!isValidEncodedValue(pubKey.value, pubKey.encoding)) {
    throw Web3Error.invalidPubKey(`PubKey.value is not valid ${pubKey.encoding}`);
  }

  return {
    type: pubKey.type,
    value: pubKey.value,
    encoding: pubKey.encoding,
  };
}

export function decodePubKeyBytes(pubKey: PubKey) {
  const key = parsePubKey(pubKey);
  const bytes = decodeEncodedBytes(key.value, key.encoding);

  if (!bytes) {
    throw Web3Error.invalidPubKey(`Cannot decode PubKey.value as ${key.encoding}`);
  }

  assertPublicKeyBytes(key.type, bytes);
  return bytes;
}

export function decodeSignatureBytes(signature: string, encoding: PubKeyEncoding) {
  if (!isValidEncodedValue(signature, encoding)) {
    throw Web3Error.invalidSignature(`Signature is not valid ${encoding}`);
  }

  const bytes = decodeEncodedBytes(signature, encoding);

  if (!bytes) {
    throw Web3Error.invalidSignature(`Cannot decode signature as ${encoding}`);
  }

  return bytes;
}

export function assertPublicKeyBytes(type: PubKeyAlgorithm, bytes: Uint8Array) {
  const message = PUBLIC_KEY_CHECKS[type](bytes);
  if (message) throw Web3Error.invalidPubKey(message);
}

export function assertSignatureBytes(type: PubKeyAlgorithm, bytes: Uint8Array) {
  const message = SIGNATURE_CHECKS[type](bytes);
  if (message) throw Web3Error.invalidSignature(message);
}
