import type { PubKeyEncoding } from "../types/web3-types";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_DECODE = new Int8Array(128).fill(-1);

for (let i = 0; i < BASE64.length; i++) {
  BASE64_DECODE[BASE64.charCodeAt(i)] = i;
}

function base64CharValue(code: number): number {
  if (code >= BASE64_DECODE.length) return -1;

  return BASE64_DECODE[code];
}

function decodeBase64Core(value: string): Uint8Array | null {
  const len = value.length;

  if (!len || len % 4 !== 0) return null;

  const pad =
    value.charCodeAt(len - 1) === 61
      ? value.charCodeAt(len - 2) === 61
        ? 2
        : 1
      : 0;
  const out = new Uint8Array((len / 4) * 3 - pad);
  let outIndex = 0;

  for (let i = 0; i < len; i += 4) {
    const c0 = base64CharValue(value.charCodeAt(i));
    const c1 = base64CharValue(value.charCodeAt(i + 1));
    const q2 = value.charCodeAt(i + 2);
    const q3 = value.charCodeAt(i + 3);
    const c2 = q2 === 61 ? 0 : base64CharValue(q2);
    const c3 = q3 === 61 ? 0 : base64CharValue(q3);

    if (c0 < 0 || c1 < 0 || (q2 !== 61 && c2 < 0) || (q3 !== 61 && c3 < 0)) return null;

    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    out[outIndex++] = (n >> 16) & 0xff;
    if (q2 !== 61) out[outIndex++] = (n >> 8) & 0xff;
    if (q3 !== 61) out[outIndex++] = n & 0xff;
  }

  return out;
}

export function decodeBase64(value: string): Uint8Array | null {
  if (!value.length) return null;

  try {
    return decodeBase64Core(value);
  } catch {
    return null;
  }
}

export function decodeBase64Url(value: string): Uint8Array | null {
  if (!value.length) return null;

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  return decodeBase64Core(padded);
}

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
