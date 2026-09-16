import styles from "./web3-signer.component.module.css";

import { AbstractComponent, componentsRegistryService, i18nService, routerService, toastService } from "cruzo";
import { UI_KIT } from "cruzo/ui-components/const";
import { ModalComponent } from "cruzo/ui-components/modal";
import "cruzo/ui-components/toast";

import { CopyIconComponent } from "../icons/copy-icon.component";
import { Web3WalletPickerComponent } from "../web3-wallet-picker/web3-wallet-picker.component";
import {
  WALLET_ACTIVE_SIGNER_ID,
  WALLET_MODAL_ID,
  WALLET_PICKER_ID,
  web3WalletPickerBucket,
} from "../web3-wallet-picker/web3-wallet-picker.bucket";
import type { SignerState, SignerWallet } from "../../types/signer-state";
import { buildSigningPageUrl } from "../../signing-url";
import { pubKeyToText } from "../../utils/format-pub-key";
import { formatWalletError, isWalletUserCancellation } from "../../utils/wallet-error";
import { web3Service } from "../../web3.service";
import { isCustomWallet } from "../../web3-wallet";
import i18n from "./web3-signer.component.i18n.json";

export interface SignerConfig {
  payload: string;
  title: string;
}

export class Web3SignerComponent extends AbstractComponent<SignerConfig, any, SignerState> {
  static selector = "web3-signer-component";

  hasOuterBucket = true;
  hasConfig = true;

  dependencies = new Set([
    "modal-component",
    Web3WalletPickerComponent.selector,
    CopyIconComponent.selector,
  ]);

  i18n$ = i18nService.connect(this, i18n);

  title$ = this.newRx("");
  walletLabel$ = this.newRx(String(i18n.en.noWalletSelected));
  busy$ = this.newRx(false);
  error$ = this.newRx("");
  pubKeyLabel$ = this.newRx("—");

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
    return `<div class="${styles.signer}">
        <div class="${styles.head}">
          <div>
            <h3 class="${styles.title}">{{ root.title$::rx }}</h3>
            <div class="${styles.wallet}">{{ root.walletLabel$::rx }}</div>
          </div>
          <span class="${styles.status} ${styles.statusSigned}"
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

        <div class="${styles.pubkey}">
          <span class="${styles.label}">{{ root.i18n$::rx.pubKey }}</span>
          <div class="${styles.pubkeyRow}">
            <code class="${styles.value}">{{ root.pubKeyLabel$::rx }}</code>
            <div
              class="${styles.copyBtn}"
              title="{{ root.i18n$::rx.copyPubKey }}"
              attached="{{ root.state$::rx?.pubKey }}"
              onclick="{{ root.copyPubKey(event.currentTarget) }}">
              <copy-icon></copy-icon>
            </div>
          </div>
        </div>

        <div class="${styles.actions}">
          <button type="button"
            class="${UI_KIT}_button ${UI_KIT}_button-s ${UI_KIT}_button-secondary"
            disabled="{{ root.busy$::rx }}"
            onclick="{{ root.connect() }}">{{ root.i18n$::rx.connectWallet }}</button>
          <button type="button"
            class="${UI_KIT}_button ${UI_KIT}_button-s ${UI_KIT}_button-primary"
            disabled="{{ root.busy$::rx || !root.state$::rx?.pubKey || root.state$::rx?.signed }}"
            onclick="{{ root.sign(event.currentTarget) }}">{{ root.i18n$::rx.signPayload }}</button>
        </div>

        <p class="${styles.error}" attached="{{ root.error$::rx }}">{{ root.error$::rx }}</p>
      </div>`;
  }

  connect() {
    this.error$.update("");
    web3WalletPickerBucket.setValue(WALLET_ACTIVE_SIGNER_ID, this.id);
    ModalComponent.attach(WALLET_MODAL_ID, web3WalletPickerBucket.id);
  }

  sign(el?: Element) {
    const t = this.i18n$.actual;
    const payload = this.config$.actual?.payload;

    if (!payload) {
      this.error$.update(String(t.payloadNotConfigured));
      return;
    }

    if (!this.state$.actual?.pubKey) {
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
        this.connect();
        return;
      }
    }

    const pubKey = this.state$.actual.pubKey;
    const wallet = this.selectedWallet;

    this.runWalletAction(() => {
      const signAction = isCustomWallet(wallet)
        ? web3Service.signCustom(payload, wallet.providerId)
        : web3Service.signWallet(payload, wallet.kind, wallet.transport, this.getWalletOptions());

      return signAction.then(() => {
        this.outerBucket.setState(this.id, { pubKey, signed: true, wallet }, this.index);

        const url = buildSigningPageUrl(
          routerService.pathname$.actual,
          routerService.search$.actual,
          this.buildSigningSnapshot(),
          routerService.isHashMode(),
          this.config$.actual?.payload,
        );

        this.copyText(url)
          .then(() => {
            toastService.show({
              kind: "success",
              title: String(t.signingSuccessful),
              message: String(t.urlCopied),
              alignX: "center",
              alignY: "top",
              timeoutMs: 0,
            });
          })
          .catch(() => {
            toastService.show({
              kind: "success",
              title: String(t.signingSuccessful),
              message: String(t.copyUrlHint),
              alignX: "center",
              alignY: "top",
              timeoutMs: 0,
            });
          });
      });
    });
  }

  connectedCallback() {
    super.connectedCallback();

    this.title$.update(this.config$.actual?.title ?? this.id);
    this.applyWalletFromState(this.state$.actual);
    this.syncIdleWalletLabel();

    this.newRxFunc((state) => {
      this.pubKeyLabel$.update(pubKeyToText(state?.pubKey ?? null));
      this.applyWalletFromState(state);
      this.syncIdleWalletLabel();
    }, this.state$);

    this.newRxFunc(() => {
      this.syncIdleWalletLabel();
    }, this.i18n$);
  }

  copyPubKey(el?: Element) {
    const pubKey = this.state$.actual?.pubKey;
    const t = this.i18n$.actual;

    if (!pubKey?.value) return;

    navigator.clipboard
      .writeText(pubKeyToText(pubKey))
      .then(() => {
        toastService.show({
          kind: "success",
          message: String(t.publicKeyCopied),
          element: el ?? null,
          alignX: "right",
          alignY: "top",
          timeoutMs: 1600,
        });
      })
      .catch(() => {
        toastService.show({
          kind: "error",
          message: String(t.copyFailed),
          element: el ?? null,
          alignX: "right",
          alignY: "top",
          timeoutMs: 2200,
        });
      });
  }

  private syncIdleWalletLabel() {
    if (this.selectedWallet || this.state$.actual?.wallet) return;

    this.walletLabel$.update(String(this.i18n$.actual.noWalletSelected));
  }

  private buildSigningSnapshot(): Record<string, SignerState> {
    const snapshot: Record<string, SignerState> = {};

    for (const id of Object.keys(this.outerBucket.descriptors)) {
      snapshot[id] =
        this.outerBucket.getState(id) ?? { pubKey: null, signed: false, wallet: null };
    }

    return snapshot;
  }

  private copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).catch(() => this.copyTextFallback(text));
    }

    return this.copyTextFallback(text);
  }

  private copyTextFallback(text: string): Promise<void> {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.select();

    try {
      if (!document.execCommand("copy")) {
        return Promise.reject(new Error(String(this.i18n$.actual.copyFailed)));
      }

      return Promise.resolve();
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private applyWalletFromState(state: SignerState | null | undefined) {
    if (!state?.wallet) return;

    this.selectedWallet = state.wallet;
    this.walletLabel$.update(web3Service.getWalletLabel(state.wallet));
  }

  private onWalletSelected(wallet: SignerWallet) {
    this.selectedWallet = wallet;
    this.walletLabel$.update(web3Service.getWalletLabel(wallet));

    this.runWalletAction(() => {
      const connectAction = isCustomWallet(wallet)
        ? web3Service.connectCustom(wallet.providerId)
        : web3Service.connectWallet(wallet.kind, wallet.transport, this.getWalletOptions());

      return connectAction.then((pubKey) => {
        this.outerBucket.setState(this.id, { pubKey, signed: false, wallet }, this.index);
      });
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

  private runWalletAction(action: () => Promise<void>) {
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
}

componentsRegistryService.define(Web3SignerComponent);
