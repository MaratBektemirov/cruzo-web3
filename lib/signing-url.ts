import { isPubKey } from "./pub-key";
import type { WalletKind } from "./providers/wallet";
import type { WalletTransport } from "./providers/wallet-transport";
import type { PubKey, PubKeyAlgorithm, PubKeyEncoding } from "./types/web3-types";
import type { SignerState, SignerWallet } from "./types/signer-state";
import { isCustomWallet } from "./web3-wallet";

export const SIGNING_QUERY_KEY = "s";
export const PAYLOAD_QUERY_KEY = "p";
export const MAX_SIGNING_PAYLOAD_LENGTH = 512;

export type SigningUrlSnapshot = Record<string, SignerState>;

type CompactPubKey = [string, string, string];
type CompactSigner = [string, string, 0 | 1, CompactPubKey | null];
type CompactSnapshot = Record<string, CompactSigner>;

const SIGNER_ID_TO_KEY: Record<string, string> = {
  signer1: "1",
  signer2: "2",
};

const SIGNER_KEY_TO_ID: Record<string, string> = {
  "1": "signer1",
  "2": "signer2",
};

const WALLET_KIND_TO_KEY: Record<WalletKind, string> = {
  ethereum: "e",
  ton: "t",
  solana: "s",
  tron: "r",
};

const WALLET_KEY_TO_KIND = Object.fromEntries(
  Object.entries(WALLET_KIND_TO_KEY).map(([kind, key]) => [key, kind]),
) as Record<string, WalletKind>;

const TRANSPORT_TO_KEY: Record<WalletTransport, string> = {
  extension: "x",
  app: "a",
  auto: "u",
};

const TRANSPORT_KEY_TO_MODE = Object.fromEntries(
  Object.entries(TRANSPORT_TO_KEY).map(([mode, key]) => [key, mode]),
) as Record<string, WalletTransport>;

const CUSTOM_WALLET_TRANSPORT_KEY = "c";

const ALGO_TO_KEY: Record<PubKeyAlgorithm, string> = {
  secp256k1: "k",
  Ed25519: "e",
  sr25519: "r",
};

const ALGO_KEY_TO_TYPE = Object.fromEntries(
  Object.entries(ALGO_TO_KEY).map(([type, key]) => [key, type]),
) as Record<string, PubKeyAlgorithm>;

const ENC_TO_KEY: Record<PubKeyEncoding, string> = {
  hex: "h",
  base64: "b",
  base58: "8",
};

const ENC_KEY_TO_ENCODING = Object.fromEntries(
  Object.entries(ENC_TO_KEY).map(([enc, key]) => [key, enc]),
) as Record<string, PubKeyEncoding>;

function hasSignerData(state: SignerState) {
  return !!(state.pubKey || state.signed || state.wallet);
}

function isSignerState(value: unknown): value is SignerState {
  if (!value || typeof value !== "object") return false;

  const state = value as SignerState;

  if (typeof state.signed !== "boolean") return false;
  if (state.pubKey !== null && !isPubKey(state.pubKey)) return false;

    if (state.wallet != null) {
      if (typeof state.wallet !== "object") return false;

      if (isCustomWallet(state.wallet)) {
        if (!state.wallet.providerId) return false;
      } else if (
        !WALLET_KIND_TO_KEY[state.wallet.kind] ||
        !TRANSPORT_TO_KEY[state.wallet.transport]
      ) {
        return false;
      }
    }

  return true;
}

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function compactPubKey(pubKey: PubKey): CompactPubKey {
  return [ALGO_TO_KEY[pubKey.type], pubKey.value, ENC_TO_KEY[pubKey.encoding]];
}

function expandPubKey(value: CompactPubKey | null): PubKey | null {
  if (!value) return null;

  const [typeKey, keyValue, encKey] = value;
  const type = ALGO_KEY_TO_TYPE[typeKey];
  const encoding = ENC_KEY_TO_ENCODING[encKey];

  if (!type || !encoding) return null;

  return { type, value: keyValue, encoding };
}

function compactWallet(wallet: SignerWallet | null | undefined): [string, string] {
  if (!wallet) return ["", ""];

  if (isCustomWallet(wallet)) {
    return [wallet.providerId, CUSTOM_WALLET_TRANSPORT_KEY];
  }

  return [WALLET_KIND_TO_KEY[wallet.kind], TRANSPORT_TO_KEY[wallet.transport]];
}

function expandWallet(kindKey: string, transportKey: string): SignerWallet | null {
  if (transportKey === CUSTOM_WALLET_TRANSPORT_KEY) {
    if (!kindKey) return null;

    return { type: "custom", providerId: kindKey };
  }

  const kind = WALLET_KEY_TO_KIND[kindKey];
  const transport = TRANSPORT_KEY_TO_MODE[transportKey];

  if (!kind || !transport) return null;

  return { kind, transport };
}

function compactSnapshot(snapshot: SigningUrlSnapshot): CompactSnapshot {
  const compact: CompactSnapshot = {};

  for (const [id, state] of Object.entries(snapshot)) {
    if (!hasSignerData(state)) continue;

    const signerKey = SIGNER_ID_TO_KEY[id] ?? id;
    const [kindKey, transportKey] = compactWallet(state.wallet);
    const pubKey = state.pubKey ? compactPubKey(state.pubKey) : null;

    compact[signerKey] = [kindKey, transportKey, state.signed ? 1 : 0, pubKey];
  }

  return compact;
}

function expandSnapshot(compact: CompactSnapshot): SigningUrlSnapshot {
  const snapshot: SigningUrlSnapshot = {};

  for (const [signerKey, entry] of Object.entries(compact)) {
    if (!Array.isArray(entry) || entry.length !== 4) continue;

    const [kindKey, transportKey, signedFlag, pubKeyValue] = entry;

    if (signedFlag !== 0 && signedFlag !== 1) continue;

    const id = SIGNER_KEY_TO_ID[signerKey] ?? signerKey;
    const wallet = expandWallet(String(kindKey), String(transportKey));
    const pubKey = expandPubKey(pubKeyValue);

    snapshot[id] = {
      pubKey,
      signed: signedFlag === 1,
      wallet,
    };
  }

  return snapshot;
}

function encodeSigningParam(snapshot: SigningUrlSnapshot): string {
  const compact = compactSnapshot(snapshot);

  if (!Object.keys(compact).length) return "";

  return toBase64Url(JSON.stringify(compact));
}

function decodeSigningParam(raw: string): SigningUrlSnapshot | null {
  if (!raw) return null;

  if (raw.startsWith("{")) {
    return decodeLegacySigningParam(raw);
  }

  try {
    const json = fromBase64Url(raw);
    const parsed = JSON.parse(json) as CompactSnapshot;

    if (!parsed || typeof parsed !== "object") return null;

    const snapshot = expandSnapshot(parsed);

    return Object.keys(snapshot).length ? snapshot : null;
  } catch {
    return decodeLegacySigningParam(raw);
  }
}

function decodeLegacySigningParam(raw: string): SigningUrlSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") return null;

    const snapshot: SigningUrlSnapshot = {};

    for (const [id, state] of Object.entries(parsed)) {
      if (isSignerState(state)) snapshot[id] = state;
    }

    return Object.keys(snapshot).length ? snapshot : null;
  } catch {
    return null;
  }
}

export function clampSigningPayload(payload: string): string {
  return payload.slice(0, MAX_SIGNING_PAYLOAD_LENGTH);
}

function encodePayloadParam(payload: string | null | undefined): string {
  if (!payload) return "";

  const clamped = clampSigningPayload(payload);

  if (!clamped) return "";

  return toBase64Url(clamped);
}

export function readPayloadFromUrl(search: string): string | null {
  const qs = search.startsWith("?") ? search.slice(1) : search;

  if (!qs) return null;

  const raw = new URLSearchParams(qs).get(PAYLOAD_QUERY_KEY);

  if (!raw) return null;

  try {
    return clampSigningPayload(fromBase64Url(raw));
  } catch {
    return null;
  }
}

export function readSigningUrl(search: string): SigningUrlSnapshot | null {
  const qs = search.startsWith("?") ? search.slice(1) : search;

  if (!qs) return null;

  const raw = new URLSearchParams(qs).get(SIGNING_QUERY_KEY);

  if (!raw) return null;

  return decodeSigningParam(raw);
}

export function buildSearchWithSigning(
  search: string,
  snapshot: SigningUrlSnapshot,
  payload?: string | null,
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const encoded = encodeSigningParam(snapshot);

  if (encoded) {
    params.set(SIGNING_QUERY_KEY, encoded);
  } else {
    params.delete(SIGNING_QUERY_KEY);
  }

  const payloadEncoded = encodePayloadParam(payload);

  if (payloadEncoded) {
    params.set(PAYLOAD_QUERY_KEY, payloadEncoded);
  } else {
    params.delete(PAYLOAD_QUERY_KEY);
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export function buildSigningPageUrl(
  pathname: string,
  search: string,
  snapshot: SigningUrlSnapshot,
  hashMode = false,
  payload?: string | null,
): string {
  const nextSearch = buildSearchWithSigning(search, snapshot, payload);
  const origin = window.location.origin;

  if (hashMode) {
    const hashRoute = `#/${pathname.replace(/^\//, "")}${nextSearch}`;
    return `${origin}${window.location.pathname}${window.location.search}${hashRoute}`;
  }

  return `${origin}${pathname}${nextSearch}`;
}
