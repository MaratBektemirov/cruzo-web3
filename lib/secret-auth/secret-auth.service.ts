import { AbstractService } from "cruzo";

import type { SecretAuthMode } from "../types/secret-auth-state";
import type { PubKey } from "../types/web3-types";
import { generateEd25519KeyPair, signWithEd25519Key } from "./sign";
import type { SecretAuthPubKey } from "./types";

export class SecretAuthService extends AbstractService {
  readonly mode$ = this.newRx<SecretAuthMode>("ephemeral");
  readonly ephemeralPubKey$ = this.newRx<PubKey | null>(null);

  private ephemeralPrivateKey: CryptoKey | null = null;
  private ephemeralKeyRequestId = 0;
  private ephemeralKeyRequest: Promise<PubKey> | null = null;

  getMode(): SecretAuthMode {
    return this.mode$.actual;
  }

  setMode(mode: SecretAuthMode) {
    if (this.mode$.actual === mode) return;
    this.mode$.update(mode);
  }

  getEphemeralPubKey(): PubKey | null {
    return this.ephemeralPubKey$.actual;
  }

  async ensureEphemeralKey(): Promise<PubKey> {
    const existing = this.getEphemeralPubKey();

    if (existing && this.ephemeralPrivateKey) return existing;
    if (this.ephemeralKeyRequest) return this.ephemeralKeyRequest;

    const requestId = ++this.ephemeralKeyRequestId;

    this.ephemeralKeyRequest = generateEd25519KeyPair()
      .then((keyPair) => {
        if (requestId !== this.ephemeralKeyRequestId) {
          return this.ensureEphemeralKey();
        }

        this.ephemeralPrivateKey = keyPair.privateKey;
        this.ephemeralPubKey$.update(keyPair.publicKey);
        this.ephemeralKeyRequest = null;

        return keyPair.publicKey;
      })
      .catch((error: unknown) => {
        if (requestId === this.ephemeralKeyRequestId) {
          this.ephemeralKeyRequest = null;
        }

        throw error;
      });

    return this.ephemeralKeyRequest;
  }

  async refreshEphemeralKey(): Promise<PubKey> {
    this.clearEphemeralKey();
    return this.ensureEphemeralKey();
  }

  clearEphemeralKey() {
    this.ephemeralKeyRequestId += 1;
    this.ephemeralPrivateKey = null;
    this.ephemeralKeyRequest = null;
    this.ephemeralPubKey$.update(null);
  }

  async signEphemeral(
    message: string,
  ): Promise<{ pubKey: SecretAuthPubKey; signature: string; publicKey: PubKey }> {
    const publicKey = await this.ensureEphemeralKey();
    const privateKey = this.ephemeralPrivateKey;

    if (!privateKey) {
      throw new Error("Ephemeral private key is missing");
    }

    return signWithEd25519Key(privateKey, publicKey, message);
  }
}

export const secretAuthService = new SecretAuthService();
