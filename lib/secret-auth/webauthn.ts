import { decodeBase64Url } from "../crypto/decode-bytes";
import { encodeBase64Url } from "../crypto/encode-bytes";
import { cosePublicKeyToSpki } from "./cose";
import * as proof from "./proof";
import type { SecretAuthProof } from "./types";

const STORAGE_PREFIX = "cruzo-secret-auth-webauthn:";

export type WebAuthnStoredCredential = {
  credentialId: string;
  credentialPublicKey: string;
};

export type RegisterWebAuthnOptions = {
  rpId?: string;
  rpName?: string;
  userName?: string;
  userDisplayName?: string;
};

export type SignWebAuthnOptions = {
  rpId?: string;
  credentialId?: string;
  allowCreate?: boolean;
};

function assertWebAuthnAvailable() {
  if (typeof window === "undefined" || !window.isSecureContext) {
    throw new Error("WebAuthn requires a secure browser context (HTTPS or localhost)");
  }

  if (!navigator.credentials || typeof PublicKeyCredential === "undefined") {
    throw new Error("WebAuthn is not available in this browser");
  }
}

export function isWebAuthnAvailable(): boolean {
  try {
    assertWebAuthnAvailable();
    return true;
  } catch {
    return false;
  }
}

export function getWebAuthnRpId(): string {
  if (typeof window === "undefined") return "localhost";

  return window.location.hostname || "localhost";
}

function storageKey(rpId: string) {
  return `${STORAGE_PREFIX}${rpId}`;
}

export function getStoredWebAuthnCredential(rpId = getWebAuthnRpId()): WebAuthnStoredCredential | null {
  if (typeof sessionStorage === "undefined") return null;

  const raw = sessionStorage.getItem(storageKey(rpId));

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as WebAuthnStoredCredential;

    if (typeof parsed.credentialId !== "string" || typeof parsed.credentialPublicKey !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function storeWebAuthnCredential(
  credential: WebAuthnStoredCredential,
  rpId = getWebAuthnRpId(),
): void {
  if (typeof sessionStorage === "undefined") return;

  sessionStorage.setItem(storageKey(rpId), JSON.stringify(credential));
}

export function clearStoredWebAuthnCredential(rpId = getWebAuthnRpId()): void {
  if (typeof sessionStorage === "undefined") return;

  sessionStorage.removeItem(storageKey(rpId));
}

function randomUserId(): Uint8Array {
  const out = new Uint8Array(16);
  crypto.getRandomValues(out);
  return out;
}

function credentialIdToBase64Url(credential: PublicKeyCredential): string {
  return encodeBase64Url(new Uint8Array(credential.rawId));
}

function publicKeyToStoredValue(publicKey: ArrayBuffer): string {
  const cose = new Uint8Array(publicKey);
  const spki = cosePublicKeyToSpki(cose);

  return encodeBase64Url(spki ?? cose);
}

export async function registerWebAuthnPasskey(
  options?: RegisterWebAuthnOptions,
): Promise<WebAuthnStoredCredential> {
  assertWebAuthnAvailable();

  const rpId = options?.rpId ?? getWebAuthnRpId();
  const userName = options?.userName ?? `auth-${rpId}`;
  const userDisplayName = options?.userDisplayName ?? "SecretAuth passkey";

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        name: options?.rpName ?? "Cruzo SecretAuth",
        id: rpId,
      },
      user: {
        id: new Uint8Array(randomUserId()),
        name: userName,
        displayName: userDisplayName,
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey registration was cancelled");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey?.();

  if (!publicKey) {
    throw new Error("Browser did not return a passkey public key");
  }

  const stored: WebAuthnStoredCredential = {
    credentialId: credentialIdToBase64Url(credential),
    credentialPublicKey: publicKeyToStoredValue(publicKey),
  };

  storeWebAuthnCredential(stored, rpId);

  return stored;
}

function buildAllowCredentials(credentialId: string): PublicKeyCredentialDescriptor[] {
  const id = decodeBase64Url(credentialId);

  if (!id) throw new Error("Invalid WebAuthn credential id");

  return [{ type: "public-key", id: new Uint8Array(id) }];
}

export async function signMessageWithWebAuthn(
  message: string,
  options?: SignWebAuthnOptions,
): Promise<SecretAuthProof> {
  assertWebAuthnAvailable();

  const rpId = options?.rpId ?? getWebAuthnRpId();
  const stored = getStoredWebAuthnCredential(rpId);
  const credentialId = options?.credentialId ?? stored?.credentialId;

  if (!credentialId && options?.allowCreate) {
    await registerWebAuthnPasskey({ rpId });
    return signMessageWithWebAuthn(message, { ...options, allowCreate: false });
  }

  if (!credentialId) {
    throw new Error("Create a passkey first");
  }

  const challenge = new TextEncoder().encode(message);

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: buildAllowCredentials(credentialId),
      userVerification: "preferred",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey sign-in was cancelled");
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  return proof.create(
    message,
    {
      value: encodeBase64Url(new Uint8Array(response.signature)),
      encoding: "base64url",
      extension: {
        authenticatorData: encodeBase64Url(new Uint8Array(response.authenticatorData)),
        clientDataJSON: encodeBase64Url(new Uint8Array(response.clientDataJSON)),
      },
    },
    {
      algorithm: "ES256",
      source: "webauthn",
      value: credentialIdToBase64Url(credential),
      encoding: "base64url",
    },
  );
}
