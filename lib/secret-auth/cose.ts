type CborValue = number | Uint8Array | Map<number, CborValue>;

function readLength(bytes: Uint8Array, offset: number, additional: number): [number, number] {
  if (additional < 24) return [additional, offset];

  if (additional === 24) return [bytes[offset], offset + 1];
  if (additional === 25) return [bytes[offset] << 8 | bytes[offset + 1], offset + 2];
  if (additional === 26) {
    return [
      (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3],
      offset + 4,
    ];
  }

  throw new Error("Unsupported CBOR length");
}

function decodeCbor(bytes: Uint8Array, offset = 0): [CborValue, number] {
  const initial = bytes[offset];
  const major = initial >> 5;
  const additional = initial & 0x1f;
  let next = offset + 1;

  if (major === 0) {
    const [value, end] = readLength(bytes, next, additional);
    return [value, end];
  }

  if (major === 2) {
    const [length, start] = readLength(bytes, next, additional);
    const value = bytes.slice(start, start + length);
    return [value, start + length];
  }

  if (major === 5) {
    const [length, start] = readLength(bytes, next, additional);
    const map = new Map<number, CborValue>();
    let cursor = start;

    for (let i = 0; i < length; i++) {
      const [key, keyEnd] = decodeCbor(bytes, cursor);

      if (typeof key !== "number") {
        throw new Error("COSE map key must be an integer");
      }

      const [value, valueEnd] = decodeCbor(bytes, keyEnd);
      map.set(key, value);
      cursor = valueEnd;
    }

    return [map, cursor];
  }

  throw new Error("Unsupported CBOR type");
}

function coseEs256ToSpki(x: Uint8Array, y: Uint8Array): Uint8Array {
  const point = new Uint8Array(1 + x.length + y.length);
  point[0] = 0x04;
  point.set(x, 1);
  point.set(y, 1 + x.length);

  const algorithmId = new Uint8Array([
    0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07,
  ]);

  const bitString = new Uint8Array(2 + point.length);
  bitString[0] = 0x03;
  bitString[1] = point.length + 1;
  bitString[2] = 0x00;
  bitString.set(point, 3);

  const spki = new Uint8Array(algorithmId.length + bitString.length + 2);
  spki[0] = 0x30;
  spki[1] = algorithmId.length + bitString.length;
  spki.set(algorithmId, 2);
  spki.set(bitString, 2 + algorithmId.length);

  return spki;
}

export function cosePublicKeyToSpki(coseKeyBytes: Uint8Array): Uint8Array | null {
  try {
    const [value] = decodeCbor(coseKeyBytes);

    if (!(value instanceof Map)) return null;

    const kty = value.get(1);
    const alg = value.get(3);
    const crv = value.get(-1);
    const x = value.get(-2);
    const y = value.get(-3);

    if (kty !== 2 || alg !== -7 || crv !== 1) return null;
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) return null;
    if (x.length !== 32 || y.length !== 32) return null;

    return coseEs256ToSpki(x, y);
  } catch {
    return null;
  }
}
