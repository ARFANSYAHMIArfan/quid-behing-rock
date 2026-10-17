import { useState, useEffect, useRef, ChangeEvent } from "react";
import { 
  HardDrive, 
  Upload, 
  Download, 
  Trash2, 
  Loader2, 
  FileText, 
  ShieldCheck, 
  Server, 
  CheckCircle2, 
  ExternalLink,
  CloudRain,
  AlertCircle,
  X
} from "lucide-react";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";
import { CryptoEngine } from "../services/CryptoEngine";

export interface DocumentMeta {
  id: string;
  ownerId: string;
  sharedWith: string[];
  folderId: string;
  mimeType: string;
  storageProvider?: "r2" | "telegram" | "lark";
  storagePath: string; // R2 Object Key, e.g. `${docId}.enc`
  r2Bucket?: string;
  r2Url?: string;
  fileSize?: number;
  encryptedTitle: {
    ciphertext: string;
    iv: string;
    tag: string;
  };
  createdAt: any;
  updatedAt: any;
}

export default function CloudDrive() {
  const { user } = useAuth();
  const { masterKey } = useCrypto();

  const [documents, setDocuments] = useState<{ meta: DocumentMeta; decryptedTitle: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "error" | "info" | "success";
    title?: string;
    message: string;
    docIdToDelete?: string;
  } | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{ meta: DocumentMeta; decryptedTitle: string } | null>(null);
  
  const [r2Status, setR2Status] = useState<{
    configured: boolean;
    bucket?: string;
    accountId?: string;
    publicDevUrl?: string;
    customDomain?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check R2 backend status
  useEffect(() => {
    async function checkR2() {
      try {
        const res = await fetch("/api/r2/status");
        if (res.ok) {
          const data = await res.json();
          setR2Status(data);
        }
      } catch (err) {
        console.warn("Failed to check R2 status:", err);
      }
    }
    checkR2();
  }, []);

  // Listen to Firestore documents for the current user
  useEffect(() => {
    if (!user || !masterKey) return;

    const q = query(
      collection(db, "documents"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const docPromises = snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data() as Omit<DocumentMeta, "id">;
        const meta: DocumentMeta = {
          ...data,
          id: docSnap.id,
        };

        // Decrypt title client-side
        let decryptedTitle = "Encrypted File";
        try {
          if (meta.encryptedTitle) {
            const titleBytes = await CryptoEngine.decryptPayload(meta.encryptedTitle, masterKey);
            decryptedTitle = new TextDecoder().decode(titleBytes);
          }
        } catch (e) {
          console.warn("Could not decrypt title for doc:", meta.id);
        }

        return { meta, decryptedTitle };
      });

      const resolved = await Promise.all(docPromises);
      setDocuments(resolved);
    });

    return () => unsubscribe();
  }, [user, masterKey]);

  // Handle Client-Side Encrypted Upload directly to Cloudflare R2
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !masterKey) return;

    setIsUploading(true);
    setUploadStatus("Mengenripsi fail secara tempatan (AES-256-GCM)...");
    try {
      // 1. Read file as ArrayBuffer & Encrypt client-side
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 2. Encrypt the file payload using AES-256-GCM
      const encryptedFile = await CryptoEngine.encryptPayload(bytes, masterKey);

      // 3. Encrypt the filename
      const titleBytes = new TextEncoder().encode(file.name);
      const encryptedTitle = await CryptoEngine.encryptPayload(titleBytes, masterKey);

      // 4. Generate Document ID & R2 Object Key
      const docId = crypto.randomUUID();
      const objectKey = `${docId}.enc`;

      const payloadString = JSON.stringify(encryptedFile);
      const base64Data = btoa(encodeURIComponent(payloadString).replace(/%([0-9A-F]{2})/g,
          (match, p1) => String.fromCharCode('0x' + p1 as any)));

      setUploadStatus("Memuat naik fail disulitkan ke Cloudflare R2...");

      const uploadRes = await fetch("/api/r2/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: objectKey,
          base64Data: base64Data,
          contentType: "application/octet-stream"
        })
      });

      if (!uploadRes.ok) {
        let errMsg = `Ralat pelayan (HTTP ${uploadRes.status})`;
        try {
          const contentType = uploadRes.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const errData = await uploadRes.json();
            errMsg = errData.message || errData.error || errMsg;
          } else {
            const rawText = await uploadRes.text();
            if (uploadRes.status === 404) {
              errMsg = "Laluan '/api/r2/upload' tidak ditemui (404). Sila pastikan Vercel Serverless Function (api/index.ts) telah dideploy.";
            } else if (uploadRes.status === 413) {
              errMsg = "Saiz fail terlalu besar untuk had pelayan (HTTP 413: Payload Too Large).";
            } else if (rawText) {
              errMsg = rawText.slice(0, 160);
            }
          }
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      const uploadData = await uploadRes.json();

      setUploadStatus("Menyimpan metadata ke pangkalan data selamat...");

      const publicUrl = uploadData.publicUrl || `https://pub-bceec50286f2449da6fb6c9737572025.r2.dev/${objectKey}`;

      // Save document record in Firestore
      const docRef = doc(db, "documents", docId);
      await setDoc(docRef, {
        ownerId: user.uid,
        sharedWith: [],
        folderId: "root",
        mimeType: file.type || "application/octet-stream",
        storageProvider: "r2",
        storagePath: objectKey,
        r2Bucket: r2Status?.bucket || "rfnsyhmi-workspace",
        r2Url: publicUrl,
        fileSize: file.size,
        encryptedTitle: encryptedTitle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

    } catch (error: any) {
      console.error("File upload failed:", error);
      alert(`Gagal menyulitkan atau menyimpan fail: ${error.message || error}`);
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Download & Decrypt from Cloudflare R2
  const handleDownloadAndDecrypt = async (docItem: { meta: DocumentMeta; decryptedTitle: string }) => {
    if (!masterKey) return;
    setDownloadingId(docItem.meta.id);
    setDownloadStatus("Mengambil data dari Cloudflare R2...");
    setNotification(null);
    
    try {
      const objectKey = docItem.meta.storagePath || `${docItem.meta.id}.enc`;
      const downloadUrl = `/api/r2/download/${encodeURIComponent(objectKey)}`;

      const res = await fetch(downloadUrl);
      if (!res.ok) {
        let errMsg = `Ralat pelayan (HTTP ${res.status})`;
        try {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const errJson = await res.json();
            if (errJson.error === "NoSuchKey" || res.status === 404) {
              setNotification({
                type: "error",
                title: "Objek Tidak Dijumpai dalam Storan R2 (NoSuchKey)",
                message: `Fail "${docItem.decryptedTitle}" (${objectKey}) tidak wujud dalam bucket Cloudflare R2 anda. Fail ini mungkin rekod metadata yang dicipta sebelum konfigurasi bucket ini dimuat naik secara penuh.`,
                docIdToDelete: docItem.meta.id
              });
              return;
            }
            errMsg = errJson.message || errMsg;
          } else {
            const errText = await res.text().catch(() => "");
            if (errText) errMsg = errText.slice(0, 160);
          }
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      setDownloadStatus("Mendekripsi fail dengan AES-256-GCM...");
      const blob = await res.blob();
      const text = await blob.text();
      let encryptedFile: any;
      try {
        encryptedFile = JSON.parse(text);
      } catch (jsonErr) {
        throw new Error("Kandungan fail yang dimuat turun bukan format enkripsi yang sah.");
      }

      // Decrypt the payload in memory
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
      setNotification({
        type: "success",
        message: `Fail "${docItem.decryptedTitle}" berjaya dimuat turun dan didekripsi!`
      });
    } catch (error: any) {
      console.warn("Failed to download/decrypt:", error.message || error);
      setNotification({
        type: "error",
        title: "Ralat Muat Turun",
        message: `Gagal memuat turun atau mendekripsi fail: ${error.message || error}`
      });
    } finally {
      setDownloadingId(null);
      setDownloadStatus(null);
    }
  };

  // Delete file from Cloudflare R2 and Firestore
  const executeDelete = async (docItem: { meta: DocumentMeta; decryptedTitle: string }) => {
    setConfirmDeleteDoc(null);
    setDeletingId(docItem.meta.id);
    try {
      const objectKey = docItem.meta.storagePath || `${docItem.meta.id}.enc`;
      
      // Delete object from Cloudflare R2
      try {
        await fetch(`/api/r2/files/${encodeURIComponent(objectKey)}`, {
          method: "DELETE"
        });
      } catch (r2Err) {
        console.warn("R2 delete warning:", r2Err);
      }

      // Delete metadata from Firestore
      await deleteDoc(doc(db, "documents", docItem.meta.id));
      
      setNotification({
        type: "success",
        message: `Rekod "${docItem.decryptedTitle}" berjaya dipadam dari bilik kebal.`
      });
    } catch (error: any) {
      console.warn("Failed to delete:", error);
      setNotification({
        type: "error",
        title: "Ralat Pemadaman",
        message: `Gagal memadam rekod fail: ${error.message || error}`
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDelete = (docItem: { meta: DocumentMeta; decryptedTitle: string }) => {
    setConfirmDeleteDoc(docItem);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
            Zero-Knowledge Client-Side AES-256-GCM Encrypted Cloud Storage
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
            disabled={isUploading}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadStatus || "Mengenripsi & Memuat Naik..."}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Muat Naik ke Cloudflare R2
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notification / Error / Warning Banner */}
      {notification && (
        <div className={`mb-6 rounded-xl border p-4 shadow-sm flex items-start justify-between gap-3 animate-in fade-in ${
          notification.type === "error" 
            ? "bg-rose-50 border-rose-200 text-rose-900" 
            : notification.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
            : "bg-sky-50 border-sky-200 text-sky-900"
        }`}>
          <div className="flex items-start gap-3">
            <AlertCircle className={`h-5 w-5 shrink-0 mt-0.5 ${
              notification.type === "error" ? "text-rose-600" : notification.type === "success" ? "text-emerald-600" : "text-sky-600"
            }`} />
            <div>
              {notification.title && (
                <h4 className="text-sm font-bold mb-1">{notification.title}</h4>
              )}
              <p className="text-xs leading-relaxed opacity-90">{notification.message}</p>
              {notification.docIdToDelete && (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const docId = notification.docIdToDelete!;
                      try {
                        await deleteDoc(doc(db, "documents", docId));
                        setNotification({
                          type: "info",
                          message: "Rekod metadata fail telah dipadam daripada senarai."
                        });
                      } catch (err: any) {
                        setNotification({
                          type: "error",
                          message: `Gagal memadam metadata: ${err.message}`
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-xs transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Padam Rekod Lapuk Ini dari Senarai
                  </button>
                </div>
              )}
            </div>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Cloudflare R2 Storage Engine Status Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  Cloudflare R2 Object Storage
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold text-[11px] border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Bucket: {r2Status?.bucket || "rfnsyhmi-workspace"} (Connected)
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 font-medium text-[11px] border border-sky-200">
                  <ShieldCheck className="h-3 w-3 mr-1" /> E2EE AES-256-GCM
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Storan berprestasi tinggi serasi S3 dengan sifar yuran pemindahan (zero egress fees). Semua fail disulitkan secara penuh di sisi klien sebelum disimpan ke bucket R2 anda.
              </p>
              <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
                <span><strong>Account ID:</strong> <code className="font-mono text-slate-700">582f56f4b43ffae6cd39f32868762050</code></span>
                <span><strong>Domain:</strong> <a href="https://rfnsyhmi.dpdns.org" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline inline-flex items-center gap-0.5">rfnsyhmi.dpdns.org <ExternalLink className="h-2.5 w-2.5" /></a></span>
                <span><strong>Public Dev:</strong> <code className="font-mono text-slate-700">pub-bceec50286f2449da6fb6c9737572025.r2.dev</code></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Folder Categories */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {["Projects", "Areas", "Resources", "Archive"].map((folder) => (
          <div key={folder} className="group flex cursor-pointer items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-400 hover:shadow transition-all">
            <div className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
              <HardDrive className="h-5 w-5 text-sky-600" />
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
            Dokumen Bilik Kebal ({documents.length})
          </h2>
          <span className="text-xs text-slate-400">
            Disimpan pada Cloudflare R2
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 opacity-40 text-slate-600" />
            </div>
            <p className="font-medium text-slate-600">Bilik kebal Cloud Drive anda kosong</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
              Muat naik sebarang fail untuk menyulitkannya secara automatik menggunakan AES-256-GCM dan menyimpannya secara selamat pada Cloudflare R2.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((docItem) => {
              return (
                <li key={docItem.meta.id} className="py-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50/80 rounded-lg px-3 -mx-3 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-orange-50 text-orange-600">
                      <Server className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">
                        {docItem.decryptedTitle}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                          Cloudflare R2
                        </span>
                        {docItem.meta.fileSize && (
                          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {formatFileSize(docItem.meta.fileSize)}
                          </span>
                        )}
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
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {downloadStatus || "Mendekripsi..."}
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" /> Muat Turun
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

      {/* Delete Confirmation Modal */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Padam Dokumen?</h3>
                <p className="text-xs text-slate-500">Tindakan ini tidak boleh diundur</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 my-4 leading-relaxed">
              Adakah anda pasti mahu memadam fail <strong className="font-semibold text-slate-900 font-mono">"{confirmDeleteDoc.decryptedTitle}"</strong> dari Cloudflare R2 dan pangkalan data anda?
            </p>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => executeDelete(confirmDeleteDoc)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-xs transition-colors"
              >
                Padam Fail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
