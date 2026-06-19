export function parseEcdsaDerSignature(signature: Uint8Array): Uint8Array | null {
  if (signature.length === 64) return signature;
  if (signature.length === 65) return signature.slice(0, 64);
  if (signature[0] !== 0x30) return null;

  let offset = 2;

  if (signature[1] & 0x80) {
    offset = 2 + (signature[1] & 0x7f);
  }

  const readInt = () => {
    if (signature[offset] !== 0x02) return null;

    const len = signature[offset + 1];
    let bytes = signature.slice(offset + 2, offset + 2 + len);

    while (bytes.length > 32 && bytes[0] === 0) {
      bytes = bytes.slice(1);
    }

    const out = new Uint8Array(32);
    out.set(bytes, 32 - bytes.length);
    offset = offset + 2 + len;
    return out;
  };

  const r = readInt();
  const s = readInt();

  if (!r || !s) return null;

  const out = new Uint8Array(64);
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

export function normalizeSecp256k1Signature(signature: Uint8Array): Uint8Array | null {
  if (signature.length === 64 || signature.length === 65) {
    return signature.length === 65 ? signature.slice(0, 64) : signature;
  }

  return parseEcdsaDerSignature(signature);
}
