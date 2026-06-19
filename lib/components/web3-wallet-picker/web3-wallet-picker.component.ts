import styles from "./web3-wallet-picker.component.module.css";

import { AbstractComponent, componentsRegistryService } from "cruzo";

import { hasInjectedWallet } from "../../providers/injected";
import type { WalletKind } from "../../providers/wallet";
import type { WalletTransport } from "../../providers/wallet-transport";
import { web3Service } from "../../web3.service";
import type { Web3WalletTarget } from "../../web3-wallet";
import { WALLET_MODAL_ID, WALLET_PICKER_ID } from "./web3-wallet-picker.bucket";

declare global {
  interface BucketEventMap {
    web3WalletSelected: Web3WalletTarget;
  }
}

export class Web3WalletPickerComponent extends AbstractComponent {
  static selector = "web3-wallet-picker-component";
  hasOuterBucket = true;

  ethSectionVisible$ = this.newRx(false);
  ethExtVisible$ = this.newRx(false);
  ethExtAvailable$ = this.newRx(false);
  ethAppVisible$ = this.newRx(false);
  ethAppAvailable$ = this.newRx(false);

  tonSectionVisible$ = this.newRx(false);
  tonExtVisible$ = this.newRx(false);
  tonExtAvailable$ = this.newRx(false);
  tonAppVisible$ = this.newRx(false);
  tonAppAvailable$ = this.newRx(false);

  solSectionVisible$ = this.newRx(false);
  solExtVisible$ = this.newRx(false);
  solExtAvailable$ = this.newRx(false);

  tronSectionVisible$ = this.newRx(false);
  tronExtVisible$ = this.newRx(false);
  tronExtAvailable$ = this.newRx(false);

  customOptions$ = this.newRx<{ id: string; label: string; hint: string }[]>([]);

  getHTML() {
    return `<div class="${styles.picker}">
        <h3 class="${styles.title}">Connect wallet</h3>

        <div class="${styles.section}" attached="{{ root.ethSectionVisible$::rx }}">
          <h4 class="${styles.sectionTitle}">Ethereum</h4>
          <button type="button" class="${styles.option}"
            attached="{{ root.ethExtVisible$::rx }}"
            disabled="{{ !root.ethExtAvailable$::rx }}"
            onclick="{{ root.pick('ethereum', 'extension') }}">
            <span class="${styles.optionLabel}">Browser extension</span>
            <span class="${styles.optionHint}">MetaMask, Rabby and other EIP-1193 wallets</span>
          </button>
          <button type="button" class="${styles.option}"
            attached="{{ root.ethAppVisible$::rx }}"
            disabled="{{ !root.ethAppAvailable$::rx }}"
            onclick="{{ root.pick('ethereum', 'app') }}">
            <span class="${styles.optionLabel}">Mobile wallet</span>
            <span class="${styles.optionHint}">WalletConnect</span>
          </button>
        </div>

        <div class="${styles.section}" attached="{{ root.tonSectionVisible$::rx }}">
          <h4 class="${styles.sectionTitle}">TON</h4>
          <button type="button" class="${styles.option}"
            attached="{{ root.tonExtVisible$::rx }}"
            disabled="{{ !root.tonExtAvailable$::rx }}"
            onclick="{{ root.pick('ton', 'extension') }}">
            <span class="${styles.optionLabel}">Browser extension</span>
            <span class="${styles.optionHint}">Tonkeeper and other TON wallets</span>
          </button>
          <button type="button" class="${styles.option}"
            attached="{{ root.tonAppVisible$::rx }}"
            disabled="{{ !root.tonAppAvailable$::rx }}"
            onclick="{{ root.pick('ton', 'app') }}">
            <span class="${styles.optionLabel}">Mobile wallet</span>
            <span class="${styles.optionHint}">Tonkeeper app via Ton Connect</span>
          </button>
        </div>

        <div class="${styles.section}" attached="{{ root.solSectionVisible$::rx }}">
          <h4 class="${styles.sectionTitle}">Solana</h4>
          <button type="button" class="${styles.option}"
            attached="{{ root.solExtVisible$::rx }}"
            disabled="{{ !root.solExtAvailable$::rx }}"
            onclick="{{ root.pick('solana', 'extension') }}">
            <span class="${styles.optionLabel}">Browser extension</span>
            <span class="${styles.optionHint}">Phantom and other Solana wallets</span>
          </button>
        </div>

        <div class="${styles.section}" attached="{{ root.tronSectionVisible$::rx }}">
          <h4 class="${styles.sectionTitle}">Tron</h4>
          <button type="button" class="${styles.option}"
            attached="{{ root.tronExtVisible$::rx }}"
            disabled="{{ !root.tronExtAvailable$::rx }}"
            onclick="{{ root.pick('tron', 'extension') }}">
            <span class="${styles.optionLabel}">Browser extension</span>
            <span class="${styles.optionHint}">TronLink</span>
          </button>
        </div>

        <div class="${styles.section}" attached="{{ root.customOptions$::rx?.length }}">
          <h4 class="${styles.sectionTitle}">Custom</h4>
          <button type="button" class="${styles.option}"
            repeat="{{ root.customOptions$::rx }}"
            onclick="{{ root.pickCustom(repeat.id) }}">
            <span class="${styles.optionLabel}">{{ repeat.label }}</span>
            <span class="${styles.optionHint}" attached="{{ repeat.hint }}">{{ repeat.hint }}</span>
          </button>
        </div>
      </div>`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.updateFromConfig();
    this.newRxFunc(() => this.updateFromConfig(), web3Service.setup$);
  }

  pick(kind: WalletKind, transport: WalletTransport) {
    this.outerBucket.emitEvent(WALLET_PICKER_ID, "web3WalletSelected", { data: { kind, transport } });
    this.outerBucket.emitEvent(WALLET_MODAL_ID, "closeModal", { data: { isOK: true } });
  }

  pickCustom(providerId: string) {
    this.outerBucket.emitEvent(WALLET_PICKER_ID, "web3WalletSelected", {
      data: { type: "custom", providerId },
    });
    this.outerBucket.emitEvent(WALLET_MODAL_ID, "closeModal", { data: { isOK: true } });
  }

  private updateFromConfig() {
    const config = web3Service;

    const ethExtVisible = config.isBuiltinEnabled("ethereum", "extension");
    const ethAppVisible = config.isBuiltinEnabled("ethereum", "app");
    const tonExtVisible = config.isBuiltinEnabled("ton", "extension");
    const tonAppVisible = config.isBuiltinEnabled("ton", "app");
    const solExtVisible = config.isBuiltinEnabled("solana", "extension");
    const tronExtVisible = config.isBuiltinEnabled("tron", "extension");

    this.ethExtVisible$.update(ethExtVisible);
    this.ethAppVisible$.update(ethAppVisible);
    this.ethSectionVisible$.update(ethExtVisible || ethAppVisible);

    this.tonExtVisible$.update(tonExtVisible);
    this.tonAppVisible$.update(tonAppVisible);
    this.tonSectionVisible$.update(tonExtVisible || tonAppVisible);

    this.solExtVisible$.update(solExtVisible);
    this.solSectionVisible$.update(solExtVisible);

    this.tronExtVisible$.update(tronExtVisible);
    this.tronSectionVisible$.update(tronExtVisible);

    this.ethExtAvailable$.update(hasInjectedWallet("ethereum"));
    this.ethAppAvailable$.update(!!web3Service.getWalletConnectProjectId());
    this.tonExtAvailable$.update(hasInjectedWallet("ton"));
    this.tonAppAvailable$.update(!!web3Service.getTonManifestUrl());
    this.solExtAvailable$.update(hasInjectedWallet("solana"));
    this.tronExtAvailable$.update(hasInjectedWallet("tron"));

    this.customOptions$.update(config.listCustomProviderOptions());
  }
}

componentsRegistryService.define(Web3WalletPickerComponent);
