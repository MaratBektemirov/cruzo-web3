import type { SecretAuthChallenge } from "./types";

const HEADER = " wants you to prove your signing key:";

export function formatSecretAuthChallenge(challenge: SecretAuthChallenge): string {
  const domain = challenge.domain.trim();
  const nonce = challenge.nonce.trim();

  if (!domain) throw new Error("SecretAuth challenge domain must be non-empty");
  if (!nonce) throw new Error("SecretAuth challenge nonce must be non-empty");
  if (!Number.isFinite(challenge.exp)) throw new Error("SecretAuth challenge exp must be a number");

  return `${domain}${HEADER}\n\nnonce: ${nonce}\nexp: ${challenge.exp}`;
}

export function parseSecretAuthChallenge(message: string): SecretAuthChallenge | null {
  if (!message?.trim()) return null;

  const headerIndex = message.indexOf(HEADER);

  if (headerIndex < 1) return null;

  const domain = message.slice(0, headerIndex).trim();

  if (!domain) return null;

  const nonceMatch = message.match(/^nonce:\s*(.+)$/m);
  const expMatch = message.match(/^exp:\s*(\d+)$/m);

  if (!nonceMatch || !expMatch) return null;

  const nonce = nonceMatch[1].trim();
  const exp = Number(expMatch[1]);

  if (!nonce || !Number.isFinite(exp)) return null;

  return { domain, nonce, exp };
}

export function isSecretAuthChallengeExpired(challenge: SecretAuthChallenge, now = Math.floor(Date.now() / 1000)) {
  return challenge.exp <= now;
}

export function generateSecretAuthNonce(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
