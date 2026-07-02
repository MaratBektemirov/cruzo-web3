import { hashEvmPersonalMessage, keccak256 } from "./keccak256";
import { recoverSecp256k1PublicKey, verifySecp256k1 } from "./secp256k1-verify";

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

function mod(a: bigint, m = P) {
  const result = a % m;
  return result >= 0n ? result : result + m;
}

function invert(value: bigint, m = P) {
  const n = mod(value, m);
  if (n === 0n) throw new Error("invert(0)");

  let exp = m - 2n;
  let result = 1n;
  let base = n;

  while (exp > 0n) {
    if (exp & 1n) result = mod(result * base, m);
    base = mod(base * base, m);
    exp >>= 1n;
  }

  return result;
}

function sqrtMod(y: bigint) {
  let exp = (P + 1n) / 4n;
  let result = 1n;
  let base = mod(y);
  let power = exp;

  while (power > 0n) {
    if (power & 1n) result = mod(result * base);
    base = mod(base * base);
    power >>= 1n;
  }

  return result;
}

type Point = { x: bigint; y: bigint } | null;

function pointAdd(a: Point, b: Point): Point {
  if (!a) return b;
  if (!b) return a;

  if (a.x === b.x && mod(a.y + b.y) === 0n) return null;

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
  let acc: Point = null;
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

function bigIntTo32Bytes(value: bigint) {
  const out = new Uint8Array(32);
  let v = mod(value, N);

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

function pointToCompressedBytes(point: Point) {
  if (!point) return null;

  const out = new Uint8Array(33);
  out[0] = Number(point.y & 1n) === 0 ? 2 : 3;
  out.set(bigIntTo32Bytes(point.x), 1);
  return out;
}

function randomScalar() {
  const bytes = new Uint8Array(32);

  while (true) {
    crypto.getRandomValues(bytes);
    const scalar = mod(bytesToBigInt(bytes), N);

    if (scalar > 0n) return scalar;
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generatorPoint() {
  return { x: mod(GX), y: mod(GY) };
}

export function deriveSecp256k1PublicKeyBytes(privateKey: Uint8Array, compressed = false) {
  if (privateKey.length !== 32) return null;

  const scalar = mod(bytesToBigInt(privateKey), N);

  if (scalar <= 0n) return null;

  const point = pointMultiply(generatorPoint(), scalar);

  return compressed ? pointToCompressedBytes(point) : pointToUncompressedBytes(point);
}

export function secp256k1EvmAddressFromPrivateKey(privateKey: Uint8Array) {
  const publicKey = deriveSecp256k1PublicKeyBytes(privateKey, false);

  if (!publicKey) return null;

  const hash = keccak256(publicKey.slice(1));

  return `0x${bytesToHex(hash.slice(12))}`;
}

export function signSecp256k1EvmPersonalMessage(privateKey: Uint8Array, message: Uint8Array) {
  if (privateKey.length !== 32) return null;

  const scalar = mod(bytesToBigInt(privateKey), N);

  if (scalar <= 0n) return null;

  const messageHash = hashEvmPersonalMessage(message);
  const z = mod(bytesToBigInt(messageHash), N);
  const generator = generatorPoint();

  for (let attempt = 0; attempt < 64; attempt++) {
    const k = randomScalar();
    const point = pointMultiply(generator, k);

    if (!point) continue;

    const r = mod(point.x, N);

    if (r === 0n) continue;

    const s = mod(invert(k, N) * (z + r * scalar), N);

    if (s === 0n) continue;

    for (const recovery of [0, 1]) {
      const signature = new Uint8Array(65);
      signature.set(bigIntTo32Bytes(r), 0);
      signature.set(bigIntTo32Bytes(s), 32);
      signature[64] = 27 + recovery;

      const recovered = recoverSecp256k1PublicKey(messageHash, signature, recovery);
      const expected = deriveSecp256k1PublicKeyBytes(privateKey, false);

      if (
        recovered?.length === expected?.length &&
        recovered &&
        expected &&
        recovered.every((byte, index) => byte === expected[index])
      ) {
        return `0x${bytesToHex(signature)}`;
      }
    }
  }

  return null;
}

export function isValidSecp256k1PrivateKey(privateKey: Uint8Array) {
  if (privateKey.length !== 32) return false;

  const scalar = mod(bytesToBigInt(privateKey), N);

  return scalar > 0n;
}

export function verifySecp256k1EvmPersonalSignature(
  message: Uint8Array,
  signature: string,
  publicKey: Uint8Array,
) {
  const hash = hashEvmPersonalMessage(message);
  const hex = signature.startsWith("0x") ? signature.slice(2) : signature;

  if (hex.length !== 130) return false;

  const bytes = new Uint8Array(65);

  for (let i = 0; i < 65; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return verifySecp256k1(bytes, hash, publicKey);
}
