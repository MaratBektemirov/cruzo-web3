
const U32_MASK = 0xffffffff;

const rotlSH = (h: number, l: number, s: number) => ((h << s) | (l >>> (32 - s))) | 0;
const rotlSL = (h: number, l: number, s: number) => ((l << s) | (h >>> (32 - s))) >>> 0;
const rotlBH = (h: number, l: number, s: number) => ((l << (s - 32)) | (h >>> (64 - s))) | 0;
const rotlBL = (h: number, l: number, s: number) => ((h << (s - 32)) | (l >>> (64 - s))) >>> 0;
const rotlH = (h: number, l: number, s: number) => (s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s));
const rotlL = (h: number, l: number, s: number) => (s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s));

const SHA3_PI: number[] = [];
const SHA3_ROTL: number[] = [];
const SHA3_IOTA_H = new Uint32Array(24);
const SHA3_IOTA_L = new Uint32Array(24);

for (let round = 0, r = 1n, x = 1, y = 0; round < 24; round++) {
  [x, y] = [y, (2 * x + 3 * y) % 5];
  SHA3_PI.push(2 * (5 * y + x));
  SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);

  let t = 0n;

  for (let j = 0; j < 7; j++) {
    r = ((r << 1n) ^ ((r >> 7n) * 0x71n)) % 256n;
    if (r & 2n) t ^= 1n << ((1n << BigInt(j)) - 1n);
  }

  SHA3_IOTA_H[round] = Number(t & BigInt(U32_MASK));
  SHA3_IOTA_L[round] = Number((t >> 32n) & BigInt(U32_MASK));
}

function keccakP(state32: Uint32Array) {
  const bc = new Uint32Array(10);

  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 10; x++) {
      bc[x] = state32[x] ^ state32[x + 10] ^ state32[x + 20] ^ state32[x + 30] ^ state32[x + 40];
    }

    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const b0 = bc[idx0];
      const b1 = bc[idx0 + 1];
      const th = rotlH(b0, b1, 1) ^ bc[idx1];
      const tl = rotlL(b0, b1, 1) ^ bc[idx1 + 1];

      for (let y = 0; y < 50; y += 10) {
        state32[x + y] ^= th;
        state32[x + y + 1] ^= tl;
      }
    }

    let curH = state32[2];
    let curL = state32[3];

    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const th = rotlH(curH, curL, shift);
      const tl = rotlL(curH, curL, shift);
      const index = SHA3_PI[t];
      curH = state32[index];
      curL = state32[index + 1];
      state32[index] = th;
      state32[index + 1] = tl;
    }

    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++) bc[x] = state32[y + x];

      for (let x = 0; x < 10; x++) {
        state32[y + x] ^= ~bc[(x + 2) % 10] & bc[(x + 4) % 10];
      }
    }

    state32[0] ^= SHA3_IOTA_H[round];
    state32[1] ^= SHA3_IOTA_L[round];
  }
}

export function keccak256(input: Uint8Array): Uint8Array {
  const blockLen = 136;
  const state = new Uint8Array(200);
  const state32 = new Uint32Array(state.buffer, state.byteOffset, state.length / 4);
  let pos = 0;

  for (let offset = 0; offset < input.length; ) {
    const take = Math.min(blockLen - pos, input.length - offset);

    for (let i = 0; i < take; i++) {
      state[pos++] ^= input[offset++];
    }

    if (pos === blockLen) {
      keccakP(state32);
      pos = 0;
    }
  }

  state[pos] ^= 0x01;
  state[blockLen - 1] ^= 0x80;
  keccakP(state32);

  return state.slice(0, 32);
}

export function hashEvmPersonalMessage(message: Uint8Array): Uint8Array {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const prefixBytes = new TextEncoder().encode(prefix);
  const payload = new Uint8Array(prefixBytes.length + message.length);

  payload.set(prefixBytes, 0);
  payload.set(message, prefixBytes.length);

  return keccak256(payload);
}
