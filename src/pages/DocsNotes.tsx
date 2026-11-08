import { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  Search, 
  PenTool, 
  CheckCircle2, 
  AlertCircle,
  Upload,
  Share2,
  Users,
  Copy,
  Check
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import mammoth from "mammoth";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import AnnotationCanvas from "../components/canvas/AnnotationCanvas";
import FloatingToolbar from "../components/canvas/FloatingToolbar";
import NotesPanel from "../components/canvas/NotesPanel";
import { Annotation, AnnotationType, Note } from "../types/canvas";

export interface DocNoteItem {
  id: string;
  ownerId: string;
  sharedWith?: string[]; // array of collaborator emails or uids
  title: string;
  content: string;
  updatedAt: any;
  createdAt: any;
}

export default function DocsNotes() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocNoteItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Editor State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showCanvasMode, setShowCanvasMode] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [newCollaborator, setNewCollaborator] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas / Annotation states
  const [activeTool, setActiveTool] = useState<AnnotationType | "select">("select");
  const [activeColor, setActiveColor] = useState<string>("#ef4444");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  // Fetch documents owned by user OR shared with user
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // Check if URL has ?doc=ID query param for direct shared opening
    const params = new URLSearchParams(window.location.search);
    const sharedDocParam = params.get("doc");

    if (sharedDocParam && !selectedDocId) {
      getDoc(doc(db, "notes_documents", sharedDocParam)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as Omit<DocNoteItem, "id">;
          const docItem: DocNoteItem = { id: snap.id, ...data };
          // If not already in documents list, we can prepend or select it
          setSelectedDocId(docItem.id);
          setTitle(docItem.title);
          setContent(docItem.content || "");
          setSharedWith(docItem.sharedWith || []);
        }
      }).catch(err => console.warn("Could not load shared doc:", err));
    }

    // Query 1: Owned by user
    const qOwned = query(
      collection(db, "notes_documents"),
      where("ownerId", "==", user.uid)
    );

    // Query 2: Shared with user (by email)
    const qShared = user.email ? query(
      collection(db, "notes_documents"),
      where("sharedWith", "array-contains", user.email)
    ) : null;

    const unsubOwned = onSnapshot(qOwned, (snapshot) => {
      const ownedItems: DocNoteItem[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DocNoteItem, "id">)
      }));

      setDocuments(prev => {
        const map = new Map();
        [...ownedItems, ...prev].forEach(item => map.set(item.id, item));
        const merged = Array.from(map.values());
        merged.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds * 1000 || 0;
          const timeB = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds * 1000 || 0;
          return timeB - timeA;
        });
        return merged;
      });
      setLoading(false);

      if (ownedItems.length > 0 && !selectedDocId && !sharedDocParam) {
        setSelectedDocId(ownedItems[0].id);
        setTitle(ownedItems[0].title);
        setContent(ownedItems[0].content || "");
        setSharedWith(ownedItems[0].sharedWith || []);
      }
    });

    let unsubShared = () => {};
    if (qShared) {
      unsubShared = onSnapshot(qShared, (snapshot) => {
        const sharedItems: DocNoteItem[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DocNoteItem, "id">)
        }));

        setDocuments(prev => {
          const map = new Map();
          [...sharedItems, ...prev].forEach(item => map.set(item.id, item));
          const merged = Array.from(map.values());
          merged.sort((a, b) => {
            const timeA = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds * 1000 || 0;
            const timeB = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds * 1000 || 0;
            return timeB - timeA;
          });
          return merged;
        });
      });
    }

    return () => {
      unsubOwned();
      unsubShared();
    };
  }, [user]);

  const handleSelectDoc = (docItem: DocNoteItem) => {
    setSelectedDocId(docItem.id);
    setTitle(docItem.title);
    setContent(docItem.content || "");
    setSharedWith(docItem.sharedWith || []);
    setShowCanvasMode(false);
  };

  const handleCreateNewDoc = async () => {
    if (!user) return;
    try {
      const newDocRef = await addDoc(collection(db, "notes_documents"), {
        ownerId: user.uid,
        sharedWith: [],
        title: "Dokumen Tanpa Tajuk",
        content: "# Catatan Baru\n\nMula menulis di sini...",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSelectedDocId(newDocRef.id);
      setTitle("Dokumen Tanpa Tajuk");
      setContent("# Catatan Baru\n\nMula menulis di sini...");
      setSharedWith([]);
      setNotification({ type: "success", text: "Dokumen baru dicipta!" });
      setTimeout(() => setNotification(null), 2500);
    } catch (err: any) {
      alert("Gagal mencipta dokumen: " + err.message);
    }
  };

  // --- IMPORT .DOCX FILE ---
  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setNotification({ type: "info", text: "Membaca dan menghurai fail .docx..." });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const extractedText = result.value || "";

      const docTitle = file.name.replace(/\.[^/.]+$/, "");
      
      const newDocRef = await addDoc(collection(db, "notes_documents"), {
        ownerId: user.uid,
        sharedWith: [],
        title: docTitle || "Imported Word Doc",
        content: extractedText,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSelectedDocId(newDocRef.id);
      setTitle(docTitle);
      setContent(extractedText);
      setSharedWith([]);

      setNotification({ type: "success", text: `Berjaya mengimport "${file.name}" ke dalam dokumen baharu!` });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error("Docx import error:", err);
      setNotification({ type: "error", text: "Gagal menghurai fail .docx: " + (err.message || err) });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveDoc = async () => {
    if (!selectedDocId || !user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "notes_documents", selectedDocId), {
        title: title.trim() || "Dokumen Tanpa Tajuk",
        content,
        sharedWith,
        updatedAt: serverTimestamp()
      });
      setNotification({ type: "success", text: "Perubahan disimpan!" });
      setTimeout(() => setNotification(null), 2500);
    } catch (err: any) {
      setNotification({ type: "error", text: "Gagal menyimpan: " + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDoc = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("Padam dokumen ini? Tindakan tidak boleh dibatalkan.")) return;
    try {
      await deleteDoc(doc(db, "notes_documents", id));
      if (selectedDocId === id) {
        const remaining = documents.filter((d) => d.id !== id);
        if (remaining.length > 0) {
          handleSelectDoc(remaining[0]);
        } else {
          setSelectedDocId(null);
          setTitle("");
          setContent("");
          setSharedWith([]);
        }
      }
    } catch (err: any) {
      alert("Gagal memadam dokumen: " + err.message);
    }
  };

  // Collaborator management
  const handleAddCollaborator = async () => {
    if (!newCollaborator.trim() || !selectedDocId) return;
    const email = newCollaborator.trim().toLowerCase();
    if (sharedWith.includes(email)) return;

    const updated = [...sharedWith, email];
    setSharedWith(updated);
    setNewCollaborator("");

    try {
      await updateDoc(doc(db, "notes_documents", selectedDocId), {
        sharedWith: updated,
        updatedAt: serverTimestamp()
      });
      setNotification({ type: "success", text: `Akses diberikan kepada ${email} (Read & Edit)` });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      alert("Gagal mengemaskini akses: " + err.message);
    }
  };

  const handleRemoveCollaborator = async (emailToRemove: string) => {
    if (!selectedDocId) return;
    const updated = sharedWith.filter(e => e !== emailToRemove);
    setSharedWith(updated);

    try {
      await updateDoc(doc(db, "notes_documents", selectedDocId), {
        sharedWith: updated,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      alert("Gagal membuang akses: " + err.message);
    }
  };

  const copyShareLink = () => {
    if (!selectedDocId) return;
    const link = `https://rfnsyhmi.dpdns.org/docs?doc=${selectedDocId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Linked Notes / Annotation Handlers
  const handleAddNote = (text: string) => {
    if (!activeAnnotationId) return;
    const newNote: Note = {
      id: uuidv4(),
      annotationAnchorId: activeAnnotationId,
      text,
      createdAt: Date.now(),
    };
    setNotes([...notes, newNote]);
  };

  const handleNoteClick = (annotationId: string) => {
    setActiveAnnotationId(annotationId);
    setActiveTool("select");
  };

  const filteredDocs = documents.filter((d) =>
    d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden">
      {/* Hidden file input for .docx import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDocxUpload}
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
      />

      {/* Left Sidebar: Document List */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <FileText className="h-4 w-4" />
            </div>
            <h2 className="font-bold text-slate-900 text-sm">Docs & Notes</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              title="Import fail Word (.docx)"
            >
              <Upload className="h-4 w-4 text-emerald-600" />
            </button>
            <button
              onClick={handleCreateNewDoc}
              className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-500 transition-colors shadow-xs"
              title="Cipta Dokumen Baru"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nota..."
              className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <p className="p-4 text-xs text-slate-400 text-center">Memuatkan nota...</p>
          ) : filteredDocs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              <p>Tiada dokumen.</p>
              <button
                onClick={handleCreateNewDoc}
                className="mt-2 text-emerald-600 hover:underline font-semibold"
              >
                + Cipta dokumen pertama
              </button>
            </div>
          ) : (
            filteredDocs.map((docItem) => {
              const isSelected = docItem.id === selectedDocId;
              const isShared = docItem.ownerId !== user?.uid;
              return (
                <div
                  key={docItem.id}
                  onClick={() => handleSelectDoc(docItem)}
                  className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-all cursor-pointer ${
                    isSelected
                      ? "bg-emerald-50/80 text-emerald-950 font-semibold border border-emerald-200"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <FileText className={`h-4 w-4 shrink-0 ${isSelected ? "text-emerald-600" : "text-slate-400"}`} />
                    <div className="truncate">
                      <span className="truncate block">{docItem.title || "Tanpa Tajuk"}</span>
                      {isShared && <span className="text-[10px] text-purple-600 font-medium">Dikongsi dengan anda</span>}
                    </div>
                  </div>
                  {!isShared && (
                    <button
                      onClick={(e) => handleDeleteDoc(docItem.id, e)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-opacity"
                      title="Padam"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Document Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        {selectedDocId ? (
          <>
            {/* Top Workspace Header */}
            <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div className="flex-1 max-w-lg mr-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Tajuk Dokumen..."
                  className="w-full text-lg font-bold text-slate-900 bg-transparent border-0 focus:outline-hidden focus:ring-0 placeholder-slate-400"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* Share Button */}
                <button
                  onClick={() => setShowShareModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
                >
                  <Share2 className="h-3.5 w-3.5 text-purple-600" />
                  <span>Kongsi (Share)</span>
                  {sharedWith.length > 0 && (
                    <span className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.2 text-[10px] text-purple-700 font-bold">
                      {sharedWith.length}
                    </span>
                  )}
                </button>

                {/* Canvas Annotation Toggle */}
                <button
                  onClick={() => setShowCanvasMode(!showCanvasMode)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    showCanvasMode
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <PenTool className="h-3.5 w-3.5" />
                  {showCanvasMode ? "Tutup Kanvas" : "Kanvas Anotasi"}
                </button>

                <button
                  onClick={handleSaveDoc}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>

            {notification && (
              <div className={`mx-6 mt-3 flex items-center gap-2 rounded-lg p-2.5 text-xs ${
                notification.type === "success" 
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
                  : notification.type === "info"
                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}>
                {notification.type === "success" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                <span>{notification.text}</span>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 relative flex overflow-hidden">
              {showCanvasMode ? (
                <div className="relative flex-1 flex flex-col bg-slate-100 p-4">
                  <div className="relative flex-1 rounded-lg">
                    <AnnotationCanvas 
                      activeTool={activeTool}
                      activeColor={activeColor}
                      annotations={annotations}
                      setAnnotations={setAnnotations}
                      activeAnnotationId={activeAnnotationId}
                      setActiveAnnotationId={setActiveAnnotationId}
                    />
                    <FloatingToolbar 
                      activeTool={activeTool}
                      setActiveTool={setActiveTool}
                      activeColor={activeColor}
                      setActiveColor={setActiveColor}
                    />
                  </div>
                  <NotesPanel 
                    notes={notes}
                    annotations={annotations}
                    activeAnnotationId={activeAnnotationId}
                    onAddNote={handleAddNote}
                    onNoteClick={handleNoteClick}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full overflow-y-auto">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Tulis catatan, dokumen, atau perancangan anda di sini (atau import fail .docx)..."
                    className="w-full flex-1 resize-none border-0 text-slate-800 text-sm leading-relaxed focus:outline-hidden font-sans placeholder-slate-300"
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <FileText className="h-8 w-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Pilih atau Cipta Dokumen</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Semua dokumen disimpan ke pangkalan data peribadi anda di Firebase. Anda juga boleh mengimport fail Word (.docx).
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                <Upload className="h-4 w-4 text-emerald-600" />
                Import Fail .docx
              </button>
              <button
                onClick={handleCreateNewDoc}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" />
                Cipta Dokumen Baru
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Share & Collaboration Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-bold text-slate-900">Kongsi Dokumen</h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Copy Share Link */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Pautan Perkongsian Terus
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`https://rfnsyhmi.dpdns.org/docs?doc=${selectedDocId}`}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 font-mono select-all"
                  />
                  <button
                    onClick={copyShareLink}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-500 transition-colors shrink-0"
                  >
                    {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedLink ? "Disalin!" : "Salin"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Sesiapa yang mempunyai pautan ini dan diberi kebenaran emel boleh melihat & menyunting dokumen.
                </p>
              </div>

              {/* Add Collaborator */}
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Beri Akses Kepada Pengguna (Read & Edit)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={newCollaborator}
                    onChange={(e) => setNewCollaborator(e.target.value)}
                    placeholder="contoh@gmail.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddCollaborator}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 shrink-0"
                  >
                    Tambah
                  </button>
                </div>
              </div>

              {/* Collaborators List */}
              <div className="pt-2">
                <span className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Senarai Kolaborator ({sharedWith.length})
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {sharedWith.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Tiada kolaborator luar ditambah.</p>
                  ) : (
                    sharedWith.map((email) => (
                      <div key={email} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700 border border-slate-100">
                        <span className="font-medium truncate">{email}</span>
                        <button
                          onClick={() => handleRemoveCollaborator(email)}
                          className="text-rose-500 hover:text-rose-700 font-semibold text-xs ml-2"
                        >
                          Buang
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
