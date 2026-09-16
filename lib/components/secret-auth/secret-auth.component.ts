import styles from "./secret-auth.component.module.css";

import { AbstractComponent, componentsRegistryService, i18nService, RxBucket, toastService } from "cruzo";
import { UI_KIT } from "cruzo/ui-components/const";
import { ButtonGroupComponent, ButtonGroupConfig } from "cruzo/ui-components/button-group";
import { ModalComponent } from "cruzo/ui-components/modal";
import "cruzo/ui-components/button-group";
import "cruzo/ui-components/toast";

import { CopyIconComponent } from "../icons/copy-icon.component";
import { RefreshIconComponent } from "../icons/refresh-icon.component";
import { Web3WalletPickerComponent } from "../web3-wallet-picker/web3-wallet-picker.component";
import {
  WALLET_ACTIVE_SIGNER_ID,
  WALLET_MODAL_ID,
  WALLET_PICKER_ID,
  web3WalletPickerBucket,
} from "../web3-wallet-picker/web3-wallet-picker.bucket";
import { formatSecretAuthChallenge } from "../../secret-auth/challenge";
import * as secretAuthProof from "../../secret-auth/proof";
import * as secretAuthPubKey from "../../secret-auth/pub-key";
import {
  exportEd25519PrivateKeyBase64,
  generateEd25519KeyPair,
  previewPublicKey,
  signWithPrivateKey,
} from "../../secret-auth/sign";
import { secretAuthService } from "../../secret-auth/secret-auth.service";
import {
  getStoredWebAuthnCredential,
  isWebAuthnAvailable,
  registerWebAuthnPasskey,
  signMessageWithWebAuthn,
} from "../../secret-auth/webauthn";
import type { SecretAuthMode, SecretAuthState } from "../../types/secret-auth-state";
import type { SignerWallet } from "../../types/signer-state";
import { pubKeyToText } from "../../utils/format-pub-key";
import { formatWalletError, isWalletUserCancellation } from "../../utils/wallet-error";
import { web3Service } from "../../web3.service";
import { isCustomWallet, isBuiltinWallet } from "../../web3-wallet";
import i18n from "./secret-auth.component.i18n.json";

export interface SecretAuthConfig {
  title?: string;
  devMode?: boolean;
}

const MODE_COMPONENT_ID = "secretAuthMode";

export class SecretAuthComponent extends AbstractComponent<SecretAuthConfig, any, SecretAuthState> {
  static selector = "secret-auth-component";

  hasOuterBucket = true;
  hasConfig = true;

  dependencies = new Set([
    "modal-component",
    ButtonGroupComponent.selector,
    Web3WalletPickerComponent.selector,
    CopyIconComponent.selector,
    RefreshIconComponent.selector,
  ]);

  i18n$ = i18nService.connect(this, i18n);

  title$ = this.newRx(String(i18n.en.defaultTitle));
  devMode$ = this.newRx(false);
  challengeText$ = this.newRx("");
  mode$ = this.newRx<SecretAuthMode>("ephemeral");
  busy$ = this.newRx(false);
  error$ = this.newRx("");
  walletLabel$ = this.newRx(String(i18n.en.noWalletSelected));
  pubKeyLabel$ = this.newRx("—");
  proofJson$ = this.newRx("");
  privateKey$ = this.newRx("");
  keyPubKeyLabel$ = this.newRx("—");
  ephemeralPubKeyLabel$ = this.newRx("—");
  passkeyLabel$ = this.newRx(String(i18n.en.noPasskey));
  webauthnAvailable$ = this.newRx(isWebAuthnAvailable());

  modeBucket = new RxBucket({
    [MODE_COMPONENT_ID]: {
      config: ButtonGroupConfig({
        items: [
          { label: String(i18n.en.modeEphemeral), value: "ephemeral" },
          { label: String(i18n.en.modeWallet), value: "wallet" },
          { label: String(i18n.en.modeKey), value: "key" },
          { label: String(i18n.en.modePasskey), value: "passkey" },
        ],
      }),
    },
  });

  private selectedWallet: SignerWallet | null = null;

  private walletPickEvents$ = this.newRxEventFromBucketByIndex(
    web3WalletPickerBucket,
    WALLET_PICKER_ID,
    "web3WalletSelected",
  );

  constructor() {
    super();

    this.newRxFunc((events) => {
      const event = events?.["0"];

      if (!event) return;

      if (web3WalletPickerBucket.getValue(WALLET_ACTIVE_SIGNER_ID) !== this.id) return;

      events["0"] = null;
      this.onWalletSelected(event.data);
    }, this.walletPickEvents$);
  }

  getHTML() {
    const k = UI_KIT;

    return `<div class="${styles.secretAuth}">
        <div class="${styles.head}">
          <h3 class="${styles.title}">{{ root.title$::rx }}</h3>
          <span class="${styles.status} ${styles.statusVerified}"
            attached="{{ root.state$::rx?.signed }}">
            <span class="${styles.check}" aria-hidden="true">✓</span>
            <span>{{ root.i18n$::rx.signed }}</span>
          </span>
          <span class="${styles.status}"
            attached="{{ !root.state$::rx?.signed }}">
            <span class="${styles.check}" aria-hidden="true">✓</span>
            <span>{{ root.i18n$::rx.notSigned }}</span>
          </span>
        </div>

        <div class="${styles.challenge}">
          <span class="${styles.label}">{{ root.i18n$::rx.challenge }}</span>
          <pre class="${styles.challengeText}">{{ root.challengeText$::rx }}</pre>
        </div>

        <div class="${styles.modes} {{ root.state$::rx?.signed || root.busy$::rx ? '${styles.modesDisabled}' : '' }}">
          <button-group-component
            component-id="${MODE_COMPONENT_ID}"
            bucket-id="${this.modeBucket.id}">
          </button-group-component>
        </div>

        <div class="${styles.panelStage}">
          <div class="${styles.panel} ${styles.panelEnter}" attached="{{ root.mode$::rx === 'ephemeral' }}">
            <p class="${styles.hint}">{{ root.i18n$::rx.ephemeralHint }}</p>
            <div class="${styles.pubkeyRow}">
              <span class="${styles.label}">{{ root.i18n$::rx.pubKey }}</span>
              <div class="${styles.pubkeyWithCopy}">
                <code class="${styles.pubkeyValue}">{{ root.ephemeralPubKeyLabel$::rx }}</code>
                <div
                  class="${styles.copyBtn}"
                  title="{{ root.i18n$::rx.copyPubKey }}"
                  attached="{{ root.ephemeralPubKeyLabel$::rx !== '—' }}"
                  onclick="{{ root.copyEphemeralPubKey(event.currentTarget) }}">
                  <copy-icon></copy-icon>
                </div>
                <div
                  class="${styles.copyBtn}"
                  title="{{ root.i18n$::rx.refreshKey }}"
                  attached="{{ !root.state$::rx?.signed && !root.busy$::rx }}"
                  onclick="{{ root.refreshEphemeralKey() }}">
                  <refresh-icon></refresh-icon>
                </div>
              </div>
            </div>
            <div class="${styles.actions}">
              <button type="button"
                class="${k}_button ${k}_button-s ${k}_button-primary"
                disabled="{{ root.busy$::rx || root.state$::rx?.signed || root.ephemeralPubKeyLabel$::rx === '—' }}"
                onclick="{{ root.signWithEphemeral() }}">{{ root.i18n$::rx.signChallenge }}</button>
            </div>
          </div>

          <div class="${styles.panel} ${styles.panelEnter}" attached="{{ root.mode$::rx === 'wallet' }}">
            <p class="${styles.hint}">{{ root.i18n$::rx.walletHint }}</p>
            <div class="${styles.pubkeyRow}">
              <span class="${styles.label}">{{ root.i18n$::rx.wallet }}</span>
              <span class="${styles.pubkeyValue}">{{ root.walletLabel$::rx }}</span>
            </div>
            <div class="${styles.pubkeyRow}">
              <span class="${styles.label}">{{ root.i18n$::rx.pubKey }}</span>
              <code class="${styles.pubkeyValue}">{{ root.pubKeyLabel$::rx }}</code>
            </div>
            <div class="${styles.actions}">
              <button type="button"
                class="${k}_button ${k}_button-s ${k}_button-secondary"
                disabled="{{ root.busy$::rx || root.state$::rx?.signed }}"
                onclick="{{ root.connectWallet() }}">{{ root.i18n$::rx.connectWallet }}</button>
              <button type="button"
                class="${k}_button ${k}_button-s ${k}_button-primary"
                disabled="{{ root.busy$::rx || !root.state$::rx?.pubKey || root.state$::rx?.signed }}"
                onclick="{{ root.signWithWallet() }}">{{ root.i18n$::rx.signChallenge }}</button>
            </div>
          </div>

          <div class="${styles.panel} ${styles.panelEnter}" attached="{{ root.mode$::rx === 'key' }}">
            <p class="${styles.hint}">{{ root.i18n$::rx.keyHint }}</p>
            <div class="${styles.field}">
              <div class="${styles.fieldHead}">
                <span class="${styles.label}">{{ root.i18n$::rx.privateKey }}</span>
                <div
                  class="${styles.copyBtn}"
                  title="{{ root.i18n$::rx.copyPrivateKey }}"
                  attached="{{ root.privateKey$::rx }}"
                  onclick="{{ root.copyPrivateKey(event.currentTarget) }}">
                  <copy-icon></copy-icon>
                </div>
              </div>
              <textarea
                class="${k}_textarea ${styles.textarea}"
                rows="3"
                placeholder="{{ root.i18n$::rx.privateKeyPlaceholder }}"
                oninput="{{ root.onPrivateKeyInput(event.currentTarget) }}">{{ root.privateKey$::rx }}</textarea>
              <div class="${styles.fieldActions}">
                <button type="button"
                  class="${k}_button ${k}_button-s ${k}_button-secondary"
                  disabled="{{ root.busy$::rx || root.state$::rx?.signed }}"
                  onclick="{{ root.generateKey() }}">{{ root.i18n$::rx.generate }}</button>
              </div>
            </div>
            <div class="${styles.pubkeyRow}">
              <span class="${styles.label}">{{ root.i18n$::rx.pubKey }}</span>
              <div class="${styles.pubkeyWithCopy}">
                <code class="${styles.pubkeyValue}">{{ root.keyPubKeyLabel$::rx }}</code>
                <div
                  class="${styles.copyBtn}"
                  title="{{ root.i18n$::rx.copyPubKey }}"
                  attached="{{ root.keyPubKeyLabel$::rx !== '—' }}"
                  onclick="{{ root.copyKeyPubKey(event.currentTarget) }}">
                  <copy-icon></copy-icon>
                </div>
              </div>
            </div>
            <div class="${styles.actions}">
              <button type="button"
                class="${k}_button ${k}_button-s ${k}_button-primary"
                disabled="{{ root.busy$::rx || root.state$::rx?.signed }}"
                onclick="{{ root.signWithKey() }}">{{ root.i18n$::rx.signChallenge }}</button>
            </div>
          </div>

          <div class="${styles.panel} ${styles.panelEnter}" attached="{{ root.mode$::rx === 'passkey' }}">
            <p class="${styles.hint}">{{ root.i18n$::rx.passkeyHint }}</p>
            <div class="${styles.pubkeyRow}">
              <span class="${styles.label}">{{ root.i18n$::rx.passkey }}</span>
              <span class="${styles.pubkeyValue}">{{ root.passkeyLabel$::rx }}</span>
            </div>
            <div class="${styles.actions}">
              <button type="button"
                class="${k}_button ${k}_button-s ${k}_button-secondary"
                disabled="{{ root.busy$::rx || root.state$::rx?.signed || !root.webauthnAvailable$::rx }}"
                onclick="{{ root.createPasskey() }}">{{ root.i18n$::rx.createPasskey }}</button>
              <button type="button"
                class="${k}_button ${k}_button-s ${k}_button-primary"
                disabled="{{ root.busy$::rx || root.state$::rx?.signed || !root.webauthnAvailable$::rx }}"
                onclick="{{ root.signWithPasskey() }}">{{ root.i18n$::rx.signChallenge }}</button>
            </div>
          </div>
        </div>

        <div class="${styles.proof} ${styles.panelEnter}"
          attached="{{ root.devMode$::rx && root.state$::rx?.proof }}">
          <span class="${styles.label}">{{ root.i18n$::rx.proofLabel }}</span>
          <pre class="${styles.proofJson}">{{ root.proofJson$::rx }}</pre>
          <div class="${styles.actions}">
            <button type="button"
              class="${k}_button ${k}_button-s ${k}_button-secondary"
              onclick="{{ root.copyProof(event.currentTarget) }}">{{ root.i18n$::rx.copyProofJson }}</button>
          </div>
        </div>

        <p class="${styles.error}" attached="{{ root.error$::rx }}">{{ root.error$::rx }}</p>
      </div>`;
  }

  connectedCallback() {
    componentsRegistryService.connectBucket(this.modeBucket);
    this.modeBucket.setValue(MODE_COMPONENT_ID, "ephemeral");
    this.webauthnAvailable$.update(isWebAuthnAvailable());
    this.syncPasskeyLabel();
    super.connectedCallback();
    this.applyConfig(this.config$.actual);
    this.applyChallenge(this.state$.actual);
    this.syncProofPreview(this.state$.actual);
    this.syncModeFromBucket(this.modeBucket.getValue(MODE_COMPONENT_ID));
    this.prepareEphemeralKey();

    this.rxList ??= [];

    this.modeBucket.newRxValue(
      MODE_COMPONENT_ID,
      (value) => {
        if (this.state$.actual?.signed || this.busy$.actual) return;

        this.syncModeFromBucket(value);
      },
      this.rxList,
      "ephemeral",
    );

    this.newRxFunc((config) => {
      this.applyConfig(config);
    }, this.config$);

    this.newRxFunc((state) => {
      this.applyChallenge(state);
      this.pubKeyLabel$.update(pubKeyToText(state?.pubKey ?? null));
      this.syncProofPreview(state);

      if (state?.mode === "ephemeral" && state.pubKey) {
        this.ephemeralPubKeyLabel$.update(pubKeyToText(state.pubKey));
      }

      if (state?.mode && state.mode !== this.mode$.actual) {
        this.setModeBucketValue(state.mode);
      }

      if (this.mode$.actual === "ephemeral") {
        this.prepareEphemeralKey();
      }
    }, this.state$);

    this.newRxFunc((pubKey) => {
      if (this.mode$.actual !== "ephemeral" || this.state$.actual?.signed) return;

      this.ephemeralPubKeyLabel$.update(pubKeyToText(pubKey));

      if (pubKey) {
        this.syncEphemeralPubKeyState(pubKey);
      }
    }, secretAuthService.ephemeralPubKey$);

    this.newRxFunc(() => {
      this.syncModeLabels();
      this.syncIdleWalletLabel();
      this.syncPasskeyLabel();
      this.applyConfig(this.config$.actual);
    }, this.i18n$);

    this.syncModeLabels();
  }

  private syncModeLabels() {
    const t = this.i18n$.actual;
    const current = this.modeBucket.getValue(MODE_COMPONENT_ID) ?? this.mode$.actual;

    this.modeBucket.setConfig(
      MODE_COMPONENT_ID,
      ButtonGroupConfig({
        items: [
          { label: String(t.modeEphemeral), value: "ephemeral" },
          { label: String(t.modeWallet), value: "wallet" },
          { label: String(t.modeKey), value: "key" },
          { label: String(t.modePasskey), value: "passkey" },
        ],
      }),
    );

    if (current) {
      this.modeBucket.setValue(MODE_COMPONENT_ID, current, "0", true);
    }
  }

  private syncIdleWalletLabel() {
    if (this.selectedWallet || this.state$.actual?.wallet) return;

    this.walletLabel$.update(String(this.i18n$.actual.noWalletSelected));
  }

  private syncModeFromBucket(value: string | null | undefined) {
    const mode = this.parseMode(value);

    if (!mode || mode === this.mode$.actual) return;

    this.error$.update("");
    this.mode$.update(mode);
    secretAuthService.setMode(mode);

    if (mode === "ephemeral") {
      this.prepareEphemeralKey();
    }
  }

  private parseMode(value: string | null | undefined): SecretAuthMode | null {
    if (value === "wallet" || value === "key" || value === "passkey" || value === "ephemeral") {
      return value;
    }

    return null;
  }

  private setModeBucketValue(mode: SecretAuthMode) {
    if (this.modeBucket.getValue(MODE_COMPONENT_ID) === mode) return;

    this.modeBucket.setValue(MODE_COMPONENT_ID, mode, "0", true);
    this.mode$.update(mode);
    secretAuthService.setMode(mode);

    if (mode === "ephemeral") {
      this.prepareEphemeralKey();
    }
  }

  private clearEphemeralKey() {
    secretAuthService.clearEphemeralKey();
    this.ephemeralPubKeyLabel$.update("—");
  }

  private syncEphemeralPubKeyState(publicKey: NonNullable<SecretAuthState["pubKey"]>) {
    const current = this.state$.actual;

    if (
      current?.mode === "ephemeral" &&
      !current.signed &&
      current.pubKey?.type === publicKey.type &&
      current.pubKey?.value === publicKey.value &&
      current.pubKey?.encoding === publicKey.encoding
    ) {
      return;
    }

    this.setPartialState({
      pubKey: publicKey,
      proof: null,
      signed: false,
      mode: "ephemeral",
      wallet: null,
      passkey: null,
    });
  }

  private prepareEphemeralKey() {
    if (this.mode$.actual !== "ephemeral") return;

    if (this.state$.actual?.signed) {
      if (this.state$.actual.pubKey) {
        this.ephemeralPubKeyLabel$.update(pubKeyToText(this.state$.actual.pubKey));
      }
      return;
    }

    const existing = secretAuthService.getEphemeralPubKey();

    if (existing) {
      this.ephemeralPubKeyLabel$.update(pubKeyToText(existing));
      this.syncEphemeralPubKeyState(existing);
      return;
    }

    this.error$.update("");

    secretAuthService.ensureEphemeralKey().catch((error: unknown) => {
      this.error$.update(formatWalletError(error));
    });
  }

  connectWallet() {
    this.error$.update("");
    web3WalletPickerBucket.setValue(WALLET_ACTIVE_SIGNER_ID, this.id);
    ModalComponent.attach(WALLET_MODAL_ID, web3WalletPickerBucket.id);
  }

  signWithWallet() {
    const message = this.challengeText$.actual;
    const t = this.i18n$.actual;

    if (!message) {
      this.error$.update(String(t.challengeNotConfigured));
      return;
    }

    const pubKey = this.state$.actual?.pubKey;

    if (!pubKey) {
      this.error$.update(String(t.connectWalletFirst));
      return;
    }

    if (!this.selectedWallet) {
      const wallet = this.state$.actual?.wallet ?? null;

      if (wallet) {
        this.selectedWallet = wallet;
        this.walletLabel$.update(web3Service.getWalletLabel(wallet));
      } else {
        this.error$.update(String(t.reconnectWalletToSign));
        this.connectWallet();
        return;
      }
    }

    const wallet = this.selectedWallet;

    this.runAction(async () => {
      const signAction = isCustomWallet(wallet)
        ? web3Service.signCustom(message, wallet.providerId)
        : web3Service.signWallet(message, wallet.kind, wallet.transport, this.getWalletOptions());

      const signature = await signAction;
      this.completeProof(message, signature, pubKey, "wallet", wallet);
    });
  }

  generateKey() {
    this.runAction(async () => {
      const keyPair = await generateEd25519KeyPair();
      const privateKey = await exportEd25519PrivateKeyBase64(keyPair.privateKey);

      this.privateKey$.update(privateKey);
      this.keyPubKeyLabel$.update(pubKeyToText(keyPair.publicKey));

      this.setPartialState({
        pubKey: keyPair.publicKey,
        proof: null,
        signed: false,
        mode: "key",
        wallet: null,
        passkey: null,
      });
    });
  }

  onPrivateKeyInput(el: HTMLTextAreaElement) {
    this.privateKey$.update(el?.value ?? "");
    this.updateKeyPubKeyPreview();
  }

  signWithKey() {
    const message = this.challengeText$.actual;
    const privateKey = (this.privateKey$.actual ?? "").trim();
    const t = this.i18n$.actual;

    if (!message) {
      this.error$.update(String(t.challengeNotConfigured));
      return;
    }

    if (!privateKey) {
      this.error$.update(String(t.privateKeyRequired));
      return;
    }

    this.runAction(async () => {
      const { pubKey, signature, publicKey } = await signWithPrivateKey(privateKey, message);

      this.keyPubKeyLabel$.update(pubKeyToText(publicKey));

      const proof = secretAuthProof.create(message, { value: signature }, pubKey);

      this.setPartialState({
        proof,
        signed: true,
        pubKey: publicKey,
        mode: "key",
        wallet: null,
        passkey: null,
      });
    });
  }

  signWithEphemeral() {
    const message = this.challengeText$.actual;

    if (!message) {
      this.error$.update(String(this.i18n$.actual.challengeNotConfigured));
      return;
    }

    this.runAction(async () => {
      const { pubKey, signature, publicKey } = await secretAuthService.signEphemeral(message);

      this.ephemeralPubKeyLabel$.update(pubKeyToText(publicKey));

      const proof = secretAuthProof.create(message, { value: signature }, pubKey);

      this.setPartialState({
        proof,
        signed: true,
        pubKey: publicKey,
        mode: "ephemeral",
        wallet: null,
        passkey: null,
      });
    });
  }

  createPasskey() {
    if (!isWebAuthnAvailable()) {
      this.error$.update(String(this.i18n$.actual.webauthnUnavailable));
      return;
    }

    this.runAction(async () => {
      const credential = await registerWebAuthnPasskey();
      this.syncPasskeyLabel();

      this.setPartialState({
        proof: null,
        signed: false,
        pubKey: null,
        mode: "passkey",
        wallet: null,
        passkey: credential,
      });
      this.setModeBucketValue("passkey");
    });
  }

  signWithPasskey() {
    const message = this.challengeText$.actual;
    const t = this.i18n$.actual;

    if (!message) {
      this.error$.update(String(t.challengeNotConfigured));
      return;
    }

    if (!isWebAuthnAvailable()) {
      this.error$.update(String(t.webauthnUnavailable));
      return;
    }

    if (!getStoredWebAuthnCredential()) {
      this.error$.update(String(t.createPasskeyFirst));
      return;
    }

    this.runAction(async () => {
      const proof = await signMessageWithWebAuthn(message);
      const credential = getStoredWebAuthnCredential();

      this.syncPasskeyLabel();

      this.setPartialState({
        proof,
        signed: true,
        pubKey: null,
        mode: "passkey",
        wallet: null,
        passkey: credential,
      });
    });
  }

  private syncPasskeyLabel() {
    const stored = getStoredWebAuthnCredential();
    const t = this.i18n$.actual;

    this.passkeyLabel$.update(stored ? String(t.passkeyReady) : String(t.noPasskey));
  }

  copyKeyPubKey(el?: Element) {
    const label = this.keyPubKeyLabel$.actual;

    if (!label || label === "—") return;

    this.copyText(label, String(this.i18n$.actual.publicKeyCopied), el);
  }

  copyEphemeralPubKey(el?: Element) {
    const label = this.ephemeralPubKeyLabel$.actual;

    if (!label || label === "—") return;

    this.copyText(label, String(this.i18n$.actual.publicKeyCopied), el);
  }

  refreshEphemeralKey() {
    if (this.state$.actual?.signed || this.busy$.actual) return;

    this.error$.update("");
    this.ephemeralPubKeyLabel$.update("—");

    secretAuthService.refreshEphemeralKey().catch((error: unknown) => {
      this.error$.update(formatWalletError(error));
    });
  }

  copyPrivateKey(el?: Element) {
    const privateKey = (this.privateKey$.actual ?? "").trim();

    if (!privateKey) return;

    this.copyText(privateKey, String(this.i18n$.actual.privateKeyCopied), el);
  }

  copyPubKey(el?: Element) {
    const pubKey = this.state$.actual?.pubKey;

    if (!pubKey?.value) return;

    this.copyText(pubKeyToText(pubKey), String(this.i18n$.actual.publicKeyCopied), el);
  }

  copyProof(el?: Element) {
    const proof = this.state$.actual?.proof;

    if (!proof) return;

    this.copyText(JSON.stringify(proof, null, 2), String(this.i18n$.actual.proofCopied), el);
  }

  private async updateKeyPubKeyPreview() {
    const privateKey = (this.privateKey$.actual ?? "").trim();

    if (!privateKey) {
      this.keyPubKeyLabel$.update("—");
      return;
    }

    try {
      const publicKey = await previewPublicKey(privateKey);

      this.keyPubKeyLabel$.update(pubKeyToText(publicKey));
    } catch {
      this.keyPubKeyLabel$.update("—");
    }
  }

  private applyConfig(config: SecretAuthConfig | null | undefined) {
    this.title$.update(config?.title ?? String(this.i18n$.actual.defaultTitle));
    this.devMode$.update(!!config?.devMode);
    this.syncProofPreview(this.state$.actual);
  }

  private applyChallenge(state: SecretAuthState | null | undefined) {
    if (!state?.challenge) {
      this.challengeText$.update("");
      return;
    }

    try {
      const nextMessage = formatSecretAuthChallenge(state.challenge);
      const prevMessage = this.challengeText$.actual;

      this.challengeText$.update(nextMessage);

      if (prevMessage && prevMessage !== nextMessage) {
        this.selectedWallet = null;
        this.syncIdleWalletLabel();
        this.clearEphemeralKey();

        this.setPartialState({
          proof: null,
          signed: false,
          pubKey: null,
          wallet: null,
        });

        if (this.mode$.actual === "ephemeral") {
          this.prepareEphemeralKey();
        }
      }
    } catch (error) {
      this.challengeText$.update("");
      this.error$.update(
        error instanceof Error ? error.message : String(this.i18n$.actual.invalidChallenge),
      );
    }
  }

  private completeProof(
    message: string,
    signature: string,
    pubKey: NonNullable<SecretAuthState["pubKey"]>,
    mode: SecretAuthMode,
    wallet: SignerWallet | null = null,
  ) {
    const proofPubKey = this.resolveProofPubKey(pubKey, wallet);

    if (!proofPubKey) {
      this.error$.update(String(this.i18n$.actual.cannotDeterminePubKey));
      return;
    }

    const proof = secretAuthProof.create(message, { value: signature }, proofPubKey);

    this.setPartialState({
      proof,
      signed: true,
      pubKey,
      mode,
      wallet,
      passkey: null,
    });
  }

  private resolveProofPubKey(
    walletPubKey: NonNullable<SecretAuthState["pubKey"]>,
    wallet: SignerWallet | null,
  ) {
    if (wallet && isBuiltinWallet(wallet)) {
      return secretAuthPubKey.fromWallet(walletPubKey, wallet.kind);
    }

    return secretAuthPubKey.infer(walletPubKey);
  }

  private setPartialState(patch: Partial<SecretAuthState>) {
    const current = this.state$.actual ?? this.emptyState();

    this.outerBucket.setState(this.id, { ...current, ...patch }, this.index);
  }

  private emptyState(): SecretAuthState {
    return {
      challenge: null,
      proof: null,
      signed: false,
      pubKey: null,
      mode: null,
      wallet: null,
      passkey: null,
    };
  }

  private syncProofPreview(state: SecretAuthState | null | undefined) {
    if (!this.devMode$.actual) {
      this.proofJson$.update("");
      return;
    }

    this.proofJson$.update(state?.proof ? JSON.stringify(state.proof, null, 2) : "");
  }

  private onWalletSelected(wallet: SignerWallet) {
    this.selectedWallet = wallet;
    this.walletLabel$.update(web3Service.getWalletLabel(wallet));

    this.runAction(async () => {
      const connectAction = isCustomWallet(wallet)
        ? web3Service.connectCustom(wallet.providerId)
        : web3Service.connectWallet(wallet.kind, wallet.transport, this.getWalletOptions());

      const pubKey = await connectAction;

      this.setPartialState({
        pubKey,
        proof: null,
        signed: false,
        mode: "wallet",
        wallet,
        passkey: null,
      });
      this.setModeBucketValue("wallet");
    });
  }

  private getWalletOptions() {
    const options: { tonManifestUrl?: string; walletConnectProjectId?: string } = {};
    const tonManifestUrl = web3Service.getTonManifestUrl();
    const walletConnectProjectId = web3Service.getWalletConnectProjectId();

    if (tonManifestUrl) options.tonManifestUrl = tonManifestUrl;
    if (walletConnectProjectId) options.walletConnectProjectId = walletConnectProjectId;

    return options;
  }

  private runAction(action: () => Promise<void>) {
    this.error$.update("");
    this.busy$.update(true);

    action()
      .catch((error: unknown) => {
        if (isWalletUserCancellation(error)) return;

        this.error$.update(formatWalletError(error));
      })
      .finally(() => {
        this.busy$.update(false);
      });
  }

  private copyText(text: string, message: string, el?: Element) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toastService.show({
          kind: "success",
          message,
          element: el ?? null,
          alignX: "right",
          alignY: "top",
          timeoutMs: 1600,
        });
      })
      .catch(() => {
        toastService.show({
          kind: "error",
          message: String(this.i18n$.actual.copyFailed),
          element: el ?? null,
          alignX: "right",
          alignY: "top",
          timeoutMs: 2200,
        });
      });
  }
}

componentsRegistryService.define(SecretAuthComponent);
