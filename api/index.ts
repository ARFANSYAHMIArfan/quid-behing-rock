import express from "express";
import cors from "cors";
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  HeadBucketCommand 
} from "@aws-sdk/client-s3";
import { Readable } from "stream";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Cloudflare R2 Credentials & Defaults
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "582f56f4b43ffae6cd39f32868762050";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "7c5cd3185bf7631978d12d742b10199d";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "4315c5976a6bf1700d0f367c63fa5e39fcae45ede8b4d2f2e83b9f6c28b0ac38";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "rfnsyhmi-workspace";
const R2_PUBLIC_DEV_URL = process.env.R2_PUBLIC_DEV_URL || "https://pub-bceec50286f2449da6fb6c9737572025.r2.dev";
const R2_CUSTOM_DOMAIN = (process.env.R2_CUSTOM_DOMAIN && process.env.R2_CUSTOM_DOMAIN !== "bucket-rfnsyhmi.cc.cd") ? process.env.R2_CUSTOM_DOMAIN : "rfnsyhmi.dpdns.org";

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

// Router to support both /api/r2/* and /r2/*
const r2Router = express.Router();

// 1. Check R2 Status and Bucket Connectivity
r2Router.get("/status", async (_req, res) => {
  try {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      return res.json({
        configured: false,
        error: "Cloudflare R2 credentials or bucket name are missing.",
      });
    }

    const client = getR2Client();
    await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));

    res.json({
      configured: true,
      bucket: R2_BUCKET_NAME,
      accountId: R2_ACCOUNT_ID,
      publicDevUrl: R2_PUBLIC_DEV_URL,
      customDomain: R2_CUSTOM_DOMAIN,
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    });
  } catch (error: any) {
    console.warn("Cloudflare R2 HeadBucket status warning:", error?.message || error);
    res.json({
      configured: true,
      bucket: R2_BUCKET_NAME,
      accountId: R2_ACCOUNT_ID,
      publicDevUrl: R2_PUBLIC_DEV_URL,
      customDomain: R2_CUSTOM_DOMAIN,
      warning: error?.message || "Bucket reachable with standard object credentials.",
    });
  }
});

// 2. Upload Object to Cloudflare R2
r2Router.post("/upload", async (req, res) => {
  try {
    const { key, base64Data, contentType } = req.body;

    if (!key || !base64Data) {
      return res.status(400).json({
        error: "Missing parameters",
        message: "key and base64Data are required for R2 upload",
      });
    }

    const client = getR2Client();
    const buffer = Buffer.from(base64Data, "base64");

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    });

    await client.send(command);

    const publicUrl = `${R2_PUBLIC_DEV_URL}/${encodeURIComponent(key)}`;

    res.json({
      message: "Success",
      key,
      bucket: R2_BUCKET_NAME,
      publicUrl,
      size: buffer.length,
    });
  } catch (error: any) {
    console.error("Cloudflare R2 Upload Error:", error);
    res.status(500).json({
      error: "R2_UPLOAD_ERROR",
      message: error.message || "Failed to upload object to Cloudflare R2",
    });
  }
});

// 3. Download Object from Cloudflare R2
r2Router.get("/download/:key", async (req, res) => {
  try {
    const { key } = req.params;
    if (!key) {
      return res.status(400).send("Object key is required");
    }

    const client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
      return res.status(404).send("Object body not found in R2");
    }

    if (response.ContentType) {
      res.setHeader("Content-Type", response.ContentType);
    }
    if (response.ContentLength) {
      res.setHeader("Content-Length", response.ContentLength.toString());
    }

    // Stream the object from R2 back to client
    // @ts-ignore
    const stream = response.Body as any;
    if (typeof stream.pipe === "function") {
      stream.pipe(res);
    } else {
      // @ts-ignore
      Readable.fromWeb(stream).pipe(res);
    }
  } catch (error: any) {
    const statusCode = error.$metadata?.httpStatusCode || (error.name === "NoSuchKey" ? 404 : 500);
    if (statusCode === 404 || error.name === "NoSuchKey") {
      return res.status(404).json({
        error: "NoSuchKey",
        message: `Fail '${req.params.key}' tidak wujud dalam bucket Cloudflare R2.`
      });
    }
    console.error("Cloudflare R2 Download Error:", error);
    res.status(statusCode).json({
      error: error.name || "R2_DOWNLOAD_ERROR",
      message: error.message || "Failed to download object from R2"
    });
  }
});

// 4. Delete Object from Cloudflare R2
r2Router.delete("/files/:key", async (req, res) => {
  try {
    const { key } = req.params;
    if (!key) {
      return res.status(400).json({ error: "Object key is required" });
    }

    const client = getR2Client();
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await client.send(command);

    res.json({ message: "Object deleted successfully from Cloudflare R2" });
  } catch (error: any) {
    console.error("Cloudflare R2 Delete Error:", error);
    res.status(500).json({ error: "R2_DELETE_ERROR", message: error.message });
  }
});

// Mount router under both /api/r2 and /r2 (to handle various rewrite styles)
app.use("/api/r2", r2Router);
app.use("/r2", r2Router);

export default app;
