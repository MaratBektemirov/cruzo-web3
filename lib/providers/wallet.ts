import type { PubKey, Web3Provider } from "../types/web3-types";
import { Eip1193Provider, getInjectedEthereum } from "./eip1193.provider";
import { createInjectedProvider, hasInjectedWallet, type InjectedWalletKind } from "./injected";
import { SolanaProvider } from "./solana.provider";
import { TonConnectProvider } from "./tonconnect.provider";
import { TronProvider } from "./tron.provider";
import { WalletConnectEthereumProvider } from "./walletconnect-ethereum.provider";
import type { WalletTransport } from "./wallet-transport";

export type { WalletTransport } from "./wallet-transport";

export type WalletProviderOptions = {
  tonManifestUrl?: string;
  walletConnectProjectId?: string;
};

export type WalletKind = InjectedWalletKind;

function resolveTransport(kind: WalletKind, transport: WalletTransport): WalletTransport {
  if (transport !== "auto") return transport;

  if (kind === "ethereum") {
    return getInjectedEthereum() ? "extension" : "app";
  }

  if (kind === "ton") {
    return hasInjectedWallet("ton") ? "extension" : "app";
  }

  return hasInjectedWallet(kind) ? "extension" : "extension";
}

export async function createWalletProvider(
  kind: WalletKind,
  transport: WalletTransport,
  onAccountChange?: (pubKey: PubKey) => void,
  options: WalletProviderOptions = {},
): Promise<Web3Provider> {
  const resolved = resolveTransport(kind, transport);

  if (kind === "ethereum" && resolved === "app") {
    const projectId = options.walletConnectProjectId;

    if (!projectId) {
      throw new Error("Ethereum mobile wallet requires walletConnectProjectId");
    }

    return WalletConnectEthereumProvider.create({ projectId }, onAccountChange);
  }

  if (kind === "ton") {
    const manifestUrl = options.tonManifestUrl;

    if (!manifestUrl) {
      throw new Error("TON wallet requires tonManifestUrl (Ton Connect manifest)");
    }

    return TonConnectProvider.create(
      { manifestUrl, transport: resolved },
      onAccountChange,
    );
  }

  if (resolved === "app") {
    throw new Error(`${kind} mobile wallet is not supported yet`);
  }

  return createInjectedProvider(kind, onAccountChange, {
    tonManifestUrl: options.tonManifestUrl,
  });
}

export function getWalletModeLabel(kind: WalletKind, transport: WalletTransport = "auto") {
  const resolved = resolveTransport(kind, transport);

  if (kind === "ethereum") {
    return resolved === "app"
      ? "Ethereum app (WalletConnect)"
      : "Ethereum extension (MetaMask and EIP-1193 wallets)";
  }

  if (kind === "ton") {
    return resolved === "app"
      ? "TON app (Tonkeeper and other TON wallets)"
      : "TON extension (Tonkeeper and other TON wallets)";
  }

  if (kind === "solana") return "Solana extension (Phantom and other Solana wallets)";
  if (kind === "tron") return "Tron extension (TronLink)";

  return kind;
}
