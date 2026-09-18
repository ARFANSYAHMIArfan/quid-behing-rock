import React, { useState, useRef, useEffect, type ChangeEvent } from "react";
import { 
  Cloud, 
  FileText, 
  Upload, 
  Loader2, 
  HardDrive, 
  Download, 
  Trash2, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Server
} from "lucide-react";
import { collection, doc, setDoc, query, where, onSnapshot, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useCrypto } from "../contexts/CryptoContext";
import { useAuth } from "../contexts/AuthContext";
import { CryptoEngine } from "../services/CryptoEngine";

interface DocumentMeta {
  id: string;
  ownerId: string;
  sharedWith: string[];
  folderId: string;
  mimeType: string;
  storagePath: string; // Lark file_token OR Telegram fileId(:messageId)
  storageProvider?: "telegram" | "lark";
  telegramFileId?: string;
  telegramMessageId?: number | string | null;
  encryptedTitle: {
    iv: string;
    ciphertext: string;
    tag: string;
  };
  createdAt: number;
}

export default function CloudDrive() {
  const { masterKey } = useCrypto();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeProvider, setActiveProvider] = useState<"telegram" | "lark">("telegram");
  const [telegramStatus, setTelegramStatus] = useState<{
    configured: boolean;
    botUsername?: string;
    botName?: string;
    error?: string;
  } | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<{ meta: DocumentMeta; decryptedTitle: string }[]>([]);

  // Check Telegram Bot configuration status
  useEffect(() => {
    async function checkTelegram() {
      try {
        const res = await fetch("/api/telegram/status");
        if (res.ok) {
          const data = await res.json();
          setTelegramStatus(data);
        }
      } catch (e) {
        console.warn("Failed to check Telegram status", e);
      }
    }
    checkTelegram();
  }, []);

  // Listen to user's documents metadata from Firestore
  useEffect(() => {
    if (!user || !masterKey) return;
    
    const q = query(collection(db, "documents"), where("ownerId", "==", user.uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const docs: { meta: DocumentMeta; decryptedTitle: string }[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as DocumentMeta;
        try {
          const decryptedBytes = await CryptoEngine.decryptPayload(data.encryptedTitle, masterKey);
          const decryptedTitle = new TextDecoder().decode(decryptedBytes);
          docs.push({ meta: { ...data, id: docSnap.id }, decryptedTitle });
        } catch (e) {
          console.error("Failed to decrypt title for doc", docSnap.id);
          docs.push({ meta: { ...data, id: docSnap.id }, decryptedTitle: "Encrypted Document" });
        }
      }
      setDocuments(docs);
    });

    return () => unsubscribe();
  }, [user, masterKey]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !masterKey) return;

    // Telegram Bot API document size limit is ~50MB
    if (activeProvider === "telegram" && file.size > 50 * 1024 * 1024) {
      alert("Telegram Bot API has a 50MB file size limit per document. Please select a smaller file or use Lark Drive.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      // 1. Read file as ArrayBuffer & Encrypt client-side
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 2. Encrypt the file payload using AES-256-GCM
      const encryptedFile = await CryptoEngine.encryptPayload(bytes, masterKey);

      // 3. Encrypt the filename
      const titleBytes = new TextEncoder().encode(file.name);
      const encryptedTitle = await CryptoEngine.encryptPayload(titleBytes, masterKey);

      // 4. Generate Document ID
      const docId = crypto.randomUUID();

      // Convert JSON encrypted payload into base64 for upload proxy
      const payloadString = JSON.stringify(encryptedFile);
      const base64Data = btoa(encodeURIComponent(payloadString).replace(/%([0-9A-F]{2})/g,
          (match, p1) => String.fromCharCode('0x' + p1 as any)));

      if (activeProvider === "telegram") {
        // --- UPLOAD TO TELEGRAM BOT STORAGE ---
        const uploadRes = await fetch("/api/telegram/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: `${docId}.enc`,
            base64Data: base64Data
          })
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.message || "Failed to upload to Telegram Bot Storage");
        }

        const storagePath = uploadData.storagePath || uploadData.fileId;

        // Save metadata in Firestore
        const docRef = doc(db, "documents", docId);
        await setDoc(docRef, {
          ownerId: user.uid,
          sharedWith: [],
          folderId: "root",
          mimeType: file.type || "application/octet-stream",
          storageProvider: "telegram",
          storagePath: storagePath,
          telegramFileId: uploadData.fileId,
          telegramMessageId: uploadData.messageId || null,
          encryptedTitle: encryptedTitle,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

      } else {
        // --- UPLOAD TO LARK DRIVE ---
        const uploadRes = await fetch("/api/lark/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: `${docId}.enc`,
            base64Data: base64Data
          })
        });
        
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.message || "Failed to upload to Lark Drive");
        }

        const fileToken = uploadData.fileToken;

        // Save metadata to Firestore
        const docRef = doc(db, "documents", docId);
        await setDoc(docRef, {
          ownerId: user.uid,
          sharedWith: [],
          folderId: "root",
          mimeType: file.type || "application/octet-stream",
          storageProvider: "lark",
          storagePath: fileToken,
          encryptedTitle: encryptedTitle,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

    } catch (error: any) {
      console.error("File upload failed:", error);
      alert(`Failed to encrypt and save file. Error: ${error.message || error}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadAndDecrypt = async (docItem: { meta: DocumentMeta; decryptedTitle: string }) => {
    if (!masterKey) return;
    setDownloadingId(docItem.meta.id);
    
    try {
      let downloadUrl = "";
      const isTelegram = docItem.meta.storageProvider === "telegram" || (docItem.meta.storagePath && docItem.meta.storagePath.includes(":"));

      if (isTelegram) {
        // Extract raw telegram fileId
        const fileId = docItem.meta.telegramFileId || docItem.meta.storagePath.split(":")[0];
        downloadUrl = `/api/telegram/drive/download/${encodeURIComponent(fileId)}`;
      } else {
        downloadUrl = `/api/lark/drive/download/${encodeURIComponent(docItem.meta.storagePath)}`;
      }

      const res = await fetch(downloadUrl);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to fetch file from storage: ${errText || res.statusText}`);
      }

      const blob = await res.blob();
      const text = await blob.text();
      const encryptedFile = JSON.parse(text);

      // Decrypt the payload
      const decryptedBytes = await CryptoEngine.decryptPayload(encryptedFile, masterKey);

      // Create a Blob from the decrypted bytes
      const outBlob = new Blob([decryptedBytes], { type: docItem.meta.mimeType });
      const url = URL.createObjectURL(outBlob);

      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = docItem.decryptedTitle;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error: any) {
      console.error("Failed to download/decrypt:", error);
      alert(`Failed to download and decrypt file. ${error.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (docItem: { meta: DocumentMeta; decryptedTitle: string }) => {
    if (!confirm(`Are you sure you want to delete "${docItem.decryptedTitle}"?`)) return;
    
    setDeletingId(docItem.meta.id);
    try {
      const isTelegram = docItem.meta.storageProvider === "telegram" || (docItem.meta.storagePath && docItem.meta.storagePath.includes(":"));

      if (isTelegram) {
        try {
          const fileId = docItem.meta.telegramFileId || docItem.meta.storagePath.split(":")[0];
          const messageId = docItem.meta.telegramMessageId || (docItem.meta.storagePath.includes(":") ? docItem.meta.storagePath.split(":")[1] : "");
          await fetch(`/api/telegram/drive/files/${encodeURIComponent(fileId)}?messageId=${encodeURIComponent(String(messageId || ""))}`, {
            method: "DELETE"
          });
        } catch (tgErr) {
          console.warn("Telegram delete error:", tgErr);
        }
      } else {
        try {
          const safeToken = encodeURIComponent(docItem.meta.storagePath);
          await fetch(`/api/lark/drive/files/${safeToken}`, {
            method: "DELETE"
          });
        } catch (larkError) {
          console.warn("Lark API delete bypassed:", larkError);
        }
      }

      // Delete metadata from Firestore
      await deleteDoc(doc(db, "documents", docItem.meta.id));
      
    } catch (error: any) {
      console.error("Failed to delete:", error);
      alert(`Gagal memadam fail dari pangkalan data: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col p-8 bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <HardDrive className="h-6 w-6 text-sky-600" />
            Cloud Drive Vault
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Zero-Knowledge Client-Side AES-256-GCM Encrypted Storage
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || (activeProvider === "telegram" && telegramStatus?.configured === false)}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Encrypting & Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload to {activeProvider === "telegram" ? "Telegram" : "Lark"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Storage Backend Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            Active Storage Engine
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveProvider("telegram")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeProvider === "telegram"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              Telegram Bot Storage
              {telegramStatus?.configured ? (
                <span className="flex h-2 w-2 rounded-full bg-emerald-300" title="Bot Connected" />
              ) : (
                <span className="flex h-2 w-2 rounded-full bg-amber-300" title="Config Required" />
              )}
            </button>
            <button
              onClick={() => setActiveProvider("lark")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeProvider === "lark"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              Lark Drive
            </button>
          </div>
        </div>

        {/* Informative banner depending on active provider */}
        {activeProvider === "telegram" ? (
          <div className="rounded-lg bg-sky-50 border border-sky-200 p-3.5 text-xs text-sky-900 flex items-start gap-3">
            <Send className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="font-semibold text-sky-950">
                  Telegram Bot Storage Active
                </p>
                {telegramStatus?.configured ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-medium">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Bot @{telegramStatus.botUsername || "Ready"} Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium">
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                    Requires TELEGRAM_BOT_TOKEN &amp; TELEGRAM_CHAT_ID in .env
                  </span>
                )}
              </div>
              <p className="text-sky-800 mt-1 leading-relaxed">
                Files are fully client-side encrypted before being forwarded via your private Telegram Bot into your chosen channel/chat. Unlimited free cloud storage with no recurring costs.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3.5 text-xs text-blue-900 flex items-start gap-3">
            <Cloud className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-950">Lark Drive Active</p>
              <p className="text-blue-800 mt-0.5">
                Files are client-side encrypted and sent securely to your configured Lark Cloud Drive storage using Lark Open API.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Folder categories */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {["Projects", "Areas", "Resources", "Archive"].map((folder) => (
          <div key={folder} className="group flex cursor-pointer items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-400 hover:shadow transition-all">
            <div className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
              <Cloud className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{folder}</h3>
              <p className="text-xs text-slate-400">Encrypted Directory</p>
            </div>
          </div>
        ))}
      </div>

      {/* Documents List */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            Vault Documents ({documents.length})
          </h2>
          <span className="text-xs text-slate-400">
            Stored across Telegram &amp; Lark
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 opacity-40 text-slate-600" />
            </div>
            <p className="font-medium text-slate-600">Your Cloud Vault is empty</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
              Upload any file to automatically encrypt it with AES-256-GCM and store it safely on Telegram Bot or Lark.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((docItem) => {
              const isTelegram = docItem.meta.storageProvider === "telegram" || (docItem.meta.storagePath && docItem.meta.storagePath.includes(":"));
              return (
                <li key={docItem.meta.id} className="py-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50/80 rounded-lg px-3 -mx-3 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isTelegram ? "bg-sky-50 text-sky-600" : "bg-blue-50 text-blue-600"
                    }`}>
                      {isTelegram ? <Send className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {docItem.decryptedTitle}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          isTelegram 
                            ? "bg-sky-50 text-sky-700 border border-sky-200" 
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}>
                          {isTelegram ? "Telegram Bot Storage" : "Lark Drive"}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {docItem.meta.mimeType}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={() => handleDownloadAndDecrypt(docItem)}
                      disabled={downloadingId === docItem.meta.id || deletingId === docItem.meta.id}
                      className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg border border-sky-200/60 disabled:opacity-50 transition-colors"
                    >
                      {downloadingId === docItem.meta.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Decrypting...
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" /> Download
                        </>
                      )}
                    </button>
                    <button 
                      onClick={() => handleDelete(docItem)}
                      disabled={downloadingId === docItem.meta.id || deletingId === docItem.meta.id}
                      className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200/60 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === docItem.meta.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
