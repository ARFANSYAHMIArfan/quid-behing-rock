import type { Request, Response, NextFunction } from "express";
import {
  getApps,
  initializeApp,
  applicationDefault,
  cert,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { isAllowedAccount } from "../src/lib/access";
export const adminApp =
  getApps()[0] ||
  initializeApp({
    credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
      : applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || "app-rfnsyhmi-s-workspace",
  });
export const adminDB = getFirestore(adminApp);
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }
  try {
    const identity = await getAuth(adminApp).verifyIdToken(
      header.slice(7),
      true,
    );
    if (!isAllowedAccount(identity.email, identity.email_verified)) {
      res
        .status(403)
        .json({ message: "This account does not have workspace access." });
      return;
    }
    res.locals.identity = identity;
    next();
  } catch {
    res
      .status(401)
      .json({ message: "Your session could not be verified. Sign in again." });
  }
}
export function validId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}
export function validateUpload(body: any) {
  if (
    !validId(body.docId) ||
    !["root", "Projects", "Areas", "Resources", "Archive"].includes(
      body.folderId,
    )
  )
    throw new Error("Invalid document or folder.");
  if (
    typeof body.base64Data !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64Data)
  )
    throw new Error("Invalid upload payload.");
  if (body.base64Data.length > 4 * 1024 * 1024)
    throw new Error(
      "Encrypted upload is too large. Maximum original file size: 2 MiB.",
    );
  const payload = JSON.parse(
    Buffer.from(body.base64Data, "base64").toString("utf8"),
  );
  for (const encrypted of [payload, body.encryptedTitle]) {
    if (
      !encrypted ||
      !["iv", "ciphertext", "tag"].every(
        (k) =>
          typeof encrypted[k] === "string" &&
          /^[A-Za-z0-9+/]*={0,2}$/.test(encrypted[k]),
      )
    )
      throw new Error("Invalid encrypted data.");
    if (
      Buffer.from(encrypted.iv, "base64").length !== 12 ||
      Buffer.from(encrypted.tag, "base64").length !== 16
    )
      throw new Error("Invalid encryption envelope.");
  }
  if (Buffer.from(payload.ciphertext, "base64").length > 2 * 1024 * 1024)
    throw new Error("Maximum original file size: 2 MiB.");
  if (body.encryptedTitle.ciphertext.length > 8192)
    throw new Error("Filename is too long.");
  return Buffer.from(body.base64Data, "base64");
}
