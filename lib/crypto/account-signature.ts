import type { PubKey } from "../types/web3-types";
import { decodeBase58, decodeHex } from "./decode-bytes";
import { normalizeSecp256k1Signature } from "./ecdsa-signature";
import { hashEvmPersonalMessage, keccak256 } from "./keccak256";
import { recoverSecp256k1PublicKey } from "./secp256k1-verify";
import { sha256 } from "./sha256";

function bytesToHex(bytes: Uint8Array) {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

function normalizeEvmAddress(value: string) {
  const hex = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

  if (!/^[0-9a-fA-F]{40}$/.test(hex)) return null;

  return `0x${hex.toLowerCase()}`;
}

export function isEvmAddressPubKey(pubKey: PubKey) {
  if (pubKey.type !== "secp256k1" || pubKey.encoding !== "hex") return false;

  return normalizeEvmAddress(pubKey.value) != null;
}

export function isTronAddressPubKey(pubKey: PubKey) {
  if (pubKey.type !== "secp256k1" || pubKey.encoding !== "base58") return false;

  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(pubKey.value);
}

export function isSecp256k1PublicKeyPubKey(pubKey: PubKey) {
  if (pubKey.type !== "secp256k1" || pubKey.encoding !== "hex") return false;

  const hex = pubKey.value.startsWith("0x") ? pubKey.value.slice(2) : pubKey.value;

  return hex.length === 66 || hex.length === 130;
}

function parseSecp256k1Signature(signature: string, encoding: PubKey["encoding"]) {
  const bytes = encoding === "hex"
    ? decodeHex(signature)
    : encoding === "base64"
      ? null
      : decodeBase58(signature);

  if (!bytes?.length) return null;

  let recoveryId: number | undefined;

  if (bytes.length === 65) {
    recoveryId = bytes[64];

    if (recoveryId >= 27) recoveryId -= 27;
    if (recoveryId > 1) recoveryId = undefined;
  }

  const normalized = normalizeSecp256k1Signature(bytes);

  if (!normalized) return null;

  return { signature: normalized, recoveryId };
}

function evmAddressFromUncompressedPublicKey(publicKey: Uint8Array) {
  if (publicKey.length !== 65 || publicKey[0] !== 4) return null;

  const hash = keccak256(publicKey.slice(1));

  return `0x${bytesToHex(hash.slice(12))}`;
}

async function hashTronSignMessageV2(content: Uint8Array) {
  const messageBytes = content;
  const messageDigest = messageBytes.length === 32
    ? messageBytes
    : await sha256(messageBytes);

  const prefix = new TextEncoder().encode("\x19TRON Signed Message:\n32");
  const payload = new Uint8Array(prefix.length + messageDigest.length);

  payload.set(prefix, 0);
  payload.set(messageDigest, prefix.length);

  return keccak256(payload);
}

function decodeTronAddressPayload(base58: string) {
  const decoded = decodeBase58(base58);

  if (!decoded || decoded.length !== 25 || decoded[0] !== 0x41) return null;

  return decoded.slice(1, 21);
}

async function verifyTronAddressSignature(
  content: Uint8Array,
  signature: string,
  expectedAddress: string,
) {
  const parsed = parseSecp256k1Signature(signature, "hex");

  if (!parsed) return false;

  const expected = decodeTronAddressPayload(expectedAddress);

  if (!expected) return false;

  const messageHash = await hashTronSignMessageV2(content);
  const publicKey = recoverSecp256k1PublicKey(messageHash, parsed.signature, parsed.recoveryId);

  if (!publicKey) return false;

  const recoveredPayload = keccak256(publicKey.slice(1)).slice(12);

  if (recoveredPayload.length !== expected.length) return false;

  for (let index = 0; index < expected.length; index++) {
    if (recoveredPayload[index] !== expected[index]) return false;
  }

  return true;
}

function verifyEvmAddressSignature(
  content: Uint8Array,
  signature: string,
  expectedAddress: string,
  evmPersonalSign: boolean,
) {
  const parsed = parseSecp256k1Signature(signature, "hex");

  if (!parsed) return false;

  const normalizedExpected = normalizeEvmAddress(expectedAddress);

  if (!normalizedExpected) return false;

  const messageHash = evmPersonalSign ? hashEvmPersonalMessage(content) : content;
  const publicKey = recoverSecp256k1PublicKey(messageHash, parsed.signature, parsed.recoveryId);

  if (!publicKey) return false;

  const recoveredAddress = evmAddressFromUncompressedPublicKey(publicKey);

  return recoveredAddress === normalizedExpected;
}

export async function verifyAccountSignedContent(
  content: Uint8Array,
  signature: string,
  pubKey: PubKey,
  options?: { evmPersonalSign?: boolean },
) {
  if (isEvmAddressPubKey(pubKey)) {
    return verifyEvmAddressSignature(
      content,
      signature,
      pubKey.value,
      options?.evmPersonalSign ?? true,
    );
  }

  if (isTronAddressPubKey(pubKey)) {
    return verifyTronAddressSignature(content, signature, pubKey.value);
  }

  return false;
}
