import { isSecretAuthChallengeExpired, parseSecretAuthChallenge } from "./challenge";
import * as proof from "./proof";
import type { SecretAuthProof, SecretAuthVerifyResult, VerifySecretAuthProofOptions } from "./types";

export async function verifySecretAuthProofLocal(
  value: SecretAuthProof | unknown,
  options?: VerifySecretAuthProofOptions,
): Promise<SecretAuthVerifyResult> {
  let parsed: SecretAuthProof;

  try {
    parsed = proof.parse(value);
  } catch {
    return { ok: false, reason: "invalid-proof" };
  }

  const challenge = parseSecretAuthChallenge(parsed.message);

  if (!challenge) return { ok: false, reason: "invalid-message" };

  if (options?.domain && challenge.domain !== options.domain) {
    return { ok: false, reason: "domain-mismatch" };
  }

  const now = options?.now ?? Math.floor(Date.now() / 1000);

  if (isSecretAuthChallengeExpired(challenge, now)) {
    return { ok: false, reason: "expired" };
  }

  try {
    const ok = await proof.verifySignature(parsed.message, parsed.signature, parsed.pubKey, {
      verify: options,
    });

    return ok ? { ok: true } : { ok: false, reason: "invalid-signature" };
  } catch {
    return { ok: false, reason: "invalid-signature" };
  }
}

export async function verifySecretAuthProof(
  value: SecretAuthProof | unknown,
  options?: VerifySecretAuthProofOptions,
): Promise<boolean> {
  return (await verifySecretAuthProofLocal(value, options)).ok;
}
