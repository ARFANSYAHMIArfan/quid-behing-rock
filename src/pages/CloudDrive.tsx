import { useState, useRef, useEffect } from "react";
import { Cloud, FileText, Upload, Loader2, HardDrive, Download, Trash2 } from "lucide-react";
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
  storagePath: string; // Will hold the Lark file_token now
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
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<{ meta: DocumentMeta; decryptedTitle: string }[]>([]);

  useEffect(() => {
    if (!user || !masterKey) return;
    
    // Listen to user's documents metadata from Firestore
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !masterKey) return;

    setIsUploading(true);
    try {
      // 1. Read file as ArrayBuffer
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 2. Encrypt the file payload
      const encryptedFile = await CryptoEngine.encryptPayload(bytes, masterKey);

      // 3. Encrypt the filename
      const titleBytes = new TextEncoder().encode(file.name);
      const encryptedTitle = await CryptoEngine.encryptPayload(titleBytes, masterKey);

      // 4. Generate Document ID
      const docId = crypto.randomUUID();

      // 5. Upload encrypted payload to Lark Drive via our Server Proxy
      // Convert JSON encrypted payload into base64 for the API
      const payloadString = JSON.stringify(encryptedFile);
      // Ensure unicode safe base64 encoding if needed, though JSON stringify is mostly ascii
      const base64Data = btoa(encodeURIComponent(payloadString).replace(/%([0-9A-F]{2})/g,
          (match, p1) => String.fromCharCode('0x' + p1 as any)));

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

      // 6. Save metadata to Firestore
      const docRef = doc(db, "documents", docId);
      await setDoc(docRef, {
        ownerId: user.uid,
        sharedWith: [],
        folderId: "root",
        mimeType: file.type || "application/octet-stream",
        storagePath: fileToken, // Lark Drive Token acts as the storage path
        encryptedTitle: encryptedTitle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

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
      // 1. Fetch the encrypted payload from Lark Drive via our proxy
      const res = await fetch(`/api/lark/drive/download/${docItem.meta.storagePath}`);
      if (!res.ok) {
        throw new Error("Failed to fetch file from Lark Drive");
      }

      // The proxy streams back the raw bytes that were uploaded.
      // Since the proxy decodes the base64 before uploading to Lark, 
      // the file stored in Lark is just the raw JSON string.
      const blob = await res.blob();
      const text = await blob.text(); // This is the JSON string

      const encryptedFile = JSON.parse(text);

      // 3. Decrypt the payload
      const decryptedBytes = await CryptoEngine.decryptPayload(encryptedFile, masterKey);

      // 4. Create a Blob from the decrypted bytes
      const outBlob = new Blob([decryptedBytes], { type: docItem.meta.mimeType });
      const url = URL.createObjectURL(outBlob);

      // 5. Trigger download or open in browser
      const a = document.createElement("a");
      a.href = url;
      a.download = docItem.decryptedTitle;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Cleanup URL object
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
      // 1. Attempt to delete from Lark Drive via proxy (wrapped in try-catch so it doesn't block database deletion)
      try {
        const safeToken = encodeURIComponent(docItem.meta.storagePath);
        const res = await fetch(`/api/lark/drive/files/${safeToken}`, {
          method: "DELETE"
        });
        if (!res.ok) {
          console.warn("Lark Drive delete warning:", await res.text());
        }
      } catch (larkError) {
        console.warn("Lark API delete bypassed for legacy document.", larkError);
      }

      // 2. Force delete metadata from Firestore
      await deleteDoc(doc(db, "documents", docItem.meta.id));
      
    } catch (error: any) {
      console.error("Failed to delete:", error);
      alert(`Gagal memadam fail dari pangkalan data: ${error.message}\n\nSila pastikan "Firestore Rules" anda telah ditetapkan dengan betul.`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col p-8 bg-slate-50">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <HardDrive className="h-6 w-6 text-blue-600" />
          Cloud Drive (Lark API)
        </h1>
        <div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-70 transition-all"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isUploading ? "Encrypting & Uploading..." : "Upload to Lark"}
          </button>
        </div>
      </div>
      
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-8 rounded-r-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <HardDrive className="h-5 w-5 text-blue-600" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-800">
              <strong>Lark Drive Active:</strong> Your files are end-to-end encrypted locally before being uploaded directly to your Lark Drive storage. No Google Cloud Storage billing is required, and your files are perfectly safe in the cloud.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {["Projects", "Areas", "Resources", "Archive"].map((folder) => (
          <div key={folder} className="group relative flex cursor-pointer flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-500 hover:shadow-md transition-all">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Cloud className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{folder}</h3>
              <p className="text-sm text-slate-500 mt-1">Lark Folder</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">My Documents</h2>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p>Your Lark vault is empty.</p>
            <p className="text-sm mt-1">Upload a file to securely encrypt and save it to Lark.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((docItem) => (
              <li key={docItem.meta.id} className="py-4 flex items-center justify-between hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{docItem.decryptedTitle}</h3>
                    <p className="text-xs text-slate-500">AES-256-GCM Encrypted (Lark Drive) • {docItem.meta.mimeType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleDownloadAndDecrypt(docItem)}
                    disabled={downloadingId === docItem.meta.id || deletingId === docItem.meta.id}
                    className="flex items-center gap-2 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 disabled:opacity-50 transition-colors"
                  >
                    {downloadingId === docItem.meta.id ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Decrypting...
                      </>
                    ) : (
                      <>
                        <Download className="h-3 w-3" /> Download / View
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => handleDelete(docItem)}
                    disabled={downloadingId === docItem.meta.id || deletingId === docItem.meta.id}
                    className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === docItem.meta.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
