export type Web3ErrorCode =
  | "NO_PROVIDER"
  | "NO_WALLET"
  | "INVALID_MESSAGE"
  | "INVALID_PUB_KEY"
  | "INVALID_SIGNATURE"
  | "UNSUPPORTED_ALGORITHM";

export class Web3Error extends Error {
  readonly name = "Web3Error";

  constructor(
    readonly code: Web3ErrorCode,
    message: string,
  ) {
    super(message);
  }

  static noProvider() {
    return new Web3Error("NO_PROVIDER", "Web3 provider is not set");
  }

  static noWallet() {
    return new Web3Error(
      "NO_WALLET",
      "No injected wallet found (install MetaMask or another EIP-1193 wallet)",
    );
  }

  static invalidMessage(detail: string) {
    return new Web3Error("INVALID_MESSAGE", `Message must be a non-empty string or Uint8Array (${detail})`);
  }

  static invalidPubKey(message: string) {
    return new Web3Error("INVALID_PUB_KEY", message);
  }

  static invalidSignature(message: string) {
    return new Web3Error("INVALID_SIGNATURE", message);
  }

  static unsupportedAlgorithm(message: string) {
    return new Web3Error("UNSUPPORTED_ALGORITHM", message);
  }

  static customProviderNotFound(providerId: string) {
    return new Web3Error("NO_PROVIDER", `Custom Web3 provider "${providerId}" is not configured`);
  }
}
