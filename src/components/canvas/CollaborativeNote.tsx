import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { SyncEngine } from "../../services/SyncEngine";
import { useCrypto } from "../../contexts/CryptoContext";
import { useAuth } from "../../contexts/AuthContext";

interface CollaborativeNoteProps {
  noteId: string;
}

export default function CollaborativeNote({ noteId }: CollaborativeNoteProps) {
  const { masterKey } = useCrypto();
  const { user } = useAuth();
  
  const [text, setText] = useState("");
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);

  useEffect(() => {
    if (!masterKey || !user) return;

    // Use user.uid + random string as a unique device/session ID to prevent applying our own updates
    const deviceId = `${user.uid}-${Math.random().toString(36).substring(7)}`;
    const engine = new SyncEngine(noteId, masterKey, deviceId);
    syncEngineRef.current = engine;
    yTextRef.current = engine.yDoc.getText("body");

    // Start sync and subscribe to state changes
    engine.startSync(() => {
      setText(yTextRef.current!.toString());
    });

    // Observe local Yjs changes so we update React state
    yTextRef.current.observe(() => {
      setText(yTextRef.current!.toString());
    });

    return () => {
      engine.stopSync();
    };
  }, [noteId, masterKey, user]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const yText = yTextRef.current;
    if (!yText) return;

    // A simple replacement approach for demo purposes.
    // In a real advanced collaborative editor (like TipTap/ProseMirror), 
    // you would compute the delta and apply it.
    // For a simple textarea, we just replace the content.
    // To preserve cursor position in a basic textarea, we need a slightly more complex approach,
    // but for this CRDT implementation demo, this works to broadcast changes.
    const currentLength = yText.length;
    yText.doc?.transact(() => {
      if (currentLength > 0) {
        yText.delete(0, currentLength);
      }
      yText.insert(0, newText);
    });
  };

  return (
    <div className="relative mt-2">
      <textarea
        value={text}
        onChange={handleChange}
        placeholder="Collaborative live editing..."
        className="block w-full min-h-[100px] resize-y rounded-lg border-emerald-300 bg-emerald-50/50 py-2.5 px-3 text-sm focus:border-emerald-500 focus:ring-emerald-500 shadow-inner"
      />
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-[10px] font-medium text-emerald-600">CRDT Live</span>
      </div>
    </div>
  );
}
