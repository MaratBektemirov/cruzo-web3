import { normalizeSecp256k1Signature } from "./ecdsa-signature";

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

function mod(a: bigint, m = P) {
  const result = a % m;
  return result >= 0n ? result : result + m;
}

function invert(value: bigint, m = P) {
  const n = mod(value, m);

  if (n === 0n) throw new Error("invert(0)");

  return pow2(n, m - 2n, m);
}

function pow2(x: bigint, power: bigint, m = P) {
  let result = 1n;
  let base = mod(x, m);
  let exp = power;

  while (exp > 0n) {
    if (exp & 1n) result = mod(result * base, m);
    base = mod(base * base, m);
    exp >>= 1n;
  }

  return result;
}

function sqrtMod(y: bigint) {
  return pow2(y, (P + 1n) / 4n);
}

type Point = { x: bigint; y: bigint } | null;

const inf: Point = null;

function isValidPoint(point: Point) {
  if (!point) return true;

  const { x, y } = point;

  return mod(y * y) === mod(x * x * x + 7n);
}

function normalizePublicKey(pubKey: Uint8Array): Point | null {
  if (pubKey.length === 65 && pubKey[0] === 4) {
    const x = bytesToBigInt(pubKey.slice(1, 33));
    const y = bytesToBigInt(pubKey.slice(33, 65));
    const point = { x: mod(x), y: mod(y) };

    return isValidPoint(point) ? point : null;
  }

  if (pubKey.length === 33 && (pubKey[0] === 2 || pubKey[0] === 3)) {
    const x = bytesToBigInt(pubKey.slice(1));
    const y2 = mod(x * x * x + 7n);
    let y = sqrtMod(y2);

    if (mod(y & 1n) !== BigInt(pubKey[0] & 1)) {
      y = mod(-y);
    }

    const point = { x, y };

    return isValidPoint(point) ? point : null;
  }

  return null;
}

function pointAdd(a: Point, b: Point): Point {
  if (!a) return b;
  if (!b) return a;

  if (a.x === b.x && mod(a.y + b.y) === 0n) return inf;

  const lambda =
    a.x === b.x && a.y === b.y
      ? mod(3n * a.x * a.x * invert(2n * a.y))
      : mod((b.y - a.y) * invert(b.x - a.x));

  const x = mod(lambda * lambda - a.x - b.x);
  const y = mod(lambda * (a.x - x) - a.y);

  return { x, y };
}

function pointDouble(point: Point): Point {
  return pointAdd(point, point);
}

function pointMultiply(point: Point, scalar: bigint): Point {
  let k = mod(scalar, N);
  let acc: Point = inf;
  let addend: Point = point;

  while (k > 0n) {
    if (k & 1n) acc = pointAdd(acc, addend);
    addend = pointDouble(addend);
    k >>= 1n;
  }

  return acc;
}

function bytesToBigInt(bytes: Uint8Array) {
  let value = 0n;

  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }

  return value;
}

function normalizeSignature(signature: Uint8Array) {
  return normalizeSecp256k1Signature(signature);
}

function bigIntTo32Bytes(value: bigint) {
  const out = new Uint8Array(32);
  let v = mod(value);

  for (let index = 31; index >= 0; index--) {
    out[index] = Number(v & 0xffn);
    v >>= 8n;
  }

  return out;
}

function pointToUncompressedBytes(point: Point) {
  if (!point) return null;

  const out = new Uint8Array(65);
  out[0] = 4;
  out.set(bigIntTo32Bytes(point.x), 1);
  out.set(bigIntTo32Bytes(point.y), 33);
  return out;
}

function decompressRecoveryPoint(x: bigint, recoveryBit: number): Point | null {
  const y2 = mod(x * x * x + 7n);
  let y = sqrtMod(y2);

  if (mod(y & 1n) !== BigInt(recoveryBit)) {
    y = mod(-y);
  }

  const point = { x: mod(x), y };

  return isValidPoint(point) ? point : null;
}

export function recoverSecp256k1PublicKey(
  messageHash: Uint8Array,
  signature: Uint8Array,
  recoveryId?: number,
) {
  if (messageHash.length !== 32) return null;

  const normalizedSignature = normalizeSignature(signature);

  if (!normalizedSignature) return null;

  const r = bytesToBigInt(normalizedSignature.slice(0, 32));
  const s = bytesToBigInt(normalizedSignature.slice(32, 64));

  if (r <= 0n || r >= N || s <= 0n || s >= N) return null;

  const hash = mod(bytesToBigInt(messageHash), N);
  const attempts = recoveryId === undefined ? [0, 1] : [recoveryId];
  const generator = { x: mod(GX), y: mod(GY) };

  for (const recId of attempts) {
    const x = mod(r + BigInt(recId) * N);

    if (x >= P) continue;

    const recoveryPoint = decompressRecoveryPoint(x, recId);

    if (!recoveryPoint) continue;

    const rInv = invert(r, N);
    const u1 = mod(N - mod(hash * rInv, N), N);
    const u2 = mod(s * rInv, N);
    const recovered = pointAdd(pointMultiply(generator, u1), pointMultiply(recoveryPoint, u2));
    const bytes = pointToUncompressedBytes(recovered);

    if (bytes) return bytes;
  }

  return null;
}

export function verifySecp256k1(
  signature: Uint8Array,
  messageHash: Uint8Array,
  publicKey: Uint8Array
) {
  if (messageHash.length !== 32) return false;

  const normalizedSignature = normalizeSignature(signature);

  if (!normalizedSignature) return false;

  const r = bytesToBigInt(normalizedSignature.slice(0, 32));
  const s = bytesToBigInt(normalizedSignature.slice(32, 64));

  if (r <= 0n || r >= N || s <= 0n || s >= N) return false;

  const point = normalizePublicKey(publicKey);

  if (!point) return false;

  const hash = mod(bytesToBigInt(messageHash), N);
  const w = invert(s, N);
  const u1 = mod(hash * w, N);
  const u2 = mod(r * w, N);
  const generator = { x: mod(GX), y: mod(GY) };
  const recovered = pointAdd(pointMultiply(generator, u1), pointMultiply(point, u2));

  if (!recovered) return false;

  return mod(recovered.x, N) === r;
}
