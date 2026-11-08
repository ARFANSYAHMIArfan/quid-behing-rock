import { useState, useEffect } from "react";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  Search, 
  PenTool, 
  Layers, 
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import AnnotationCanvas from "../components/canvas/AnnotationCanvas";
import FloatingToolbar from "../components/canvas/FloatingToolbar";
import NotesPanel from "../components/canvas/NotesPanel";
import { Annotation, AnnotationType, Note } from "../types/canvas";

export interface DocNoteItem {
  id: string;
  ownerId: string;
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
  const [isSaving, setIsSaving] = useState(false);
  const [showCanvasMode, setShowCanvasMode] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Canvas / Annotation states
  const [activeTool, setActiveTool] = useState<AnnotationType | "select">("select");
  const [activeColor, setActiveColor] = useState<string>("#ef4444");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  // Fetch real user documents from Firestore
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const q = query(
      collection(db, "notes_documents"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: DocNoteItem[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DocNoteItem, "id">)
      }));
      // Sort in memory to avoid requiring a composite index in Firestore
      items.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds * 1000 || 0;
        const timeB = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds * 1000 || 0;
        return timeB - timeA;
      });
      setDocuments(items);
      setLoading(false);

      // Auto-select first doc if none selected
      if (items.length > 0 && !selectedDocId) {
        setSelectedDocId(items[0].id);
        setTitle(items[0].title);
        setContent(items[0].content || "");
      }
    }, (err) => {
      console.error("Firestore docs error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // When selected doc changes, populate editor
  const handleSelectDoc = (docItem: DocNoteItem) => {
    setSelectedDocId(docItem.id);
    setTitle(docItem.title);
    setContent(docItem.content || "");
    setShowCanvasMode(false);
  };

  const handleCreateNewDoc = async () => {
    if (!user) return;
    try {
      const newDocRef = await addDoc(collection(db, "notes_documents"), {
        ownerId: user.uid,
        title: "Dokumen Tanpa Tajuk",
        content: "# Catatan Baru\n\nMula menulis di sini...",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSelectedDocId(newDocRef.id);
      setTitle("Dokumen Tanpa Tajuk");
      setContent("# Catatan Baru\n\nMula menulis di sini...");
      setNotification({ type: "success", text: "Dokumen baru dicipta!" });
      setTimeout(() => setNotification(null), 2500);
    } catch (err: any) {
      alert("Gagal mencipta dokumen: " + err.message);
    }
  };

  const handleSaveDoc = async () => {
    if (!selectedDocId || !user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "notes_documents", selectedDocId), {
        title: title.trim() || "Dokumen Tanpa Tajuk",
        content,
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
        }
      }
    } catch (err: any) {
      alert("Gagal memadam dokumen: " + err.message);
    }
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
      {/* Left Sidebar: Document List */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <FileText className="h-4 w-4" />
            </div>
            <h2 className="font-bold text-slate-900 text-sm">Docs & Notes</h2>
          </div>
          <button
            onClick={handleCreateNewDoc}
            className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-500 transition-colors shadow-xs"
            title="Cipta Dokumen Baru"
          >
            <Plus className="h-4 w-4" />
          </button>
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
                    <span className="truncate">{docItem.title || "Tanpa Tajuk"}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteDoc(docItem.id, e)}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-opacity"
                    title="Padam"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
                    placeholder="Tulis catatan, dokumen, atau perancangan anda di sini (menyokong format teks penuh)..."
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
              Semua dokumen disimpan secara langsung ke pangkalan data peribadi anda di Firebase.
            </p>
            <button
              onClick={handleCreateNewDoc}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              Cipta Dokumen Baru Sekarang
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
