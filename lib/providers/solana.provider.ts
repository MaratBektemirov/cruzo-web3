import type { PubKey, Web3Provider } from "../types/web3-types";
import { bytesToBase64, toMessageBytes } from "./message-bytes";

export interface SolanaPublicKey {
  toBase58(): string;
}

export interface SolanaWallet {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: SolanaPublicKey | null;
  connect(): Promise<{ publicKey: SolanaPublicKey }>;
  disconnect(): Promise<void>;
  signMessage(
    message: Uint8Array,
    display?: "utf8" | "hex",
  ): Promise<{ signature: Uint8Array }>;
  on?(event: "accountChanged", listener: (publicKey: SolanaPublicKey | null) => void): void;
  removeListener?(
    event: "accountChanged",
    listener: (publicKey: SolanaPublicKey | null) => void,
  ): void;
}

declare global {
  interface Window {
    solana?: SolanaWallet;
    phantom?: { solana?: SolanaWallet };
  }
}

export function getInjectedSolana() {
  return globalThis.window?.phantom?.solana ?? globalThis.window?.solana ?? null;
}

export class SolanaProvider implements Web3Provider {
  readonly id = "solana";

  private accountListener: ((publicKey: SolanaPublicKey | null) => void) | null = null;

  constructor(
    private wallet: SolanaWallet,
    private onAccountChange?: (pubKey: PubKey) => void,
  ) {}

  static fromInjected(onAccountChange?: (pubKey: PubKey) => void) {
    const wallet = getInjectedSolana();

    if (!wallet) {
      throw new Error("No injected Solana wallet found (install Phantom or another Solana wallet)");
    }

    return new SolanaProvider(wallet, onAccountChange);
  }

  async connect() {
    const { publicKey } = await this.wallet.connect();
    this.watchAccount();
    return this.toPubKey(publicKey);
  }

  async disconnect() {
    this.unwatchAccount();
    await this.wallet.disconnect();
  }

  async signMessage(message: string | Uint8Array) {
    const publicKey = await this.requirePublicKey();
    const bytes = toMessageBytes(message);

    const { signature } = await this.wallet.signMessage(bytes, "utf8");

    if (!(signature instanceof Uint8Array) || !signature.length) {
      throw new Error("Wallet returned an invalid signature");
    }

    if (publicKey.toBase58() !== (this.wallet.publicKey?.toBase58() ?? "")) {
      throw new Error("Connected Solana wallet account changed before signing");
    }

    return bytesToBase64(signature);
  }

  private async requirePublicKey() {
    if (this.wallet.publicKey) return this.wallet.publicKey;

    const { publicKey } = await this.wallet.connect();
    return publicKey;
  }

  private toPubKey(publicKey: SolanaPublicKey): PubKey {
    return {
      type: "Ed25519",
      value: publicKey.toBase58(),
      encoding: "base58",
    };
  }

  private watchAccount() {
    if (!this.wallet.on || this.accountListener) return;

    this.accountListener = (publicKey) => {
      if (!publicKey) return;
      this.onAccountChange?.(this.toPubKey(publicKey));
    };

    this.wallet.on("accountChanged", this.accountListener);
  }

  private unwatchAccount() {
    if (!this.accountListener || !this.wallet.removeListener) return;

    this.wallet.removeListener("accountChanged", this.accountListener);
    this.accountListener = null;
  }
}
