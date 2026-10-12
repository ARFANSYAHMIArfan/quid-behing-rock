import { apiFetch } from "../lib/api";
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
  Server,
} from "lucide-react";
import {
  collection,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
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
  state?: string;
}

export default function CloudDrive() {
  const { masterKey } = useCrypto();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeProvider, setActiveProvider] = useState<"telegram" | "lark">(
    "telegram",
  );
  const [telegramStatus, setTelegramStatus] = useState<{
    configured: boolean;
    botUsername?: string;
    botName?: string;
    error?: string;
  } | null>(null);

  const [folder, setFolder] = useState("root");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    meta: DocumentMeta;
    decryptedTitle: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<
    { meta: DocumentMeta; decryptedTitle: string }[]
  >([]);

  // Check Telegram Bot configuration status
  useEffect(() => {
    async function checkTelegram() {
      try {
        const res = await apiFetch("/api/telegram/status");
        if (res.ok) {
          const data = await res.json();
          setTelegramStatus(data);
        }
      } catch (e) {
        setTelegramStatus({
          configured: false,
          error: "Unable to check storage connection.",
        });
      }
    }
    checkTelegram();
  }, []);

  // Listen to user's documents metadata from Firestore
  useEffect(() => {
    if (!user || !masterKey) return;

    const q = query(
      collection(db, "documents"),
      where("ownerId", "==", user.uid),
    );
    let active = true;
    let version = 0;
    setLoading(true);
    setError("");
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const current = ++version;
        const docs: { meta: DocumentMeta; decryptedTitle: string }[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as DocumentMeta;
          try {
            const decryptedBytes = await CryptoEngine.decryptPayload(
              data.encryptedTitle,
              masterKey,
            );
            const decryptedTitle = new TextDecoder().decode(decryptedBytes);
            docs.push({ meta: { ...data, id: docSnap.id }, decryptedTitle });
          } catch (e) {
            console.error("Failed to decrypt title for doc", docSnap.id);
            docs.push({
              meta: { ...data, id: docSnap.id },
              decryptedTitle: "Encrypted Document",
            });
          }
        }
        if (active && current === version) {
          setDocuments(docs);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setError(
            "Unable to load files. Check Firestore permissions and your connection.",
          );
          setLoading(false);
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user, masterKey]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !masterKey) return;

    // Keep the encoded request below Vercel Functions body limits.
    if (file.size > 2 * 1024 * 1024) {
      setError("Choose a file up to 2 MiB for this Vercel upload route.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError("");
    setActionMessage("");
    setIsUploading(true);
    try {
      // 1. Read file as ArrayBuffer & Encrypt client-side
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 2. Encrypt the file payload using AES-256-GCM
      const encryptedFile = await CryptoEngine.encryptPayload(bytes, masterKey);

      // 3. Encrypt the filename
      const titleBytes = new TextEncoder().encode(file.name);
      const encryptedTitle = await CryptoEngine.encryptPayload(
        titleBytes,
        masterKey,
      );

      // 4. Generate Document ID
      const docId = crypto.randomUUID();

      // Convert JSON encrypted payload into base64 for upload proxy
      const payloadString = JSON.stringify(encryptedFile);
      const base64Data = btoa(
        encodeURIComponent(payloadString).replace(
          /%([0-9A-F]{2})/g,
          (match, p1) => String.fromCharCode(("0x" + p1) as any),
        ),
      );

      const uploadRes = await apiFetch(`/api/${activeProvider}/drive/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId,
          folderId: folder,
          encryptedTitle,
          mimeType: file.type || "application/octet-stream",
          base64Data,
        }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok)
        throw new Error(uploadData.message || "Upload failed.");
      setActionMessage("File encrypted and uploaded.");
    } catch (error: any) {
      console.error("File upload failed:", error);
      setError(error.message || "Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadAndDecrypt = async (docItem: {
    meta: DocumentMeta;
    decryptedTitle: string;
  }) => {
    if (!masterKey) return;
    setDownloadingId(docItem.meta.id);

    try {
      const res = await apiFetch(
        `/api/drive/${encodeURIComponent(docItem.meta.id)}/download`,
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(
          `Failed to fetch file from storage: ${errText || res.statusText}`,
        );
      }

      const blob = await res.blob();
      const text = await blob.text();
      const encryptedFile = JSON.parse(text);

      // Decrypt the payload
      const decryptedBytes = await CryptoEngine.decryptPayload(
        encryptedFile,
        masterKey,
      );

      // Create a Blob from the decrypted bytes
      const outBlob = new Blob([decryptedBytes], {
        type: docItem.meta.mimeType,
      });
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
      setError(error.message || "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (docItem: {
    meta: DocumentMeta;
    decryptedTitle: string;
  }) => {
    setDeletingId(docItem.meta.id);
    setError("");
    try {
      const response = await apiFetch(
        `/api/drive/${encodeURIComponent(docItem.meta.id)}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "Storage deletion failed; your record was kept.",
        );
      setDeleteTarget(null);
      setActionMessage("File deleted from storage and your vault.");
    } catch (error: any) {
      console.error("Failed to delete:", error);
      setError(error.message || "Unable to delete file.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col p-8 bg-slate-50 overflow-y-auto">
      {(error || actionMessage) && (
        <p
          role={error ? "alert" : "status"}
          className={
            error
              ? "error-banner mb-4"
              : "mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"
          }
        >
          {error || actionMessage}
        </p>
      )}
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <HardDrive className="h-6 w-6 text-sky-600" />
            Cloud Drive Vault
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Keep your files organised and encrypted. Upload limit: 2 MiB.
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
            disabled={
              isUploading ||
              (activeProvider === "telegram" &&
                telegramStatus?.configured === false)
            }
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
                <span
                  className="flex h-2 w-2 rounded-full bg-emerald-300"
                  title="Bot Connected"
                />
              ) : (
                <span
                  className="flex h-2 w-2 rounded-full bg-amber-300"
                  title="Config Required"
                />
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
                    Storage connection unavailable
                  </span>
                )}
              </div>
              <p className="text-sky-800 mt-1 leading-relaxed">
                Files are fully client-side encrypted before being forwarded via
                your private Telegram Bot into your chosen channel/chat. Storage
                availability depends on your provider.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3.5 text-xs text-blue-900 flex items-start gap-3">
            <Cloud className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-950">Lark Drive Active</p>
              <p className="text-blue-800 mt-0.5">
                Files are client-side encrypted and sent securely to your
                configured Lark Cloud Drive storage using Lark Open API.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Folder categories */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {["Projects", "Areas", "Resources", "Archive"].map((folder) => (
          <button
            onClick={() => setFolder(folder)}
            key={folder}
            className="group flex cursor-pointer items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-400 hover:shadow transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
              <Cloud className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{folder}</h3>
              <p className="text-xs text-slate-400">Encrypted Directory</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button className="secondary-button" onClick={() => setFolder("root")}>
          All files
        </button>
        <span className="text-sm font-semibold">
          {folder === "root" ? "All folders" : folder}
        </span>
        <input
          aria-label="Search files"
          placeholder="Search files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field flex-1"
        />
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

        {loading ? (
          <p className="empty-state">Loading files…</p>
        ) : documents.filter(
            (d) =>
              (folder === "root" || d.meta.folderId === folder) &&
              d.decryptedTitle.toLowerCase().includes(search.toLowerCase()),
          ).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 opacity-40 text-slate-600" />
            </div>
            <p className="font-medium text-slate-600">No files in this view</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
              Upload any file to automatically encrypt it with AES-256-GCM and
              store it safely on Telegram Bot or Lark.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents
              .filter(
                (d) =>
                  (folder === "root" || d.meta.folderId === folder) &&
                  d.decryptedTitle.toLowerCase().includes(search.toLowerCase()),
              )
              .map((docItem) => {
                const isTelegram =
                  docItem.meta.storageProvider === "telegram" ||
                  (docItem.meta.storagePath &&
                    docItem.meta.storagePath.includes(":"));
                return (
                  <li
                    key={docItem.meta.id}
                    className="py-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50/80 rounded-lg px-3 -mx-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isTelegram
                            ? "bg-sky-50 text-sky-600"
                            : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        {isTelegram ? (
                          <Send className="h-4 w-4" />
                        ) : (
                          <Cloud className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        {docItem.meta.state &&
                          docItem.meta.state !== "ready" && (
                            <p className="text-xs text-amber-700">
                              Upload incomplete — recovery record kept
                            </p>
                          )}
                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                          {docItem.decryptedTitle}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isTelegram
                                ? "bg-sky-50 text-sky-700 border border-sky-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {isTelegram ? "Telegram Bot Storage" : "Lark Drive"}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {docItem.meta.mimeType}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setEditing({
                            id: docItem.meta.id,
                            title: docItem.decryptedTitle,
                          })
                        }
                      >
                        Rename
                      </button>
                      <select
                        aria-label={`Move ${docItem.decryptedTitle}`}
                        className="field w-auto"
                        value={docItem.meta.folderId || "root"}
                        onChange={async (e) => {
                          try {
                            await updateDoc(
                              doc(db, "documents", docItem.meta.id),
                              {
                                folderId: e.target.value,
                                updatedAt: serverTimestamp(),
                              },
                            );
                          } catch {
                            setError("Unable to move file.");
                          }
                        }}
                      >
                        {[
                          "root",
                          "Projects",
                          "Areas",
                          "Resources",
                          "Archive",
                        ].map((f) => (
                          <option key={f} value={f}>
                            {f === "root" ? "Unfiled" : f}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleDownloadAndDecrypt(docItem)}
                        disabled={
                          downloadingId === docItem.meta.id ||
                          deletingId === docItem.meta.id
                        }
                        className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg border border-sky-200/60 disabled:opacity-50 transition-colors"
                      >
                        {downloadingId === docItem.meta.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                            Decrypting...
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" /> Download
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setError("");
                          setDeleteTarget(docItem);
                        }}
                        disabled={
                          downloadingId === docItem.meta.id ||
                          deletingId === docItem.meta.id
                        }
                        aria-label={`Delete ${docItem.decryptedTitle}`}
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
      {editing && (
        <div className="modal-backdrop">
          <form
            className="modal max-w-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Rename file"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!masterKey) return;
              try {
                const encryptedTitle = await CryptoEngine.encryptPayload(
                  CryptoEngine.encodeText(editing.title.trim()),
                  masterKey,
                );
                await updateDoc(doc(db, "documents", editing.id), {
                  encryptedTitle,
                  updatedAt: serverTimestamp(),
                });
                setEditing(null);
              } catch {
                setError("Unable to rename file.");
              }
            }}
          >
            <label className="form-label">
              Filename
              <input
                autoFocus
                required
                maxLength={200}
                className="field"
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="primary-button">Save</button>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div
            className="modal max-w-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Delete file"
          >
            <h2 className="font-bold">Delete {deleteTarget.decryptedTitle}?</h2>
            <p className="my-4 text-sm text-slate-500">
              This permanently deletes the stored file. If storage refuses
              deletion, your record will be kept.
            </p>
            {error && <p className="error-banner">{error}</p>}
            <div className="flex gap-3">
              <button
                disabled={!!deletingId}
                className="secondary-button"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                disabled={!!deletingId}
                className="primary-button"
                onClick={() => handleDelete(deleteTarget)}
              >
                {deletingId ? "Deleting…" : "Delete file"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
