import type { PubKey, Web3Provider } from "../types/web3-types";

export interface Eip1193Like {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Like;
  }
}

function toHexMessage(message: string | Uint8Array) {
  const bytes = message instanceof Uint8Array ? message : new TextEncoder().encode(message);
  let hex = "0x";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

export function getInjectedEthereum() {
  return globalThis.window?.ethereum ?? null;
}

export class Eip1193Provider implements Web3Provider {
  readonly id = "eip1193";

  private account: string | null = null;
  private onAccountsChanged: ((accounts: unknown) => void) | null = null;

  constructor(
    private ethereum: Eip1193Like,
    private onAccountChange?: (pubKey: PubKey) => void
  ) {}

  static fromInjected(onAccountChange?: (pubKey: PubKey) => void) {
    const ethereum = getInjectedEthereum();

    if (!ethereum) {
      throw new Error("No injected EIP-1193 wallet found (MetaMask and others)");
    }

    return new Eip1193Provider(ethereum, onAccountChange);
  }

  static fromEthereum(ethereum: Eip1193Like, onAccountChange?: (pubKey: PubKey) => void) {
    return new Eip1193Provider(ethereum, onAccountChange);
  }

  async connect() {
    const accounts = await this.requestAccounts();
    const account = accounts[0];

    if (!account) {
      throw new Error("Wallet returned no accounts");
    }

    this.account = normalizeAddress(account);
    this.watchAccounts();

    return this.toPubKey(this.account);
  }

  async disconnect() {
    this.unwatchAccounts();
    this.account = null;
  }

  async signMessage(message: string | Uint8Array) {
    const account = await this.getAccount();

    const signature = await this.ethereum.request({
      method: "personal_sign",
      params: [toHexMessage(message), account],
    });

    if (typeof signature !== "string" || !signature.length) {
      throw new Error("Wallet returned an invalid signature");
    }

    return signature.startsWith("0x") ? signature : `0x${signature}`;
  }

  getAccount() {
    if (this.account) return Promise.resolve(this.account);

    return this.requestAccounts().then((accounts) => {
      const account = accounts[0];

      if (!account) {
        throw new Error("Wallet is not connected");
      }

      this.account = normalizeAddress(account);
      this.watchAccounts();

      return this.account;
    });
  }

  private async requestAccounts() {
    const accounts = await this.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (!Array.isArray(accounts)) {
      throw new Error("Wallet returned an invalid accounts list");
    }

    return accounts.filter((account): account is string => typeof account === "string");
  }

  private toPubKey(address: string): PubKey {
    return {
      type: "secp256k1",
      value: address,
      encoding: "hex",
    };
  }

  private watchAccounts() {
    if (!this.ethereum.on || this.onAccountsChanged) return;

    this.onAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
        this.account = null;
        return;
      }

      this.account = normalizeAddress(accounts[0]);
      this.onAccountChange?.(this.toPubKey(this.account));
    };

    this.ethereum.on("accountsChanged", this.onAccountsChanged);
  }

  private unwatchAccounts() {
    if (!this.onAccountsChanged || !this.ethereum.removeListener) return;

    this.ethereum.removeListener("accountsChanged", this.onAccountsChanged);
    this.onAccountsChanged = null;
  }
}
