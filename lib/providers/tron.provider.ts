import type { PubKey, Web3Provider } from "../types/web3-types";
import { toMessageBytes } from "./message-bytes";

export interface TronWeb {
  ready?: boolean;
  defaultAddress?: { base58: string };
  request?(args: { method: string; params?: unknown }): Promise<unknown>;
  trx?: {
    signMessageV2(message: string): Promise<string>;
  };
  toHex?(value: string): string;
}

export interface TronLink {
  ready?: boolean;
  tronWeb?: TronWeb;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

declare global {
  interface Window {
    tronWeb?: TronWeb;
    tronLink?: TronLink;
  }
}

function toHexMessage(message: string | Uint8Array, tronWeb?: TronWeb) {
  const text = message instanceof Uint8Array
    ? new TextDecoder().decode(message)
    : message;

  if (tronWeb?.toHex) return tronWeb.toHex(text);

  const bytes = toMessageBytes(message);
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

export function getInjectedTronLink() {
  return globalThis.window?.tronLink ?? null;
}

export function getInjectedTronWeb() {
  return globalThis.window?.tronWeb ?? globalThis.window?.tronLink?.tronWeb ?? null;
}

export class TronProvider implements Web3Provider {
  readonly id = "tron";

  constructor(
    private tronLink: TronLink,
    private onAccountChange?: (pubKey: PubKey) => void,
  ) {}

  static fromInjected(onAccountChange?: (pubKey: PubKey) => void) {
    const tronLink = getInjectedTronLink();

    if (!tronLink) {
      throw new Error("No injected Tron wallet found (install TronLink)");
    }

    return new TronProvider(tronLink, onAccountChange);
  }

  async connect() {
    await this.requestAccounts();
    const address = this.readAddress();
    this.onAccountChange?.(this.toPubKey(address));
    return this.toPubKey(address);
  }

  async disconnect() {
    // TronLink does not expose a standard disconnect for dApps.
  }

  async signMessage(message: string | Uint8Array) {
    const tronWeb = await this.requireTronWeb();
    const signMessage = tronWeb.trx?.signMessageV2;

    if (!signMessage) {
      throw new Error("Tron wallet does not support signMessageV2");
    }

    const address = this.readAddress();
    const signature = await signMessage.call(tronWeb.trx, toHexMessage(message, tronWeb));

    if (typeof signature !== "string" || !signature.length) {
      throw new Error("Wallet returned an invalid signature");
    }

    if (this.readAddress() !== address) {
      throw new Error("Connected Tron wallet account changed before signing");
    }

    return signature.startsWith("0x") ? signature : signature;
  }

  private async requestAccounts() {
    const response = await this.tronLink.request({ method: "tron_requestAccounts" });

    if (response && typeof response === "object" && "code" in response) {
      const result = response as { code: number; message?: string };

      if (result.code !== 200) {
        throw new Error(result.message || "Tron wallet rejected the connection request");
      }
    }
  }

  private async requireTronWeb() {
    const tronWeb = getInjectedTronWeb();

    if (!tronWeb?.trx) {
      throw new Error("Tron wallet is not ready");
    }

    return tronWeb;
  }

  private readAddress() {
    const address = getInjectedTronWeb()?.defaultAddress?.base58;

    if (!address) {
      throw new Error("Tron wallet is not connected");
    }

    return address;
  }

  private toPubKey(address: string): PubKey {
    return {
      type: "secp256k1",
      value: address,
      encoding: "base58",
    };
  }
}
