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
