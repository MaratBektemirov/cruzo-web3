export type PubKeyAlgorithm = "secp256k1" | "Ed25519" | "sr25519";

export type PubKeyEncoding = "hex" | "base64" | "base58";

export type SignableMessage = string | Uint8Array;

export type Web3ProviderId = "eip1193" | "solana" | "tron" | "tonconnect" | (string & {});

export interface PubKey {
  type: PubKeyAlgorithm;
  value: string;
  encoding: PubKeyEncoding;
}

export interface VerifySignedContentOptions {
  signatureEncoding?: PubKeyEncoding;
  /** EIP-191 prefix + keccak256 before secp256k1 verify. Default: true for secp256k1. */
  evmPersonalSign?: boolean;
}

export interface Web3Provider {
  readonly id: Web3ProviderId;

  connect(): Promise<PubKey>;
  disconnect(): Promise<void>;
  signMessage(message: SignableMessage): Promise<string>;
}
