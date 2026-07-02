import { decodeBase64Url } from "../crypto/decode-bytes";
import { encodeBase64Url } from "../crypto/encode-bytes";
import { cosePublicKeyToSpki } from "./cose";
import type { SecretAuthProof, VerifySecretAuthProofOptions } from "./types";

type ClientData = {
  type?: string;
  challenge?: string;
  origin?: string;
};

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return new Uint8Array(digest);
}

async function importSpkiPublicKey(spki: Uint8Array): Promise<CryptoKey | null> {
  if (!globalThis.crypto?.subtle) return null;

  try {
    return await crypto.subtle.importKey(
      "spki",
      new Uint8Array(spki),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }
}

function resolveCredentialPublicKeySpki(
  credentialPublicKey: string,
): Uint8Array | null {
  const bytes = decodeBase64Url(credentialPublicKey);

  if (!bytes) return null;

  if (bytes[0] === 0x30) return bytes;

  return cosePublicKeyToSpki(bytes);
}

function parseClientDataJSON(value: string): ClientData | null {
  const bytes = decodeBase64Url(value);

  if (!bytes) return null;

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as ClientData;
  } catch {
    return null;
  }
}

function readRpIdHash(authData: Uint8Array): Uint8Array | null {
  if (authData.length < 37) return null;

  return authData.slice(5, 37);
}

function hasUserPresent(authData: Uint8Array): boolean {
  if (authData.length < 33) return false;

  return (authData[32] & 0x01) === 0x01;
}

export async function verifyWebAuthnProof(
  proof: Pick<SecretAuthProof, "message" | "signature" | "pubKey">,
  options?: VerifySecretAuthProofOptions,
): Promise<boolean> {
  if (proof.pubKey.source !== "webauthn" || proof.pubKey.algorithm !== "ES256") return false;

  const extension = proof.signature.extension;

  if (!extension?.authenticatorData || !extension.clientDataJSON) return false;
  if (!globalThis.crypto?.subtle) return false;

  const credentialPublicKey = options?.webauthn?.credentialPublicKey;

  if (!credentialPublicKey) return false;

  const spki = resolveCredentialPublicKeySpki(credentialPublicKey);

  if (!spki) return false;

  const publicKey = await importSpkiPublicKey(spki);

  if (!publicKey) return false;

  const clientData = parseClientDataJSON(extension.clientDataJSON);

  if (!clientData || clientData.type !== "webauthn.get") return false;

  const expectedChallenge = encodeBase64Url(new TextEncoder().encode(proof.message));

  if (clientData.challenge !== expectedChallenge) return false;

  const expectedOrigin = options?.webauthn?.expectedOrigin;

  if (expectedOrigin && clientData.origin !== expectedOrigin) return false;

  const expectedRpId = options?.webauthn?.expectedRPID ?? options?.domain;

  if (expectedRpId) {
    const authData = decodeBase64Url(extension.authenticatorData);

    if (!authData || !hasUserPresent(authData)) return false;

    const rpIdHash = readRpIdHash(authData);

    if (!rpIdHash) return false;

    const expectedHash = await sha256(new TextEncoder().encode(expectedRpId));

    if (expectedHash.length !== rpIdHash.length) return false;

    let same = true;

    for (let i = 0; i < expectedHash.length; i++) {
      if (expectedHash[i] !== rpIdHash[i]) same = false;
    }

    if (!same) return false;
  }

  const authenticatorData = decodeBase64Url(extension.authenticatorData);
  const clientDataJSON = decodeBase64Url(extension.clientDataJSON);
  const signature = decodeBase64Url(proof.signature.value);

  if (!authenticatorData || !clientDataJSON || !signature) return false;

  const clientDataHash = await sha256(clientDataJSON);
  const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedData.set(authenticatorData, 0);
  signedData.set(clientDataHash, authenticatorData.length);

  try {
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      new Uint8Array(signature),
      new Uint8Array(signedData),
    );
  } catch {
    return false;
  }
}
