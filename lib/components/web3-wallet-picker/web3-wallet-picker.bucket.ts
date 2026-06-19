import { componentsRegistryService, RxBucket } from "cruzo";
import { ModalConfig } from "cruzo/ui-components/modal";

export const WALLET_MODAL_ID = "web3-wallet-modal";
export const WALLET_PICKER_ID = "web3-wallet-picker";
export const WALLET_ACTIVE_SIGNER_ID = "active-signer";

export const web3WalletPickerBucket = new RxBucket({
  [WALLET_MODAL_ID]: {},
  [WALLET_PICKER_ID]: {},
  [WALLET_ACTIVE_SIGNER_ID]: {},
});

web3WalletPickerBucket.setConfig(
  WALLET_MODAL_ID,
  ModalConfig({
    bodyContent: `<web3-wallet-picker-component component-id="${WALLET_PICKER_ID}" bucket-id="${web3WalletPickerBucket.id}"></web3-wallet-picker-component>`,
    dependencies: new Set(["web3-wallet-picker-component"]),
  }),
);

componentsRegistryService.connectBucket(web3WalletPickerBucket);
