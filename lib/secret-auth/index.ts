export type {
  SecretAuthAlgorithm,
  SecretAuthChallenge,
  SecretAuthEncoding,
  SecretAuthProof,
  SecretAuthPubKey,
  SecretAuthSignature,
  SecretAuthSignatureExtension,
  SecretAuthSource,
  SecretAuthVerifyFailureReason,
  SecretAuthVerifyResult,
  VerifySecretAuthProofOptions,
} from "./types";

export { formatSecretAuthChallenge, generateSecretAuthNonce } from "./challenge";
export { verifySecretAuthProof, verifySecretAuthProofLocal } from "./verify";
