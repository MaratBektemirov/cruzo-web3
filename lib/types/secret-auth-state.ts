import type { SecretAuthChallenge, SecretAuthProof } from "../secret-auth/types";
import type { PubKey } from "./web3-types";
import type { SignerWallet } from "./signer-state";

export type SecretAuthMode = "wallet" | "key" | "passkey";

export type SecretAuthPasskeyCredential = {
  credentialId: string;
  credentialPublicKey: string;
};

export type SecretAuthState = {
  challenge: SecretAuthChallenge | null;
  proof: SecretAuthProof | null;
  signed: boolean;
  pubKey: PubKey | null;
  mode: SecretAuthMode | null;
  wallet?: SignerWallet | null;
  passkey?: SecretAuthPasskeyCredential | null;
};
