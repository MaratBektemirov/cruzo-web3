export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 requires Web Crypto (crypto.subtle)");
  }

  const hash = await crypto.subtle.digest("SHA-256", input as BufferSource);
  return new Uint8Array(hash);
}
