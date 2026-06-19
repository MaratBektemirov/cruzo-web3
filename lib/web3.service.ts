import { AbstractService } from "cruzo";

import {
  isEvmAddressPubKey,
  isSecp256k1PublicKeyPubKey,
  isTronAddressPubKey,
  verifyAccountSignedContent,
} from "./crypto/account-signature";
import { normalizeContent, verifySignedBytes } from "./crypto/verify-signature";
import { Web3Error } from "./errors/web3-error";
import {
  assertSignatureBytes,
  decodePubKeyBytes,
  decodeSignatureBytes,
  isPubKey,
  isValidPubKey,
  isValidPubKeyValue,
  parsePubKey as coercePubKey,
} from "./pub-key";
import {
  createInjectedProvider,
  detectInjectedWallets,
  hasInjectedWallet,
  type InjectedProviderOptions,
  type InjectedWalletKind,
} from "./providers/injected";
import {
  createWalletProvider,
  getWalletModeLabel,
  type WalletKind,
  type WalletProviderOptions,
} from "./providers/wallet";
import type { WalletTransport } from "./providers/wallet-transport";
import type {
  PubKey,
  PubKeyAlgorithm,
  PubKeyEncoding,
  SignableMessage,
  VerifySignedContentOptions,
  Web3Provider,
} from "./types/web3-types";
import type { Web3WalletSlot, Web3WalletTarget } from "./web3-wallet";
import { isCustomWallet } from "./web3-wallet";

export const ALL_BUILTIN_WALLET_SLOTS: readonly Web3WalletSlot[] = [
  { kind: "ethereum", transport: "extension" },
  { kind: "ethereum", transport: "app" },
  { kind: "ton", transport: "extension" },
  { kind: "ton", transport: "app" },
  { kind: "solana", transport: "extension" },
  { kind: "tron", transport: "extension" },
];

export type Web3CustomProviderFactory =
  | Web3Provider
  | (() => Web3Provider | Promise<Web3Provider>);

export type Web3CustomProviderConfig = {
  id: string;
  label: string;
  hint?: string;
  provider: Web3CustomProviderFactory;
};

export type Web3CustomProviderOption = {
  id: string;
  label: string;
  hint: string;
};

export type Web3Config = {
  providers?: Web3WalletSlot[];
  customProviders?: Web3CustomProviderConfig[];
};

export type {
  PubKey,
  PubKeyAlgorithm,
  PubKeyEncoding,
  SignableMessage,
  VerifySignedContentOptions,
  Web3Provider,
  Web3ProviderId,
} from "./types/web3-types";

export type { InjectedProviderOptions, InjectedWalletKind } from "./providers/injected";
export type { WalletKind, WalletProviderOptions, WalletTransport } from "./providers/wallet";
export { detectInjectedWallets, getInjectedWalletLabel, hasInjectedWallet } from "./providers/injected";
export { getWalletModeLabel } from "./providers/wallet";

export { Web3Error } from "./errors/web3-error";
export type { Web3ErrorCode } from "./errors/web3-error";

function assertSignableMessage(message: SignableMessage) {
  if (typeof message === "string") {
    if (!message.length) throw Web3Error.invalidMessage("empty string");
    return;
  }

  if (message instanceof Uint8Array) {
    if (!message.length) throw Web3Error.invalidMessage("empty bytes");
    return;
  }

  throw Web3Error.invalidMessage("expected string or Uint8Array");
}

function assertSignableContent(content: SignableMessage) {
  if (content == null || (typeof content !== "string" && !(content instanceof Uint8Array))) {
    throw Web3Error.invalidMessage("expected string or Uint8Array");
  }

  assertSignableMessage(content);
}

export class Web3Service extends AbstractService {
  readonly userPubKey$ = this.newRx<PubKey | null>(null);
  readonly setup$ = this.newRx(0);

  private provider: Web3Provider | null = null;
  private activeProviderKey: string | null = null;
  private tonManifestUrl: string | null = null;
  private walletConnectProjectId: string | null = null;
  private builtinProviders: Web3WalletSlot[] | null = null;
  private customProviders: Web3CustomProviderConfig[] = [];

  configure(config: Web3Config) {
    this.builtinProviders = config.providers ? [...config.providers] : null;
    this.customProviders = config.customProviders ? [...config.customProviders] : [];
    this.bumpSetup();
    return this;
  }

  reset() {
    this.builtinProviders = null;
    this.customProviders = [];
    this.bumpSetup();
    return this;
  }

  getBuiltinProviders(): Web3WalletSlot[] {
    return this.builtinProviders ? [...this.builtinProviders] : [...ALL_BUILTIN_WALLET_SLOTS];
  }

  getCustomProviders(): readonly Web3CustomProviderConfig[] {
    return this.customProviders;
  }

  listCustomProviderOptions(): Web3CustomProviderOption[] {
    return this.customProviders.map(({ id, label, hint }) => ({
      id,
      label,
      hint: hint ?? "",
    }));
  }

  isBuiltinEnabled(kind: Web3WalletSlot["kind"], transport: Web3WalletSlot["transport"]) {
    return this.getBuiltinProviders().some(
      (slot) => slot.kind === kind && slot.transport === transport,
    );
  }

  getWalletLabel(wallet: Web3WalletTarget) {
    if (isCustomWallet(wallet)) {
      return (
        this.customProviders.find((entry) => entry.id === wallet.providerId)?.label ??
        wallet.providerId
      );
    }

    return getWalletModeLabel(wallet.kind, wallet.transport);
  }

  useProvider(provider: Web3Provider, key: string | null = null) {
    this.provider = provider;
    this.activeProviderKey = key;
    return this;
  }

  private walletProviderKey(kind: WalletKind, transport: WalletTransport) {
    return `${kind}:${transport}`;
  }

  private customProviderKey(providerId: string) {
    return `custom:${providerId}`;
  }

  getProvider() {
    return this.provider;
  }

  setTonManifestUrl(manifestUrl: string) {
    this.tonManifestUrl = manifestUrl;
    this.bumpSetup();
    return this;
  }

  getTonManifestUrl() {
    return this.tonManifestUrl;
  }

  setWalletConnectProjectId(projectId: string) {
    this.walletConnectProjectId = projectId;
    this.bumpSetup();
    return this;
  }

  getWalletConnectProjectId() {
    return this.walletConnectProjectId;
  }

  detectInjectedWallets() {
    return detectInjectedWallets();
  }

  hasInjectedWallet(kind: InjectedWalletKind = "ethereum") {
    return hasInjectedWallet(kind);
  }

  private walletOptions(options: WalletProviderOptions = {}): WalletProviderOptions {
    return {
      tonManifestUrl: options.tonManifestUrl ?? this.tonManifestUrl ?? undefined,
      walletConnectProjectId: options.walletConnectProjectId ?? this.walletConnectProjectId ?? undefined,
    };
  }

  useInjectedProvider(
    kind: InjectedWalletKind = "ethereum",
    options: InjectedProviderOptions = {},
  ) {
    const key = this.walletProviderKey(kind, "extension");

    if (this.provider && this.activeProviderKey === key) {
      return this;
    }

    const provider = createInjectedProvider(
      kind,
      (pubKey) => {
        this.userPubKey$.update(pubKey);
      },
      {
        tonManifestUrl: options.tonManifestUrl ?? this.tonManifestUrl ?? undefined,
      },
    );

    return this.useProvider(provider, key);
  }

  async useWalletProvider(
    kind: WalletKind,
    transport: WalletTransport = "auto",
    options: WalletProviderOptions = {},
  ) {
    const key = this.walletProviderKey(kind, transport);

    if (this.provider && this.activeProviderKey === key) {
      return this;
    }

    const provider = await createWalletProvider(
      kind,
      transport,
      (pubKey) => {
        this.userPubKey$.update(pubKey);
      },
      this.walletOptions(options),
    );

    return this.useProvider(provider, key);
  }

  ensureInjectedProvider(
    kind: InjectedWalletKind = "ethereum",
    options: InjectedProviderOptions = {},
  ) {
    if (!this.provider) this.useInjectedProvider(kind, options);
    return this;
  }

  async connect() {
    const pubKey = await this.requireProvider().connect();
    this.userPubKey$.update(pubKey);
    return pubKey;
  }

  async connectWallet(
    kind: WalletKind,
    transport: WalletTransport = "auto",
    options: WalletProviderOptions = {},
  ) {
    await this.useWalletProvider(kind, transport, options);
    return this.connect();
  }

  async connectInjected(
    kind: InjectedWalletKind = "ethereum",
    options: InjectedProviderOptions = {},
  ) {
    this.ensureInjectedProvider(kind, options);
    return this.connect();
  }

  async disconnect() {
    if (!this.provider) {
      this.userPubKey$.update(null);
      return;
    }

    await this.provider.disconnect();
    this.provider = null;
    this.activeProviderKey = null;
    this.userPubKey$.update(null);
  }

  async signMessage(message: SignableMessage) {
    assertSignableMessage(message);
    return this.requireProvider().signMessage(message);
  }

  async signWallet(
    message: SignableMessage,
    kind: WalletKind,
    transport: WalletTransport = "auto",
    options: WalletProviderOptions = {},
  ) {
    await this.useWalletProvider(kind, transport, options);
    return this.signMessage(message);
  }

  async signInjected(
    message: SignableMessage,
    kind: InjectedWalletKind = "ethereum",
    options: InjectedProviderOptions = {},
  ) {
    this.ensureInjectedProvider(kind, options);
    return this.signMessage(message);
  }

  async useCustomProvider(providerId: string) {
    const key = this.customProviderKey(providerId);

    if (this.provider && this.activeProviderKey === key) {
      return this;
    }

    const provider = await this.resolveCustomProvider(providerId);
    return this.useProvider(provider, key);
  }

  async connectCustom(providerId: string) {
    await this.useCustomProvider(providerId);
    return this.connect();
  }

  async signCustom(message: SignableMessage, providerId: string) {
    await this.useCustomProvider(providerId);
    return this.signMessage(message);
  }

  isPubKey(value: unknown): value is PubKey {
    return isPubKey(value);
  }

  isValidPubKeyValue(value: string, encoding: PubKeyEncoding) {
    return isValidPubKeyValue(value, encoding);
  }

  isValidPubKey(pubKey: PubKey) {
    return isValidPubKey(pubKey);
  }

  parsePubKey(value: unknown) {
    return coercePubKey(value);
  }

  async verifySignedContent(
    content: SignableMessage,
    signature: string,
    pubKey: PubKey,
    options?: VerifySignedContentOptions,
  ) {
    assertSignableContent(content);

    const key = coercePubKey(pubKey);

    if (typeof signature !== "string" || !signature.length) {
      throw Web3Error.invalidSignature("Signature must be a non-empty string");
    }

    if (key.type === "sr25519") {
      throw Web3Error.unsupportedAlgorithm("sr25519 verification is not supported yet");
    }

    const normalized = normalizeContent(content);

    if (key.type === "secp256k1" && (isEvmAddressPubKey(key) || isTronAddressPubKey(key))) {
      return verifyAccountSignedContent(normalized, signature, key, {
        evmPersonalSign: options?.evmPersonalSign ?? isEvmAddressPubKey(key),
      });
    }

    const signatureEncoding = options?.signatureEncoding ?? key.encoding;
    const signatureBytes = decodeSignatureBytes(signature, signatureEncoding);

    assertSignatureBytes(key.type, signatureBytes);

    if (key.type === "Ed25519" && !globalThis.crypto?.subtle) {
      throw Web3Error.unsupportedAlgorithm("Ed25519 verification requires Web Crypto (crypto.subtle)");
    }

    if (key.type === "secp256k1" && !isSecp256k1PublicKeyPubKey(key)) {
      throw Web3Error.invalidPubKey("secp256k1 PubKey must be an EVM/Tron address or a 33/65-byte public key");
    }

    const publicKeyBytes = decodePubKeyBytes(key);

    return verifySignedBytes(
      normalized,
      signatureBytes,
      publicKeyBytes,
      key.type,
      { evmPersonalSign: options?.evmPersonalSign ?? key.type === "secp256k1" },
    );
  }

  private bumpSetup() {
    this.setup$.update((this.setup$.actual ?? 0) + 1);
  }

  private async resolveCustomProvider(providerId: string): Promise<Web3Provider> {
    const entry = this.customProviders.find((item) => item.id === providerId);

    if (!entry) {
      throw Web3Error.customProviderNotFound(providerId);
    }

    const provider = entry.provider;

    return typeof provider === "function" ? await provider() : provider;
  }

  private requireProvider() {
    if (!this.provider) throw Web3Error.noProvider();
    return this.provider;
  }
}

export const web3Service = new Web3Service();
