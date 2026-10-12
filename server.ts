import "dotenv/config";
import express from "express";
import path from "node:path";
import { Readable } from "node:stream";
import { FieldValue } from "firebase-admin/firestore";
import {
  authenticate,
  adminDB,
  validId,
  validateUpload,
} from "./server/security";
async function upstream(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error("Storage service rejected the request.");
  return response;
}
async function telegram(method: string, init?: RequestInit) {
  if (!process.env.TELEGRAM_BOT_TOKEN)
    throw new Error("Telegram storage has not been configured.");
  const response = await upstream(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    init,
  );
  const data = await response.json();
  if (!data.ok) throw new Error("Telegram could not complete the request.");
  return data.result;
}
async function larkToken() {
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET)
    throw new Error("Lark has not been configured.");
  const data = await (
    await upstream(
      "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: process.env.LARK_APP_ID,
          app_secret: process.env.LARK_APP_SECRET,
        }),
      },
    )
  ).json();
  if (data.code !== 0) throw new Error("Lark authentication failed.");
  return data.tenant_access_token;
}
export async function createApp(apiOnly = false) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", authenticate);
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "4mb" }));
  const requests = new Map<string, { count: number; reset: number }>();
  app.use("/api", (_req, res, next) => {
    const uid = res.locals.identity.uid;
    const now = Date.now();
    for (const [key, bucket] of requests)
      if (bucket.reset < now) requests.delete(key);
    const bucket = requests.get(uid) || { count: 0, reset: now + 60000 };
    requests.set(uid, bucket);
    if (++bucket.count > 60) {
      res
        .status(429)
        .json({ message: "Too many requests. Try again shortly." });
      return;
    }
    next();
  });
  app.get("/api/telegram/status", async (_req, res) => {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      res.json({ configured: false });
      return;
    }
    try {
      const bot = await telegram("getMe");
      res.json({ configured: true, botUsername: bot.username });
    } catch {
      res.json({
        configured: false,
        error: "Telegram connection is unavailable.",
      });
    }
  });
  app.get("/api/lark/health", (_req, res) =>
    res.json({
      configured: !!(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET),
    }),
  );
  app.post("/api/lark/emails", async (_req, res) => {
    const email = res.locals.identity.email;
    const token = await larkToken();
    const data = await (
      await upstream(
        `https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/${encodeURIComponent(email)}/messages?page_size=20&label_id=INBOX`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json();
    if (data.code !== 0) {
      res
        .status(502)
        .json({
          message:
            "Unable to read your Lark mailbox. Check the mailbox and app permissions.",
        });
      return;
    }
    res.json({ emails: data.data?.items || [] });
  });
  app.post("/api/:provider/drive/upload", async (req, res) => {
    const provider = req.params.provider;
    if (!["telegram", "lark"].includes(provider)) {
      res.status(400).json({ message: "Unsupported storage provider." });
      return;
    }
    let buffer: Buffer;
    try {
      buffer = validateUpload(req.body);
    } catch (e) {
      res.status(400).json({ message: (e as Error).message });
      return;
    }
    const { docId, folderId, encryptedTitle, mimeType } = req.body;
    const uid = res.locals.identity.uid;
    const ref = adminDB.collection("documents").doc(docId);
    // Atomically reserve the ID; only the server can create storage metadata.
    try {
      await ref.create({
        ownerId: uid,
        sharedWith: [],
        folderId,
        encryptedTitle,
        mimeType:
          typeof mimeType === "string"
            ? mimeType.slice(0, 256)
            : "application/octet-stream",
        storageProvider: provider,
        state: "uploading",
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {
      res
        .status(409)
        .json({
          message:
            "This upload ID already exists. Retry with a new file upload.",
        });
      return;
    }
    const fileName = `${docId}.enc`;
    const form = new FormData();
    let storagePath: string;
    let telegramMessageId: number | null = null;
    try {
      if (provider === "telegram") {
        if (!process.env.TELEGRAM_CHAT_ID)
          throw new Error("Telegram chat is not configured.");
        form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
        form.append("document", new Blob([new Uint8Array(buffer)]), fileName);
        const result = await telegram("sendDocument", {
          method: "POST",
          body: form,
        });
        storagePath = result.document?.file_id;
        telegramMessageId = result.message_id;
      } else {
        form.append("file_name", fileName);
        form.append("parent_type", "explorer");
        form.append("parent_node", process.env.LARK_DRIVE_FOLDER_TOKEN || "");
        form.append("size", String(buffer.length));
        form.append("file", new Blob([new Uint8Array(buffer)]), fileName);
        const data = await (
          await upstream(
            "https://open.larksuite.com/open-apis/drive/v1/files/upload_all",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${await larkToken()}` },
              body: form,
            },
          )
        ).json();
        if (data.code !== 0) throw new Error("Lark upload failed.");
        storagePath = data.data?.file_token;
      }
      if (!storagePath)
        throw new Error("Storage did not return a file identifier.");
      await ref.update({
        storagePath,
        telegramMessageId,
        state: "ready",
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.json({ docId, message: "Uploaded" });
    } catch {
      // Keep reservation for recovery if an upstream upload happened before metadata failed.
      await ref.update({ state: "upload_failed" }).catch(() => {});
      res
        .status(502)
        .json({
          message:
            "Upload could not finish. A failed upload record was kept for recovery.",
        });
    }
  });
  app.use("/api/drive/:docId", async (req, res, next) => {
    const docId = req.params.docId;
    if (!validId(docId)) {
      res.status(400).json({ message: "Invalid document." });
      return;
    }
    const snapshot = await adminDB.collection("documents").doc(docId).get();
    if (
      !snapshot.exists ||
      snapshot.data()?.ownerId !== res.locals.identity.uid
    ) {
      res.status(404).json({ message: "Document not found." });
      return;
    }
    const metadata = snapshot.data()!;
    if (!metadata.storagePath) {
      res
        .status(409)
        .json({
          message:
            "This upload is incomplete. Contact the workspace owner for recovery.",
        });
      return;
    }
    res.locals.document = metadata;
    res.locals.documentRef = snapshot.ref;
    next();
  });
  app.get("/api/drive/:docId/download", async (_req, res) => {
    const meta = res.locals.document;
    let response: globalThis.Response;
    if (meta.storageProvider === "telegram" || meta.storagePath.includes(":")) {
      const id = meta.telegramFileId || meta.storagePath.split(":")[0];
      const file = await telegram(`getFile?file_id=${encodeURIComponent(id)}`);
      if (
        typeof file.file_path !== "string" ||
        !/^[a-zA-Z0-9_./-]+$/.test(file.file_path) ||
        file.file_path.includes("..")
      )
        throw new Error("Invalid storage path.");
      response = await upstream(
        `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
      );
    } else
      response = await upstream(
        `https://open.larksuite.com/open-apis/drive/v1/files/${encodeURIComponent(meta.storagePath)}/download`,
        { headers: { Authorization: `Bearer ${await larkToken()}` } },
      );
    if (!response.body) throw new Error("File unavailable.");
    res.type("application/octet-stream");
    Readable.fromWeb(response.body as any)
      .on("error", () => res.destroy())
      .pipe(res);
  });
  app.delete("/api/drive/:docId", async (_req, res) => {
    const meta = res.locals.document;
    if (meta.storageProvider === "telegram" || meta.storagePath.includes(":")) {
      const messageId =
        meta.telegramMessageId || meta.storagePath.split(":")[1];
      if (!messageId || !process.env.TELEGRAM_CHAT_ID) {
        res
          .status(409)
          .json({
            message:
              "The original Telegram message cannot be located. Your file record was kept.",
          });
        return;
      }
      await telegram("deleteMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          message_id: Number(messageId),
        }),
      });
    } else {
      const data = await (
        await upstream(
          `https://open.larksuite.com/open-apis/drive/v1/files/${encodeURIComponent(meta.storagePath)}?type=file`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${await larkToken()}` },
          },
        )
      ).json();
      if (data.code !== 0)
        throw new Error("Storage deletion failed. Your file record was kept.");
    }
    await res.locals.documentRef.delete();
    res.json({ message: "Deleted" });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "API route not found." }),
  );
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) return;
      const status = error.type === "entity.too.large" ? 413 : 502;
      res
        .status(status)
        .json({
          message:
            status === 413
              ? "File exceeds the upload limit."
              : "The request could not finish. Your records have been kept. Check your connection or storage configuration.",
        });
    },
  );
  if (!apiOnly && process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!apiOnly) {
    const dist = path.join(process.cwd(), "dist");
    app.use(express.static(dist));
    app.get("/{*all}", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  return app;
}
if (process.env.WORKSPACE_TEST !== "1" && !process.env.VERCEL)
  createApp().then((app) =>
    app.listen(Number(process.env.PORT) || 3000, "0.0.0.0"),
  );
