import { toBytes } from "./decode-bytes";
import { hashEvmPersonalMessage, keccak256 } from "./keccak256";
import { verifySecp256k1 } from "./secp256k1-verify";

async function verifyEd25519(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array
) {
  if (!globalThis.crypto?.subtle) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      publicKey as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    return crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signature as BufferSource,
      message as BufferSource
    );
  } catch {
    return false;
  }
}

export async function verifySignedBytes(
  content: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
  algorithm: "secp256k1" | "Ed25519" | "sr25519",
  options?: { evmPersonalSign?: boolean }
) {
  if (algorithm === "Ed25519") {
    return verifyEd25519(publicKey, signature, content);
  }

  const messageHash = options?.evmPersonalSign
    ? hashEvmPersonalMessage(content)
    : content.length === 32
      ? content
      : keccak256(content);

  return verifySecp256k1(signature, messageHash, publicKey);
}

export function normalizeContent(content: string | Uint8Array) {
  return toBytes(content);
}
