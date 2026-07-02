import type { PubKey } from "../types/web3-types";

export function pubKeyToText(pubKey: PubKey | null): string {
  if (!pubKey?.value) return "—";

  const value = pubKey.value;

  if (pubKey.type === "secp256k1" && value.length === 40 && !value.startsWith("0x")) {
    return `0x${value}`;
  }

  return value;
}
