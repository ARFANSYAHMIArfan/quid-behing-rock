import { useState } from "react";
import { MessageSquare, MoreHorizontal, Plus } from "lucide-react";
import { Note, Annotation } from "../../types/canvas";
import { cn } from "../../lib/utils";
import CollaborativeNote from "./CollaborativeNote";

interface NotesPanelProps {
  notes: Note[];
  annotations: Annotation[];
  activeAnnotationId: string | null;
  onAddNote: (text: string) => void;
  onNoteClick: (annotationId: string) => void;
}

export default function NotesPanel({
  notes,
  annotations,
  activeAnnotationId,
  onAddNote,
  onNoteClick,
}: NotesPanelProps) {
  const [newNoteText, setNewNoteText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    onAddNote(newNoteText);
    setNewNoteText("");
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center gap-2 text-slate-900">
          <MessageSquare className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-sm">Linked Notes</h2>
        </div>
        <button className="text-slate-400 hover:text-slate-600">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {notes.length === 0 && !activeAnnotationId ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <p className="text-sm text-slate-500">No linked notes yet.</p>
            <p className="text-xs text-slate-400 mt-1">Select an annotation and add a note below.</p>
          </div>
        ) : (
          notes.map((note) => {
            const isLinkedActive = note.annotationAnchorId === activeAnnotationId;
            const parentAnnotation = annotations.find(a => a.id === note.annotationAnchorId);
            const badgeColor = parentAnnotation?.color || "#cbd5e1";

            return (
              <div 
                key={note.id} 
                onClick={() => onNoteClick(note.annotationAnchorId)}
                className={cn(
                  "cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-all",
                  isLinkedActive ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200 hover:border-emerald-300"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className="h-2.5 w-2.5 rounded-full" 
                      style={{ backgroundColor: badgeColor }} 
                    />
                    <span className="text-xs font-medium text-slate-500">
                      {parentAnnotation?.type.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.text}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-4">
        {activeAnnotationId ? (
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-emerald-600">
              Live Encrypted Note
            </label>
            <CollaborativeNote noteId={activeAnnotationId} />
            
            <div className="mt-2 text-[10px] text-slate-400 text-center">
              Backed by Firestore + Yjs CRDT + AES-GCM
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
            <p className="text-xs text-slate-500">Select an annotation on the canvas to attach a note.</p>
          </div>
        )}
      </div>
    </div>
  );
}
