# Personal Web Workspace

React/Vite frontend, Firebase Authentication and encrypted Firestore records,
with authenticated Vercel Functions for Lark Mail and Lark/Telegram file storage.

## Development

Node.js 22+ and Java 21 (only for Firestore rules tests).

```sh
npm ci
npm run dev
npm run lint
npm test
npm run test:rules
npm run build
# Optional self-hosted Express server (Vercel uses api/index.ts instead):
npm run build:server
npm start
```

## Vercel deployment checklist

1. Import this GitHub repository in Vercel. Use npm, build `npm run build`, output
   `dist`, and Node.js 22+. `vercel.json` routes API requests to the Express function
   and supports client-side page navigation.
2. In Vercel's **Environment Variables**, add `FIREBASE_PROJECT_ID` and
   `FIREBASE_SERVICE_ACCOUNT_JSON`. The latter is backend-only JSON for a service
   account belonging to this Firebase project; never commit it or paste it into a
   chat. It must be able to verify Firebase Auth token revocation and access
   Firestore. Add existing Lark and Telegram variables from `.env.example` as
   needed. No Google account password or master passphrase belongs in Vercel.
3. Deploy Firestore rules and indexes to the correct project before enabling
   the new frontend/backend together:
   `npx firebase deploy --only firestore:rules,firestore:indexes --project app-rfnsyhmi-s-workspace`.
   Make a database backup first. Vercel does not deploy Firestore rules.
4. Keep the Firebase Auth authorized-domain list limited to your real workspace
   domains. For a preview, authorize its exact hostname explicitly rather than
   bypassing auth. Verify Google sign-in, unlock, upload/download/rename/move,
   deletion, and CRUD for notes/tasks/events/transactions in that environment.
5. Only promote the preview after these checks pass; this change does not
   automatically deploy from the feature branch to production.

## Encryption and migration

New vaults use random data keys and per-user random Argon2id salts. A passphrase-
derived wrapping key encrypts the data key; a verifier confirms successful unlock.
The ECDH private key is encrypted and persisted instead of recreated each unlock.
Unwrapped keys remain in memory; inactivity for 15 minutes locks the vault.

For existing owned Drive files, first unlock verifies **every existing filename**
with the original legacy key. It wraps that key with a new salted wrapping key,
preserving existing file payloads. A wrong passphrase causes no metadata migration.
Concurrent setup uses a transaction; an existing vault cannot be overwritten by
client writes. This release does not implement passphrase changes or recovery.
Do not remove your user vault configuration manually.

The old shared `demo-doc-123` annotation data had no verifiable ownership. It is
retained in Firestore but denied to clients; it is not automatically assigned to
any account. Export/back up this data and perform an owner-reviewed migration if
needed. New notes and sketches use encrypted, account-scoped records instead.

## Scope and limits

- Tasks, notes/sketches, calendar events and MYR transactions are encrypted and
  persisted under `users/{uid}/records`; search runs locally after unlock.
- Calendar is the workspace's own calendar; Google Calendar synchronization,
  recurring events and external reminders are not included. Event times use the
  device timezone.
- Cloud Drive folder filters, move and rename are functional. Sharing stays
  disabled until an explicit document-key exchange and permissions flow is built.
- Uploads through Vercel are capped at **2 MiB of original file data** because the
  current JSON/base64 envelope expands the request. Larger files require direct
  uploads or another storage transport. Existing provider download restrictions
  still apply.
- Backend verification requires verified, allowlisted Firebase identities.
  Storage metadata is created only by the server. Download/delete resolve a
  document ID and check its owner; callers cannot submit another file token or
  arbitrary mailbox. Deletion keeps metadata when a provider reports failure.
- An upstream upload followed by a database failure can leave a recovery record;
  inspect incomplete uploads before manually reconciling provider storage.
- API rate limiting is per warm Vercel instance; use Vercel Firewall or a shared
  limiter for deployment-wide abuse protection.
- Mail lists the signed-in account's Lark inbox; it does not send mail or implement
  a message reader. Missing mailbox permissions produce an actionable error.
