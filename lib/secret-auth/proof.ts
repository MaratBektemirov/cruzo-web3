import { verifyAccountSignedContent } from "../crypto/account-signature";
import { normalizeContent, verifySignedBytes } from "../crypto/verify-signature";
import {
  assertSignatureBytes,
  decodePubKeyBytes,
  decodeSignatureBytes,
} from "../pub-key";
import { formatSecretAuthChallenge } from "./challenge";
import * as pubKey from "./pub-key";
import type {
  SecretAuthChallenge,
  SecretAuthProof,
  SecretAuthPubKey,
  SecretAuthSignature,
  SecretAuthSignatureExtension,
} from "./types";
import { verifyWebAuthnProof } from "./webauthn-verify";

function assertWebAuthnExtension(
  key: SecretAuthPubKey,
  extension: SecretAuthSignatureExtension | undefined,
) {
  if (!pubKey.isWebAuthnPubKey(key)) {
    if (extension) {
      throw new Error("SecretAuth signature.extension is only supported for WebAuthn proofs");
    }

    return;
  }

  if (
    !extension ||
    typeof extension.authenticatorData !== "string" ||
    !extension.authenticatorData.length ||
    typeof extension.clientDataJSON !== "string" ||
    !extension.clientDataJSON.length
  ) {
    throw new Error("WebAuthn proof requires signature.extension.authenticatorData and clientDataJSON");
  }
}

export function parseSignature(value: unknown): SecretAuthSignature {
  if (!value || typeof value !== "object") {
    throw new Error("SecretAuth proof signature must be an object");
  }

  const signature = value as SecretAuthSignature;

  if (typeof signature.value !== "string" || !signature.value.length) {
    throw new Error("SecretAuth proof signature.value must be a non-empty string");
  }

  if (
    signature.encoding !== undefined &&
    signature.encoding !== "hex" &&
    signature.encoding !== "base64" &&
    signature.encoding !== "base58" &&
    signature.encoding !== "base64url"
  ) {
    throw new Error("SecretAuth proof signature.encoding must be hex, base64, base58, or base64url");
  }

  if (signature.extension !== undefined) {
    const extension = signature.extension;

    if (
      !extension ||
      typeof extension.authenticatorData !== "string" ||
      !extension.authenticatorData.length ||
      typeof extension.clientDataJSON !== "string" ||
      !extension.clientDataJSON.length
    ) {
      throw new Error("SecretAuth proof signature.extension is invalid");
    }
  }

  return {
    value: signature.value,
    encoding: signature.encoding,
    extension: signature.extension,
  };
}

export function create(
  challenge: SecretAuthChallenge | string,
  signature: SecretAuthSignature,
  key: SecretAuthPubKey,
): SecretAuthProof {
  const parsedKey = pubKey.parse(key);
  const parsedSignature = parseSignature(signature);

  assertWebAuthnExtension(parsedKey, parsedSignature.extension);

  return {
    message: typeof challenge === "string" ? challenge : formatSecretAuthChallenge(challenge),
    signature: parsedSignature,
    pubKey: parsedKey,
  };
}

export function parse(value: unknown): SecretAuthProof {
  if (!value || typeof value !== "object") {
    throw new Error("SecretAuth proof must be an object");
  }

  const proof = value as SecretAuthProof;

  if (typeof proof.message !== "string" || !proof.message.length) {
    throw new Error("SecretAuth proof message must be a non-empty string");
  }

  const parsedKey = pubKey.parse(proof.pubKey);
  const parsedSignature = parseSignature(proof.signature);

  assertWebAuthnExtension(parsedKey, parsedSignature.extension);

  return {
    message: proof.message,
    signature: parsedSignature,
    pubKey: parsedKey,
  };
}

export async function verifySignature(
  message: string,
  signature: SecretAuthSignature,
  key: SecretAuthPubKey,
  options?: {
    verify?: import("./types").VerifySecretAuthProofOptions;
  },
): Promise<boolean> {
  const parsed = pubKey.parse(key);
  const parsedSignature = parseSignature(signature);

  if (!parsedSignature.value.length) return false;

  if (pubKey.isWebAuthnPubKey(parsed)) {
    return verifyWebAuthnProof(
      {
        message,
        signature: parsedSignature,
        pubKey: parsed,
      },
      options?.verify,
    );
  }

  const cryptoKey = pubKey.toCrypto(parsed);
  const normalized = normalizeContent(message);

  if (pubKey.usesAccountSignature(parsed)) {
    return verifyAccountSignedContent(normalized, parsedSignature.value, cryptoKey, {
      evmPersonalSign: pubKey.usesEvmPersonalSign(parsed),
    });
  }

  const signatureEncoding = parsedSignature.encoding ?? parsed.encoding;

  if (signatureEncoding === "base64url") return false;

  const signatureBytes = decodeSignatureBytes(parsedSignature.value, signatureEncoding);

  assertSignatureBytes(cryptoKey.type, signatureBytes);

  if (cryptoKey.type === "Ed25519" && !globalThis.crypto?.subtle) return false;

  return verifySignedBytes(
    normalized,
    signatureBytes,
    decodePubKeyBytes(cryptoKey),
    cryptoKey.type,
    { evmPersonalSign: false },
  );
}
