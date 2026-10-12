import { useEffect, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";
import { CryptoEngine } from "../services/CryptoEngine";

export interface VaultRecord {
  id: string;
  kind: "task" | "event" | "transaction" | "note";
  title: string;
  content?: string;
  status?: string;
  date?: string;
  end?: string;
  amount?: number;
  category?: string;
  annotations?: unknown[];
  updatedAt?: number;
}
export function useVaultRecords(kind?: VaultRecord["kind"]) {
  const { user } = useAuth();
  const { masterKey } = useCrypto();
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const session = ++generation.current;
    setRecords([]);
    setError("");
    setLoading(true);
    if (!user || !masterKey) {
      setLoading(false);
      return;
    }
    let snapshotVersion = 0;
    const off = onSnapshot(
      collection(db, "users", user.uid, "records"),
      async (snapshot) => {
        const version = ++snapshotVersion;
        try {
          const decoded = await Promise.all(
            snapshot.docs.map(async (row) => {
              const bytes = await CryptoEngine.decryptPayload(
                row.data().payload,
                masterKey,
              );
              return {
                ...JSON.parse(CryptoEngine.decodeText(bytes)),
                id: row.id,
              } as VaultRecord;
            }),
          );
          if (generation.current !== session || snapshotVersion !== version)
            return;
          setRecords(
            decoded
              .filter((r) => !kind || r.kind === kind)
              .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
          );
          setError("");
        } catch {
          if (generation.current === session)
            setError(
              "Unable to decrypt records. Lock and unlock with your original passphrase.",
            );
        } finally {
          if (generation.current === session) setLoading(false);
        }
      },
      () => {
        if (generation.current === session) {
          setError(
            "Unable to load data. Check your connection and Firestore permissions.",
          );
          setLoading(false);
        }
      },
    );
    return () => {
      generation.current++;
      off();
    };
  }, [user?.uid, masterKey, kind]);
  async function save(value: Omit<VaultRecord, "id"> & { id?: string }) {
    if (!user || !masterKey) throw new Error("Unlock your vault first.");
    const id = value.id || crypto.randomUUID();
    const record = { ...value, id, updatedAt: Date.now() };
    const payload = await CryptoEngine.encryptPayload(
      CryptoEngine.encodeText(JSON.stringify(record)),
      masterKey,
    );
    await setDoc(doc(db, "users", user.uid, "records", id), {
      payload,
      updatedAt: serverTimestamp(),
    });
    return id;
  }
  async function remove(id: string) {
    if (!user || !masterKey) throw new Error("Unlock your vault first.");
    await deleteDoc(doc(db, "users", user.uid, "records", id));
  }
  return { records, loading, error, save, remove };
}
