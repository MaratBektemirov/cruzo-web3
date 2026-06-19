import type { PubKey, Web3Provider } from "../types/web3-types";
import { Eip1193Provider, getInjectedEthereum } from "./eip1193.provider";
import { SolanaProvider, getInjectedSolana } from "./solana.provider";
import { TonConnectProvider, getInjectedTonBridgeKey, hasInjectedTonWallet } from "./tonconnect.provider";
import { TronProvider, getInjectedTronLink } from "./tron.provider";

export type InjectedWalletKind = "ethereum" | "solana" | "tron" | "ton";

export type InjectedProviderOptions = {
  tonManifestUrl?: string;
};

const WALLET_LABELS: Record<InjectedWalletKind, string> = {
  ethereum: "Ethereum (MetaMask and EIP-1193 wallets)",
  solana: "Solana (Phantom and other Solana wallets)",
  tron: "Tron (TronLink)",
  ton: "TON (Tonkeeper and other TON wallets)",
};

export function getInjectedWalletLabel(kind: InjectedWalletKind) {
  return WALLET_LABELS[kind];
}

export function hasInjectedWallet(kind: InjectedWalletKind) {
  switch (kind) {
    case "ethereum":
      return !!getInjectedEthereum();
    case "solana":
      return !!getInjectedSolana();
    case "tron":
      return !!getInjectedTronLink();
    case "ton":
      return hasInjectedTonWallet();
  }
}

export function detectInjectedWallets() {
  const kinds: InjectedWalletKind[] = ["ethereum", "solana", "tron", "ton"];
  return kinds.filter(hasInjectedWallet);
}

export function createInjectedProvider(
  kind: InjectedWalletKind,
  onAccountChange?: (pubKey: PubKey) => void,
  options: InjectedProviderOptions = {},
) {
  switch (kind) {
    case "ethereum":
      return Eip1193Provider.fromInjected(onAccountChange);
    case "solana":
      return SolanaProvider.fromInjected(onAccountChange);
    case "tron":
      return TronProvider.fromInjected(onAccountChange);
    case "ton": {
      const manifestUrl = options.tonManifestUrl;

      if (!manifestUrl) {
        throw new Error("TON wallet requires tonManifestUrl (Ton Connect manifest)");
      }

      return TonConnectProvider.create(
        { manifestUrl, transport: "extension", jsBridgeKey: getInjectedTonBridgeKey() ?? undefined },
        onAccountChange,
      );
    }
  }
}

export function asWeb3Provider(provider: Web3Provider) {
  return provider;
}
