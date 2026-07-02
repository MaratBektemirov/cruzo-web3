import type { PubKeyEncoding } from "../types/web3-types";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array): string {
  if (!bytes.length) return "";

  let result = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;

    result += BASE64[(n >> 18) & 63];
    result += BASE64[(n >> 12) & 63];
    result += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : "=";
    result += i + 2 < bytes.length ? BASE64[n & 63] : "=";
  }

  return result;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function encodeEncodedBytes(bytes: Uint8Array, encoding: PubKeyEncoding): string {
  switch (encoding) {
    case "hex":
      return encodeHex(bytes);
    case "base64":
      return encodeBase64(bytes);
    default:
      throw new Error(`Encoding "${encoding}" is not supported for byte export`);
  }
}
