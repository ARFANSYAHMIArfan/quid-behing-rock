import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";

async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const response = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`Lark Auth Failed: ${data.msg || JSON.stringify(data)}`);
  }
  return data.tenant_access_token;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "50mb" })); // Increased limit for base64 file uploads

  // --- LARK API SECURE PROXY ---
  app.get("/api/lark/health", (req, res) => {
    res.json({ status: "ok", message: "Lark proxy server is active" });
  });

  // 1. Mail Inbox Proxy
  app.post("/api/lark/emails", async (req, res) => {
    try {
      const appId = process.env.LARK_APP_ID;
      const appSecret = process.env.LARK_APP_SECRET;
      const { userEmail } = req.body;

      if (!appId || !appSecret) {
        return res.status(500).json({ 
          error: "Missing credentials", 
          message: "LARK_APP_ID or LARK_APP_SECRET is not configured on the server."
        });
      }

      if (!userEmail) {
        return res.status(400).json({ error: "Missing parameters", message: "userEmail is required" });
      }

      const token = await getTenantAccessToken(appId, appSecret);
      const mailboxId = encodeURIComponent(userEmail);
      const mailResponse = await fetch(`https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/${mailboxId}/messages?page_size=20&label_id=INBOX`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      
      const mailData = await mailResponse.json();
      
      if (mailData.code !== 0) {
        console.error("Lark API Mail Fetch Error:", mailData);
        return res.status(400).json({ error: "Lark API Error", message: mailData.msg, details: mailData });
      }

      res.json({ message: "Success", emails: mailData.data?.items || [] });
    } catch (error: any) {
      console.error("Lark API Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  });

  // 2. Drive Upload Proxy
  app.post("/api/lark/drive/upload", async (req, res) => {
    try {
      const appId = process.env.LARK_APP_ID;
      const appSecret = process.env.LARK_APP_SECRET;
      const { fileName, base64Data } = req.body;

      if (!appId || !appSecret) {
        return res.status(500).json({ error: "Missing credentials", message: "LARK_APP_ID or LARK_APP_SECRET is not configured." });
      }
      if (!fileName || !base64Data) {
        return res.status(400).json({ error: "Missing parameters", message: "fileName and base64Data are required" });
      }

      const token = await getTenantAccessToken(appId, appSecret);
      const buffer = Buffer.from(base64Data, "base64");
      
      const formData = new FormData();
      formData.append("file_name", fileName);
      formData.append("parent_type", "explorer");
      formData.append("parent_node", ""); // Root folder
      formData.append("size", buffer.length.toString());
      
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      formData.append("file", blob, fileName);

      const uploadResponse = await fetch("https://open.larksuite.com/open-apis/drive/v1/files/upload_all", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const uploadData = await uploadResponse.json();
      if (uploadData.code !== 0) {
        console.error("Lark Upload Error:", uploadData);
        return res.status(400).json({ error: "Lark Upload Error", message: uploadData.msg });
      }

      res.json({ message: "Success", fileToken: uploadData.data.file_token });
    } catch (error: any) {
      console.error("Lark Drive Upload Error:", error);
      res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  });

  // 3. Drive Download Proxy (Optional, for later if user wants to download)
  app.get("/api/lark/drive/download/:fileToken", async (req, res) => {
    try {
      const appId = process.env.LARK_APP_ID;
      const appSecret = process.env.LARK_APP_SECRET;
      const { fileToken } = req.params;

      if (!appId || !appSecret) return res.status(500).send("Missing credentials");

      const token = await getTenantAccessToken(appId, appSecret);
      const downloadResponse = await fetch(`https://open.larksuite.com/open-apis/drive/v1/files/${fileToken}/download`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!downloadResponse.ok || !downloadResponse.body) {
        return res.status(downloadResponse.status).send("Failed to download file from Lark");
      }

      // Stream the file back to the client using Node streams
      const { Readable } = await import("stream");
      // @ts-ignore - Readable.fromWeb exists in Node 18+
      Readable.fromWeb(downloadResponse.body).pipe(res);
    } catch (error: any) {
      console.error("Lark Drive Download Error:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // 4. Drive Delete Proxy
  app.delete("/api/lark/drive/files/:fileToken", async (req, res) => {
    try {
      const appId = process.env.LARK_APP_ID;
      const appSecret = process.env.LARK_APP_SECRET;
      const { fileToken } = req.params;

      if (!appId || !appSecret) return res.status(500).send("Missing credentials");

      const token = await getTenantAccessToken(appId, appSecret);
      const deleteResponse = await fetch(`https://open.larksuite.com/open-apis/drive/v1/files/${fileToken}?type=file`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });

      const data = await deleteResponse.json();
      if (data.code !== 0) {
        console.error("Lark Drive Delete Error:", data);
        return res.status(400).json({ error: "Lark Delete Error", message: data.msg });
      }

      res.json({ message: "File deleted successfully" });
    } catch (error: any) {
      console.error("Lark Drive Delete Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // --- TELEGRAM BOT CLOUD STORAGE API ---
  app.get("/api/telegram/status", async (req, res) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (!botToken || !chatId) {
        return res.json({
          configured: false,
          message: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured in server environment."
        });
      }

      // Verify token with Telegram getMe
      const checkRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const checkData = await checkRes.json();

      if (!checkData.ok) {
        return res.json({
          configured: false,
          error: checkData.description || "Invalid bot token"
        });
      }

      res.json({
        configured: true,
        botUsername: checkData.result?.username,
        botName: checkData.result?.first_name,
        chatIdConfigured: Boolean(chatId)
      });
    } catch (error: any) {
      console.error("Telegram status check error:", error);
      res.status(500).json({ configured: false, error: error.message });
    }
  });

  // 1. Upload Encrypted File to Telegram Bot Storage
  app.post("/api/telegram/drive/upload", async (req, res) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      const { fileName, base64Data } = req.body;

      if (!botToken || !chatId) {
        return res.status(500).json({
          error: "Missing credentials",
          message: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured on the server."
        });
      }

      if (!fileName || !base64Data) {
        return res.status(400).json({
          error: "Missing parameters",
          message: "fileName and base64Data are required"
        });
      }

      const buffer = Buffer.from(base64Data, "base64");
      const blob = new Blob([buffer], { type: "application/octet-stream" });

      const formData = new FormData();
      formData.append("chat_id", chatId);
      formData.append("caption", `🔒 E2EE File: ${fileName}\nStored via Personal Web Workspace Cloud Drive`);
      formData.append("document", blob, fileName);

      const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: "POST",
        body: formData
      });

      const telegramData = await telegramRes.json();
      if (!telegramData.ok) {
        console.error("Telegram upload failed:", telegramData);
        return res.status(400).json({
          error: "Telegram API Error",
          message: telegramData.description || "Failed to upload file to Telegram"
        });
      }

      const fileId = telegramData.result?.document?.file_id;
      const messageId = telegramData.result?.message_id;

      if (!fileId) {
        return res.status(500).json({
          error: "Telegram Error",
          message: "No document file_id returned by Telegram"
        });
      }

      // Return both fileId and messageId (stored as composite token if needed)
      res.json({
        message: "Success",
        fileId: fileId,
        messageId: messageId,
        storagePath: `${fileId}:${messageId}`
      });
    } catch (error: any) {
      console.error("Telegram Upload Error:", error);
      res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
  });

  // 2. Download File from Telegram
  app.get("/api/telegram/drive/download/:fileId", async (req, res) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const { fileId } = req.params;

      if (!botToken) {
        return res.status(500).send("TELEGRAM_BOT_TOKEN is not configured on the server.");
      }

      // Step A: Get File Path from Telegram
      const getFileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
      const getFileData = await getFileRes.json();

      if (!getFileData.ok || !getFileData.result?.file_path) {
        console.error("Telegram getFile error:", getFileData);
        return res.status(404).send(getFileData.description || "File not found on Telegram");
      }

      const filePath = getFileData.result.file_path;

      // Step B: Download Binary from Telegram
      const downloadRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
      if (!downloadRes.ok || !downloadRes.body) {
        return res.status(downloadRes.status).send("Failed to stream file from Telegram");
      }

      const { Readable } = await import("stream");
      // @ts-ignore - Readable.fromWeb exists in Node 18+
      Readable.fromWeb(downloadRes.body).pipe(res);
    } catch (error: any) {
      console.error("Telegram Download Error:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  // 3. Delete File from Telegram Chat
  app.delete("/api/telegram/drive/files/:fileId", async (req, res) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      const messageId = req.query.messageId as string;

      if (botToken && chatId && messageId) {
        // Attempt to delete message from chat/channel
        await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: parseInt(messageId, 10)
          })
        }).catch(err => console.warn("Telegram message delete warning:", err));
      }

      res.json({ message: "Telegram file record deleted successfully" });
    } catch (error: any) {
      console.error("Telegram Delete Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vite middleware for frontend development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
