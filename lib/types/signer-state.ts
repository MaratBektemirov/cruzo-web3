import type { PubKey } from "./web3-types";
import type { Web3WalletTarget } from "../web3-wallet";

export type SignerWallet = Web3WalletTarget;

export type SignerState = {
  pubKey: PubKey | null;
  signed: boolean;
  wallet?: SignerWallet | null;
};
