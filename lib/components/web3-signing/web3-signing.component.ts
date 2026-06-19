import styles from "./web3-signing.component.module.css";

import { AbstractComponent, componentsRegistryService, routerService, RxBucket } from "cruzo";
import { UI_KIT } from "cruzo/ui-components/const";

import { Web3SignerComponent } from "../web3-signer/web3-signer.component";
import { detectInjectedWallets, getInjectedWalletLabel } from "../../providers/injected";
import {
  buildSearchWithSigning,
  clampSigningPayload,
  MAX_SIGNING_PAYLOAD_LENGTH,
  readPayloadFromUrl,
  readSigningUrl,
} from "../../signing-url";
import type { SignerState } from "../../types/signer-state";
import { pubKeyToText } from "../../utils/format-pub-key";
import { web3Service } from "../../web3.service";

const DEFAULT_PAYLOAD = JSON.stringify({ message: "Hello from cruzo-web3" });
const SIGNER_IDS = ["signer1", "signer2"] as const;
const PAYLOAD_INPUT_ID = "payload";

export class Web3SigningComponent extends AbstractComponent {
  static selector = "web3-signing-component";

  dependencies = new Set([Web3SignerComponent.selector]);

  walletHint$ = this.newRx("");
  stateOverview$ = this.newRx("");

  innerBucket = new RxBucket({
    [PAYLOAD_INPUT_ID]: {},
    signer1: {
      config: { payload: DEFAULT_PAYLOAD, title: "Signer 1" },
    },
    signer2: {
      config: { payload: DEFAULT_PAYLOAD, title: "Signer 2" },
    },
  });

  payload$ = this.newRxValueFromBucket(this.innerBucket, PAYLOAD_INPUT_ID);

  private syncingFromUrl = false;

  getHTML() {
    const k = UI_KIT;

    return `<div>
        <p class="description-note mb_m ${styles.hint}"
          attached="{{ root.walletHint$::rx }}">{{ root.walletHint$::rx }}</p>

        <div class="${styles.signing} block">
          <div class="mb_s">
            <div class="description-paragraph mb_xs">
              Payload (signed as JSON string)
              <span class="${styles.payloadLimit}">— max ${MAX_SIGNING_PAYLOAD_LENGTH} chars, synced to URL</span>
            </div>
            <textarea
              class="${k}_textarea"
              maxlength="${MAX_SIGNING_PAYLOAD_LENGTH}"
              rows="4"
              placeholder='{"message": "..."}'
              oninput="{{ root.onPayloadInput(event.currentTarget) }}">{{ root.payload$::rx }}</textarea>
          </div>

          <div class="mb_m">
            <div class="description-paragraph mb_xs">Signing state (synced to URL):</div>
            <pre class="${styles.stateOverview}">{{ root.stateOverview$::rx }}</pre>
          </div>

          <div class="${styles.signers}">
            <web3-signer-component
              component-id="signer1"
              bucket-id="${this.innerBucket.id}">
            </web3-signer-component>
            <web3-signer-component
              component-id="signer2"
              bucket-id="${this.innerBucket.id}">
            </web3-signer-component>
          </div>
        </div>
      </div>`;
  }

  connectedCallback() {
    componentsRegistryService.connectBucket(this.innerBucket);
    super.connectedCallback();
    this.ensureTonManifest();
    this.updateWalletHint();
    this.setupUrlSync();
  }

  onPayloadInput(el: HTMLTextAreaElement) {
    const value = clampSigningPayload(el?.value ?? "");

    if ((this.innerBucket.getValue(PAYLOAD_INPUT_ID) ?? "") !== value) {
      this.innerBucket.setValue(PAYLOAD_INPUT_ID, value, "0", true);
    }
  }

  private setupUrlSync() {
    this.rxList ??= [];

    this.applyPayload(DEFAULT_PAYLOAD);
    this.applyUrlState(routerService.search$.actual);

    this.newRxFunc((search: string) => {
      this.applyUrlState(search);
    }, routerService.search$);

    this.innerBucket.newRxValue(
      PAYLOAD_INPUT_ID,
      (value) => {
        if (this.syncingFromUrl) return;

        const payload = clampSigningPayload(value ?? "");
        this.updateSignerPayloadConfigs(payload);
        this.syncToUrl();
      },
      this.rxList,
      DEFAULT_PAYLOAD,
    );

    for (const id of SIGNER_IDS) {
      this.innerBucket.newRxState(
        id,
        () => {
          this.syncToUrl();
          this.updateStateOverview();
        },
        this.rxList,
        this.innerBucket.getState(id),
      );
    }

    this.updateStateOverview();
  }

  private applyUrlState(search: string) {
    const snapshot = readSigningUrl(search);
    const payloadFromUrl = readPayloadFromUrl(search);

    if (!snapshot && payloadFromUrl == null) return;

    this.syncingFromUrl = true;

    try {
      this.applyPayload(payloadFromUrl ?? DEFAULT_PAYLOAD);

      if (snapshot) {
        for (const id of SIGNER_IDS) {
          const state = snapshot[id];

          if (state) {
            this.innerBucket.setState(id, state);
          }
        }
      }
    } finally {
      this.syncingFromUrl = false;
      this.updateStateOverview();
    }
  }

  private syncToUrl() {
    if (this.syncingFromUrl) return;

    const snapshot: Record<string, SignerState> = {};

    for (const id of SIGNER_IDS) {
      snapshot[id] = this.innerBucket.getState(id) ?? { pubKey: null, signed: false, wallet: null };
    }

    const payload = this.getPayload();
    const nextSearch = buildSearchWithSigning(routerService.search$.actual, snapshot, payload);

    if (nextSearch === routerService.search$.actual) return;

    routerService.pushHistory(routerService.pathname$.actual + nextSearch);
  }

  private getPayload(): string {
    return clampSigningPayload(this.innerBucket.getValue(PAYLOAD_INPUT_ID) ?? DEFAULT_PAYLOAD);
  }

  private applyPayload(payload: string) {
    const clamped = clampSigningPayload(payload);

    this.innerBucket.setValue(PAYLOAD_INPUT_ID, clamped);
    this.updateSignerPayloadConfigs(clamped);
  }

  private updateSignerPayloadConfigs(payload: string) {
    for (const id of SIGNER_IDS) {
      const config = this.innerBucket.descriptors[id]?.config ?? {};

      this.innerBucket.setConfig(id, { ...config, payload });
    }
  }

  private updateStateOverview() {
    const lines = SIGNER_IDS.map((id, index) => {
      const state = this.innerBucket.getState(id) ?? this.emptySignerState();
      const title = `Signer ${index + 1}`;
      const status = state.signed ? "Signed" : state.pubKey ? "Connected" : "Idle";
      const wallet = state.wallet
        ? web3Service.getWalletLabel(state.wallet)
        : "No wallet";
      const pubKey = pubKeyToText(state.pubKey);

      return `${title}: ${status} · ${wallet} · ${pubKey}`;
    });

    this.stateOverview$.update(lines.join("\n"));
  }

  private emptySignerState(): SignerState {
    return { pubKey: null, signed: false, wallet: null };
  }

  private ensureTonManifest() {
    if (web3Service.getTonManifestUrl()) return;

    web3Service.setTonManifestUrl(new URL("/tonconnect-manifest.json", window.location.href).href);
  }

  private updateWalletHint() {
    const extensions = detectInjectedWallets();
    const hints = ["Click Connect wallet to choose a provider (extension or mobile app)."];

    if (extensions.length) {
      hints.push(`Extensions detected: ${extensions.map(getInjectedWalletLabel).join(" · ")}`);
    }

    this.walletHint$.update(hints.join(" "));
  }
}

componentsRegistryService.define(Web3SigningComponent);
