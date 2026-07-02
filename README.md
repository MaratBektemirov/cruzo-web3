# cruzo-web3

Web3 addon for [cruzo](https://github.com/MaratBektemirov/cruzo): wallet connect, sign, verify, and ready-made UI components.

## Install

```bash
npm install cruzo cruzo-web3
```


## Public API

Main entry (`cruzo-web3`):

- `web3Service` — wallet connect, sign, verify, wallet picker config
- `Web3SigningComponent`, `Web3SignerComponent` — ready-made UI
- `SecretAuthComponent` — SecretAuth UI
- `ALL_BUILTIN_WALLET_SLOTS`, `isBuiltinWallet`, `isCustomWallet`
- types: `Web3Config`, `Web3CustomProviderConfig`, `Web3WalletSlot`, `Web3WalletTarget`, …

Subpath entries (side-effect imports that register components):

- `cruzo-web3/components/web3-signing`
- `cruzo-web3/components/web3-signer`
- `cruzo-web3/components/secret-auth`
- `cruzo-web3/secret-auth` — auth protocol helpers (no UI)

```ts
import { web3Service } from "cruzo-web3";
import { Web3SigningComponent } from "cruzo-web3/components/web3-signing";
import { Web3SignerComponent } from "cruzo-web3/components/web3-signer";
```

Package exports point to TypeScript sources in `lib/`. The app bundler (e.g. Vite) compiles them in dev and production — no separate build step in `cruzo-web3` is required.

### App setup

Import cruzo UI **styles** and register **toast** in your app entry (`main.ts`). `modal` registers automatically when you import web3 components (`Web3SignerComponent` imports `cruzo/ui-components/modal`).

Use a single `cruzo` instance in the bundle — in Vite: `resolve.dedupe: ['cruzo']`.

## Setup

Configure `web3Service` once at app startup, before components mount.

`web3Service.setup$` updates when WalletConnect Project ID, TON manifest URL, or wallet config changes — the wallet picker reacts automatically.

### WalletConnect (Ethereum mobile)

WalletConnect is required for **Ethereum → Mobile wallet** in the connect modal.

1. Create a project at [cloud.walletconnect.com](https://cloud.walletconnect.com).
2. Pass the Project ID to `web3Service`:

```ts
import { web3Service } from "cruzo-web3";

web3Service.setWalletConnectProjectId("your_project_id");
```

With Vite:

```env
# .env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

```ts
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (projectId) {
  web3Service.setWalletConnectProjectId(projectId);
}
```

Without a Project ID, the **Mobile wallet (WalletConnect)** option stays disabled in the picker.

### TON Connect manifest

TON wallets (extension and mobile app) require a public `tonconnect-manifest.json`.

1. Add the manifest file to your site root (must be reachable over HTTPS in production).
2. Point `web3Service` to the absolute manifest URL at app bootstrap:

```ts
import { web3Service } from "cruzo-web3";

const tonManifestUrl = new URL("/tonconnect-manifest.json", window.location.href).href;

web3Service.setTonManifestUrl(tonManifestUrl);
```

Example manifest:

```json
{
  "url": "https://cruzo.org",
  "name": "cruzo",
  "iconUrl": "https://cruzo.org/favicon.ico"
}
```

- `url` — canonical app URL (production domain)
- `name` — app name shown in the wallet
- `iconUrl` — square icon, HTTPS

Spec: [Ton Connect manifest](https://github.com/ton-blockchain/ton-connect/blob/main/spec/manifest.md)

Without a manifest URL, TON wallet options stay disabled.

### Custom providers (optional)

```ts
import { web3Service } from "cruzo-web3";

web3Service.configure({
  // hide built-in slots, keep only what you need
  providers: [
    { kind: "ethereum", transport: "extension" },
    { kind: "ton", transport: "app" },
  ],
  customProviders: [
    {
      id: "my-wallet",
      label: "My wallet",
      hint: "Custom EIP-1193 bridge",
      provider: () => myProvider,
    },
  ],
});
```

### Full startup example

```ts
// web3-setup.ts
import { web3Service } from "cruzo-web3";

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (walletConnectProjectId) {
  web3Service.setWalletConnectProjectId(walletConnectProjectId);
}

web3Service.setTonManifestUrl(
  new URL("/tonconnect-manifest.json", window.location.href).href
);
```

```ts
// vite.config.ts
export default defineConfig({
  resolve: { dedupe: ["cruzo"] },
});
```

```ts
// main.ts
import "cruzo/ui-components/vars.css";
import "cruzo/ui-components/button.css";
import "cruzo/ui-components/modal.css";
import "cruzo/ui-components/textarea.css";
import "cruzo/ui-components/toast.css";

import "cruzo/ui-components/toast";
import "site/web3-setup";
import "cruzo-web3/components/web3-signing";
```

```html
<web3-signing-component></web3-signing-component>
```

See [cruzo-starter](https://github.com/MaratBektemirov/cruzo-starter) for a working local setup.

## Components

`Web3SigningComponent` — demo page with payload textarea and two signers. Syncs payload and signer state to the URL.

`Web3SignerComponent` — single signer card with **Connect wallet** and **Sign payload**.

On **Connect wallet**, a modal opens with available providers:

| Network  | Browser extension              | Mobile app        |
|----------|--------------------------------|-------------------|
| Ethereum | MetaMask, Rabby, EIP-1193      | WalletConnect     |
| TON      | Tonkeeper, other TON wallets   | Ton Connect app   |
| Solana   | Phantom, other Solana wallets  | —                 |
| Tron     | TronLink                       | —                 |

Unavailable options are disabled (no extension installed, missing WalletConnect Project ID, or missing TON manifest).

Signer state is stored in the parent bucket:

```ts
{ pubKey: PubKey | null; signed: boolean; wallet?: SignerWallet | null }
```

## `web3Service` API

```ts
// Connect / sign with a built-in wallet
await web3Service.connectWallet("ethereum", "extension");
await web3Service.signWallet(payload, "ethereum", "extension");

// transport: "extension" | "app" | "auto"
// "auto" picks extension if available, otherwise mobile app (Ethereum, TON)
await web3Service.connectWallet("ton", "auto");

// Injected-only shortcuts
await web3Service.connectInjected("ethereum");
await web3Service.signInjected(payload, "solana");

// Custom provider (from web3Service.configure)
await web3Service.connectCustom("my-wallet");
await web3Service.signCustom(payload, "my-wallet");

await web3Service.disconnect();

// Verify signature (async)
const ok = await web3Service.verifySignedContent(content, signature, pubKey);
```

Supported `wallet` / `kind` values: `"ethereum"` | `"ton"` | `"solana"` | `"tron"`.

`verifySignedContent` supports:

- **TON / Solana** — Ed25519 public keys
- **Ethereum** — EVM address in `pubKey` + `personal_sign` signature (ecrecover)
- **Tron** — base58 address in `PubKey` + `signMessageV2` signature
- **sr25519** — not supported yet (throws `UNSUPPORTED_ALGORITHM`)

`userPubKey$` — reactive pub key of the last connected wallet on `web3Service`.

Also available: `detectInjectedWallets()`, `hasInjectedWallet()`, `parsePubKey()`, `isPubKey()`, `isValidPubKey()`, `useProvider()`, `useWalletProvider()`.

## SecretAuth

Verification-only auth protocol: server issues a challenge, client signs it with a private key, server verifies the signature against the public key. Session token format is out of scope.

### Challenge message

```
example.com wants you to prove your signing key:

nonce: k8f3m2x9
exp: 1719667500
```

### Server flow

Verification happens **on the server**. The UI only assembles a proof (`message`, `signature`, `pubKey`) and sends it to your API.

Proof `pubKey` uses `algorithm` (crypto) and `source` (where the key comes from). `signature` is an object:

```json
{
  "message": "example.com wants you to prove your signing key:\n\nnonce: k8f3m2x9\nexp: 1719667500",
  "signature": {
    "value": "0x…"
  },
  "pubKey": {
    "algorithm": "secp256k1",
    "source": "ethereum",
    "value": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "encoding": "hex"
  }
}
```

Raw Ed25519 key mode: `"algorithm": "Ed25519", "source": "raw"`.

WebAuthn passkey mode: `"algorithm": "ES256", "source": "webauthn"`, assertion data in `signature.extension`:

```json
{
  "message": "...",
  "signature": {
    "value": "base64url…",
    "encoding": "base64url",
    "extension": {
      "authenticatorData": "base64url…",
      "clientDataJSON": "base64url…"
    }
  },
  "pubKey": {
    "algorithm": "ES256",
    "source": "webauthn",
    "value": "credentialId-base64url",
    "encoding": "base64url"
  }
}
```

Server verify needs the credential public key from registration:

```ts
const ok = await verifySecretAuthProof(proof, {
  domain: challenge.domain,
  webauthn: {
    credentialPublicKey: storedCredentialPublicKey,
    expectedOrigin: "https://example.com",
  },
});
```

| `algorithm` | `source` | verify |
|-------------|----------|--------|
| `secp256k1` | `ethereum` | EIP-191 / address |
| `secp256k1` | `tron` | Tron address |
| `secp256k1` | `raw` | EIP-191 / address (raw key) |
| `Ed25519` | `ton` / `solana` | Ed25519 (wallet) |
| `Ed25519` | `raw` | Ed25519 (raw key) |
| `ES256` | `webauthn` | WebAuthn assertion |

```ts
import {
  formatSecretAuthChallenge,
  generateSecretAuthNonce,
  verifySecretAuthProof,
} from "cruzo-web3/secret-auth";

const challenge = {
  domain: "example.com",
  nonce: generateSecretAuthNonce(),
  exp: Math.floor(Date.now() / 1000) + 300,
};

const message = formatSecretAuthChallenge(challenge);
// store nonce server-side, send `message` to client

// POST /auth/verify — client sends proof JSON
const ok = await verifySecretAuthProof(proof, { domain: challenge.domain });
// ok → issue your session token (JWT, cookie, etc.)
```

Generate and store nonce on the server. Client-side nonce generation is only for demos and tests.

Public API (`cruzo-web3/secret-auth`): `formatSecretAuthChallenge`, `generateSecretAuthNonce`, `verifySecretAuthProof`, `verifySecretAuthProofLocal` + types.

### Client-side preview

Same checks, structured result — for paste UX or tests. **Not authoritative.**

```ts
import { verifySecretAuthProofLocal } from "cruzo-web3/secret-auth";

const result = await verifySecretAuthProofLocal(proof, { domain: "example.com" });

if (!result.ok) {
  console.log(result.reason); // "expired" | "invalid-signature" | ...
}
```

### Components (cruzo-way)

Challenge lives in **bucket state**; title — in **config**.

```ts
import { RxBucket, componentsRegistryService } from "cruzo";

const authBucket = new RxBucket({
  secretAuth: {
    config: { title: "Sign in" },
  },
});

componentsRegistryService.connectBucket(authBucket);

authBucket.setState("secretAuth", {
  challenge: { domain: "example.com", nonce: "...", exp: 1719667500 },
  proof: null,
  signed: false,
  pubKey: null,
  mode: null,
  wallet: null,
  passkey: null,
});

// after server returns a new challenge:
const current = authBucket.getState("secretAuth") ?? {};
authBucket.setState("secretAuth", {
  ...current,
  challenge,
  proof: null,
  signed: false,
  pubKey: null,
  wallet: null,
});
```

```html
<secret-auth-component
  component-id="secretAuth"
  bucket-id="myAuthBucket">
</secret-auth-component>
```

State in bucket: `{ challenge, proof, signed, pubKey, mode, wallet, passkey }`. Read `proof` and POST it to the server.

## Typecheck

```bash
npm run typecheck
```
