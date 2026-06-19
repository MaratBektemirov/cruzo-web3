export function toMessageBytes(message: string | Uint8Array) {
  return message instanceof Uint8Array ? message : new TextEncoder().encode(message);
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
