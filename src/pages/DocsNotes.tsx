import { useState, useEffect } from "react";
import { FileText, Lock, Plus } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import AnnotationCanvas from "../components/canvas/AnnotationCanvas";
import FloatingToolbar from "../components/canvas/FloatingToolbar";
import NotesPanel from "../components/canvas/NotesPanel";
import { Annotation, AnnotationType, Note } from "../types/canvas";
import { AnnotationSyncEngine } from "../services/SyncEngine";
import { useCrypto } from "../contexts/CryptoContext";

export default function DocsNotes() {
  const [activeTool, setActiveTool] = useState<AnnotationType | "select">("select");
  const [activeColor, setActiveColor] = useState<string>("#ef4444");
  
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  const { masterKey } = useCrypto();
  const DEMO_DOC_ID = "demo-doc-123";

  // Sync Annotations
  useEffect(() => {
    if (!masterKey) return;
    const unsubscribe = AnnotationSyncEngine.subscribeToAnnotations(DEMO_DOC_ID, masterKey, (syncedAnnotations) => {
      // Merge local un-synced annotations with incoming synced ones.
      // For simplicity in this demo, we'll just replace with synced ones + keep ones not yet pushed
      setAnnotations(syncedAnnotations);
    });

    return () => unsubscribe();
  }, [masterKey]);

  // Hook into setAnnotations to push new annotations to Firestore
  const handleSetAnnotations = (newAnnotations: React.SetStateAction<Annotation[]>) => {
    setAnnotations((prev) => {
      const next = typeof newAnnotations === "function" ? newAnnotations(prev) : newAnnotations;
      
      // Find new annotations that haven't been encrypted/synced yet
      const newlyAdded = next.filter(a => !a.isEncrypted && !prev.find(p => p.id === a.id));
      
      newlyAdded.forEach(async (ann) => {
        if (masterKey) {
          await AnnotationSyncEngine.pushAnnotation(ann, DEMO_DOC_ID, masterKey);
        }
      });

      return next;
    });
  };

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

  return (
    <div className="flex h-full w-full bg-slate-100 overflow-hidden">
      {/* Center Canvas Area */}
      <div className="relative flex-1 flex flex-col p-4">
        {/* Top Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Project Architecture.pdf</h1>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Lock className="h-3 w-3" />
                <span>E2EE Active</span>
              </div>
            </div>
          </div>
          <button className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50">
            <Plus className="h-4 w-4" />
            Share Document
          </button>
        </div>

        {/* Canvas Workspace */}
        <div className="relative flex-1 rounded-lg">
          <AnnotationCanvas 
            activeTool={activeTool}
            activeColor={activeColor}
            annotations={annotations}
            setAnnotations={handleSetAnnotations}
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
      </div>

      {/* Right Side Linked Notes Panel */}
      <NotesPanel 
        notes={notes}
        annotations={annotations}
        activeAnnotationId={activeAnnotationId}
        onAddNote={handleAddNote}
        onNoteClick={handleNoteClick}
      />
    </div>
  );
}

