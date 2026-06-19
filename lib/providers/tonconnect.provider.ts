import { TonConnect } from "@tonconnect/sdk";
import { TonConnectUI } from "@tonconnect/ui";
import type { Account } from "@tonconnect/sdk";

import type { PubKey, Web3Provider } from "../types/web3-types";
import { toMessageBytes } from "./message-bytes";
import type { WalletTransport } from "./wallet-transport";

export type TonConnectProviderConfig = {
  manifestUrl: string;
  transport?: WalletTransport;
  jsBridgeKey?: string;
};

const INJECTED_TON_WALLETS = ["tonkeeper", "mytonwallet", "tonhub"] as const;

export function getInjectedTonBridgeKey() {
  for (const key of INJECTED_TON_WALLETS) {
    if (TonConnect.isWalletInjected(key)) return key;
  }

  return null;
}

export function hasInjectedTonWallet() {
  return !!getInjectedTonBridgeKey();
}

export class TonConnectProvider implements Web3Provider {
  readonly id = "tonconnect";

  private ui: TonConnectUI;
  private unsubscribeStatus: (() => void) | null = null;

  constructor(
    private config: TonConnectProviderConfig,
    private onAccountChange?: (pubKey: PubKey) => void,
  ) {
    this.ui = new TonConnectUI({ manifestUrl: config.manifestUrl });
    this.watchStatus();
  }

  static create(
    config: TonConnectProviderConfig,
    onAccountChange?: (pubKey: PubKey) => void,
  ) {
    return new TonConnectProvider(config, onAccountChange);
  }

  async connect() {
    await this.ui.connectionRestored;

    if (this.ui.account) {
      const pubKey = this.toPubKey(this.ui.account);
      this.onAccountChange?.(pubKey);
      return pubKey;
    }

    const transport = this.resolveTransport();

    if (transport === "extension") {
      const jsBridgeKey = this.config.jsBridgeKey ?? getInjectedTonBridgeKey();

      if (!jsBridgeKey) {
        throw new Error("No injected TON wallet found (install Tonkeeper or another TON wallet)");
      }

      return this.waitForAccount(() => {
        void this.ui.connector.connect({ jsBridgeKey });
      });
    }

    return this.waitForAccount(() => {
      void this.ui.openModal();
    });
  }

  async disconnect() {
    await this.ui.disconnect();
  }

  async signMessage(message: string | Uint8Array) {
    await this.ui.connectionRestored;
    const account = this.requireAccount();
    const text = new TextDecoder().decode(toMessageBytes(message));

    const response = await this.ui.signData({
      type: "text",
      text,
      from: account.address,
    });

    if (!response.signature) {
      throw new Error("Wallet returned an invalid signature");
    }

    return response.signature;
  }

  private resolveTransport(): WalletTransport {
    const transport = this.config.transport ?? "auto";

    if (transport !== "auto") return transport;

    return getInjectedTonBridgeKey() ? "extension" : "app";
  }

  private requireAccount() {
    const account = this.ui.account;

    if (!account) {
      throw new Error("TON wallet is not connected");
    }

    return account;
  }

  private waitForAccount(start: () => void) {
    return new Promise<PubKey>((resolve, reject) => {
      const unsubscribe = this.ui.onStatusChange(
        (wallet) => {
          if (!wallet?.account) return;

          unsubscribe();
          const pubKey = this.toPubKey(wallet.account);
          this.onAccountChange?.(pubKey);
          resolve(pubKey);
        },
        (error) => {
          unsubscribe();
          reject(error);
        },
      );

      try {
        start();
      } catch (error) {
        unsubscribe();
        reject(error);
      }
    });
  }

  private toPubKey(account: Account): PubKey {
    if (!account.publicKey) {
      throw new Error("TON wallet did not return a public key");
    }

    return {
      type: "Ed25519",
      value: account.publicKey,
      encoding: "hex",
    };
  }

  private watchStatus() {
    this.unsubscribeStatus = this.ui.onStatusChange((wallet) => {
      if (!wallet?.account) return;
      this.onAccountChange?.(this.toPubKey(wallet.account));
    });
  }
}
