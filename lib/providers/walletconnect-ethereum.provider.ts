import EthereumProvider from "@walletconnect/ethereum-provider";

import type { PubKey, Web3Provider } from "../types/web3-types";
import { Eip1193Provider, type Eip1193Like } from "./eip1193.provider";

export type WalletConnectEthereumConfig = {
  projectId: string;
  chains?: number[];
};

export class WalletConnectEthereumProvider implements Web3Provider {
  readonly id = "walletconnect";

  private constructor(private inner: Eip1193Provider) {}

  static async create(
    config: WalletConnectEthereumConfig,
    onAccountChange?: (pubKey: PubKey) => void,
  ) {
    const wc = await EthereumProvider.init({
      projectId: config.projectId,
      chains: config.chains ?? [1],
      optionalChains: [137, 10, 42161],
      showQrModal: true,
      metadata: {
        name: document.title || "cruzo-web3",
        description: "cruzo-web3 wallet signing",
        url: window.location.origin,
        icons: [],
      },
    });

    return new WalletConnectEthereumProvider(
      Eip1193Provider.fromEthereum(wc as Eip1193Like, onAccountChange),
    );
  }

  connect() {
    return this.inner.connect();
  }

  disconnect() {
    return this.inner.disconnect();
  }

  signMessage(message: string | Uint8Array) {
    return this.inner.signMessage(message);
  }
}
