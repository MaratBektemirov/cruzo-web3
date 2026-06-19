import type { PubKeyEncoding } from "../types/web3-types";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function decodeHex(value: string): Uint8Array | null {
  const hex = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

  if (!hex.length || hex.length % 2 || !/^[0-9a-fA-F]+$/.test(hex)) return null;

  const out = new Uint8Array(hex.length / 2);

  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

export function decodeBase64(value: string): Uint8Array | null {
  if (!value.length) return null;

  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }

    return out;
  } catch {
    return null;
  }
}

export function decodeBase58(value: string): Uint8Array | null {
  if (!value.length) return null;

  const bytes: number[] = [0];

  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);

    if (digit === -1) return null;

    let carry = digit;

    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeros = 0;

  for (const char of value) {
    if (char === "1") leadingZeros++;
    else break;
  }

  const decoded = bytes.reverse();

  if (!leadingZeros) return new Uint8Array(decoded);

  const out = new Uint8Array(leadingZeros + decoded.length);
  out.set(decoded, leadingZeros);
  return out;
}

export function decodeEncodedBytes(value: string, encoding: PubKeyEncoding): Uint8Array | null {
  switch (encoding) {
    case "hex":
      return decodeHex(value);
    case "base64":
      return decodeBase64(value);
    case "base58":
      return decodeBase58(value);
    default:
      return null;
  }
}

export function toBytes(content: string | Uint8Array): Uint8Array {
  if (content instanceof Uint8Array) return content;

  return new TextEncoder().encode(content);
}
