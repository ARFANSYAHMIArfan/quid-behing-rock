import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { getAuth } from "firebase-admin/auth";
import { adminApp, adminDB, validateUpload } from "../server/security";
import { createApp } from "../server";
import { CryptoEngine } from "../src/services/CryptoEngine";
import { isAllowedAccount } from "../src/lib/access";
let server: Server;
let origin: string;
const realFetch = globalThis.fetch;
const auth = getAuth(adminApp);
const originalVerify = auth.verifyIdToken;
const originalCollection = adminDB.collection;
const document = {
  ownerId: "owner",
  storagePath: "file-token",
  storageProvider: "lark",
};
let deleted = false;
let mailboxUrl = "";
before(async () => {
  process.env.LARK_APP_ID = "test";
  process.env.LARK_APP_SECRET = "test";
  (auth as any).verifyIdToken = async (token: string) => {
    if (token === "invalid") throw Error();
    return {
      uid: token,
      email: "rfnsyhmi.principal@gmail.com",
      email_verified: token !== "unverified",
    };
  };
  (adminDB as any).collection = () => ({
    doc: () => ({
      get: async () => ({
        exists: true,
        data: () => document,
        ref: {
          delete: async () => {
            deleted = true;
          },
        },
      }),
    }),
  });
  const app = await createApp(true);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  globalThis.fetch = async (input: any, init: any) => {
    const url = String(input);
    if (url.startsWith(origin)) return realFetch(input, init);
    if (url.includes("/tenant_access_token/"))
      return new Response(
        JSON.stringify({ code: 0, tenant_access_token: "test-token" }),
      );
    if (url.includes("/mail/v1/")) {
      mailboxUrl = url;
      return new Response(JSON.stringify({ code: 0, data: { items: [] } }));
    }
    return new Response(
      JSON.stringify({ code: 999, msg: "Storage refused deletion" }),
    );
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  (auth as any).verifyIdToken = originalVerify;
  (adminDB as any).collection = originalCollection;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test("account access rejects lookalike domains and unverified accounts", () => {
  assert.equal(isAllowedAccount("user@kitabuddy.dpdns.org", true), true);
  assert.equal(
    isAllowedAccount("user@kitabuddy.dpdns.org.attacker.test", true),
    false,
  );
  assert.equal(isAllowedAccount("rfnsyhmi.principal@gmail.com", false), false);
});
test("protected endpoints reject missing, invalid and unverified tokens", async () => {
  for (const token of ["", "invalid", "unverified"]) {
    const r = await fetch(`${origin}/api/telegram/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    assert.equal(r.status, token === "unverified" ? 403 : 401);
  }
});
test("another user cannot download or delete an owner file", async () => {
  for (const [path, method] of [
    ["/download", "GET"],
    ["", "DELETE"],
  ]) {
    const r = await fetch(`${origin}/api/drive/doc-1${path}`, {
      method,
      headers: { Authorization: "Bearer other" },
    });
    assert.equal(r.status, 404);
  }
  assert.equal(deleted, false);
});
test("upstream deletion failure preserves document metadata", async () => {
  const r = await fetch(`${origin}/api/drive/doc-1`, {
    method: "DELETE",
    headers: { Authorization: "Bearer owner" },
  });
  assert.equal(r.status, 502);
  assert.equal(deleted, false);
});
test("upload validation rejects malformed and oversized envelopes", () => {
  assert.throws(() =>
    validateUpload({ docId: "../../escape", folderId: "root" }),
  );
  assert.throws(() =>
    validateUpload({
      docId: "doc",
      folderId: "root",
      base64Data: "A".repeat(4 * 1024 * 1024 + 1),
    }),
  );
  assert.throws(() =>
    validateUpload({
      docId: "doc",
      folderId: "root",
      base64Data: Buffer.from("{}").toString("base64"),
    }),
  );
});
test("AES-GCM round trip, tamper rejection and salted key wrapping", async () => {
  (globalThis as any).window = globalThis;
  const dataKey = await CryptoEngine.generateDEK();
  const plaintext = CryptoEngine.encodeText("private note");
  const envelope = await CryptoEngine.encryptPayload(plaintext, dataKey);
  assert.equal(
    CryptoEngine.decodeText(
      await CryptoEngine.decryptPayload(envelope, dataKey),
    ),
    "private note",
  );
  const broken = {
    ...envelope,
    tag: CryptoEngine.bufferToBase64(new Uint8Array(16)),
  };
  await assert.rejects(CryptoEngine.decryptPayload(broken, dataKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await CryptoEngine.deriveMasterKey("test passphrase 123", salt);
  const wrapped = await CryptoEngine.encryptPayload(
    CryptoEngine.base64ToBuffer(await CryptoEngine.exportKeyToBase64(dataKey)),
    key,
  );
  const wrong = await CryptoEngine.deriveMasterKey(
    "wrong passphrase 123",
    salt,
  );
  await assert.rejects(CryptoEngine.decryptPayload(wrapped, wrong));
  const restored = await CryptoEngine.importAESKeyFromBase64(
    CryptoEngine.bufferToBase64(
      await CryptoEngine.decryptPayload(wrapped, key),
    ),
    false,
  );
  assert.equal(
    CryptoEngine.decodeText(
      await CryptoEngine.decryptPayload(envelope, restored),
    ),
    "private note",
  );
  assert.equal(restored.extractable, false);
});

test("mail proxy uses verified identity rather than a submitted mailbox", async () => {
  const response = await fetch(`${origin}/api/lark/emails`, {
    method: "POST",
    headers: {
      Authorization: "Bearer owner",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userEmail: "victim@example.com" }),
  });
  assert.equal(response.status, 200);
  assert.match(decodeURIComponent(mailboxUrl), /rfnsyhmi.principal@gmail.com/);
  assert.doesNotMatch(mailboxUrl, /victim/);
});
