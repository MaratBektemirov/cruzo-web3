export {
  web3Service,
  ALL_BUILTIN_WALLET_SLOTS,
} from "./web3.service";
export type {
  Web3Config,
  Web3CustomProviderConfig,
  Web3CustomProviderFactory,
  Web3CustomProviderOption,
} from "./web3.service";
export type {
  Web3BuiltinWallet,
  Web3CustomWallet,
  Web3WalletSlot,
  Web3WalletTarget,
} from "./web3-wallet";
export { isBuiltinWallet, isCustomWallet } from "./web3-wallet";

export { Web3SignerComponent } from "./components/web3-signer/web3-signer.component";
export { Web3SigningComponent } from "./components/web3-signing/web3-signing.component";
export { SecretAuthComponent } from "./components/secret-auth/secret-auth.component";
export type { SecretAuthConfig } from "./components/secret-auth/secret-auth.component";

export type { SecretAuthMode, SecretAuthState } from "./types/secret-auth-state";
