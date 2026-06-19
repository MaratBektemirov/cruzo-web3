import type { WalletKind } from "./providers/wallet";
import type { WalletTransport } from "./providers/wallet-transport";

export type Web3WalletSlot = {
  kind: WalletKind;
  transport: WalletTransport;
};

export type Web3BuiltinWallet = {
  kind: WalletKind;
  transport: WalletTransport;
};

export type Web3CustomWallet = {
  type: "custom";
  providerId: string;
};

export type Web3WalletTarget = Web3BuiltinWallet | Web3CustomWallet;

export function isCustomWallet(
  wallet: Web3WalletTarget | null | undefined,
): wallet is Web3CustomWallet {
  return !!wallet && "type" in wallet && wallet.type === "custom";
}

export function isBuiltinWallet(
  wallet: Web3WalletTarget | null | undefined,
): wallet is Web3BuiltinWallet {
  return !!wallet && !isCustomWallet(wallet);
}
