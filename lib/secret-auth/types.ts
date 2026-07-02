import type { PubKeyAlgorithm, PubKeyEncoding } from "../types/web3-types";

export type SecretAuthAlgorithm = Extract<PubKeyAlgorithm, "secp256k1" | "Ed25519"> | "ES256";

export type SecretAuthSource = "ethereum" | "tron" | "ton" | "solana" | "raw" | "webauthn";

export type SecretAuthEncoding = PubKeyEncoding | "base64url";

export type SecretAuthSignatureExtension = {
  authenticatorData: string;
  clientDataJSON: string;
};

export type SecretAuthSignature = {
  value: string;
  encoding?: SecretAuthEncoding;
  extension?: SecretAuthSignatureExtension;
};

export type SecretAuthPubKey = {
  algorithm: SecretAuthAlgorithm;
  source: SecretAuthSource;
  value: string;
  encoding: SecretAuthEncoding;
};

export type SecretAuthChallenge = {
  domain: string;
  nonce: string;
  exp: number;
};

export type SecretAuthProof = {
  message: string;
  signature: SecretAuthSignature;
  pubKey: SecretAuthPubKey;
};

export type VerifySecretAuthProofOptions = {
  domain?: string;
  now?: number;
  webauthn?: {
    credentialPublicKey?: string;
    expectedOrigin?: string;
    expectedRPID?: string;
  };
};

export type SecretAuthVerifyFailureReason =
  | "invalid-proof"
  | "invalid-message"
  | "domain-mismatch"
  | "expired"
  | "invalid-signature";

export type SecretAuthVerifyResult =
  | { ok: true }
  | { ok: false; reason: SecretAuthVerifyFailureReason };
