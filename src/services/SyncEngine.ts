import * as Y from "yjs";
import { collection, doc, onSnapshot, query, orderBy, setDoc, serverTimestamp, deleteDoc, where, getDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { CryptoEngine, EncryptedPayload } from "./CryptoEngine";
import { Annotation } from "../types/canvas";

export class SyncEngine {
  yDoc: Y.Doc;
  private noteId: string;
  private encryptionKey: CryptoKey;
  private unsubscribe: (() => void) | null = null;
  private authorDeviceId: string;

  constructor(noteId: string, encryptionKey: CryptoKey, authorDeviceId: string) {
    this.noteId = noteId;
    this.encryptionKey = encryptionKey;
    this.authorDeviceId = authorDeviceId;
    this.yDoc = new Y.Doc();
  }

  /**
   * Starts syncing the Y.Doc with Firestore Deltas.
   * @param onStateChange Callback triggered when the document updates (useful for React re-renders)
   */
  async startSync(onStateChange: () => void) {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error('Sign in before syncing notes.');
    const noteRef = doc(db, 'notes', this.noteId);
    const existing = await getDoc(noteRef);
    if (existing.exists() && existing.data().ownerId !== ownerId) throw new Error('Note is not owned by this account.');
    if (!existing.exists()) await setDoc(noteRef, { ownerId });
    // 1. Listen to local Yjs changes and push to Firestore
    this.yDoc.on("update", async (update: Uint8Array, origin: any) => {
      // Avoid infinite loops by ignoring updates that came from Firestore
      if (origin !== "remote") {
        try {
          const encrypted = await CryptoEngine.encryptPayload(update, this.encryptionKey);
          const deltaId = crypto.randomUUID();
          const deltaRef = doc(db, "notes", this.noteId, "deltas", deltaId);
          
          await setDoc(deltaRef, {
            sequence: Date.now(),
            authorDeviceId: this.authorDeviceId,
            encryptedUpdate: encrypted,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          console.error("Failed to encrypt/send CRDT delta:", error);
        }
      }
      onStateChange();
    });

    // 2. Listen to remote deltas from Firestore
    const deltasRef = collection(db, "notes", this.noteId, "deltas");
    const q = query(deltasRef, orderBy("sequence", "asc"));
    
    this.unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          // Only apply deltas from other devices/users
          {
            try {
              const encryptedPayload = data.encryptedUpdate as EncryptedPayload;
              const decryptedUpdate = await CryptoEngine.decryptPayload(encryptedPayload, this.encryptionKey);
              
              // Apply remote update to local Y.Doc
              Y.applyUpdate(this.yDoc, decryptedUpdate, "remote");
            } catch (e) {
              console.error("Failed to decrypt remote CRDT delta:", e);
            }
          }
        }
      });
    }, (error) => {
      console.error("Firestore Deltas Snapshot Error:", error);
    });
  }

  stopSync() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.yDoc.destroy();
  }
}

/**
 * Handles End-to-End Encrypted synchronization of Canvas Annotations
 */
export class AnnotationSyncEngine {
  static async pushAnnotation(annotation: Annotation, docId: string, encryptionKey: CryptoKey) {
    try {
      const payloadString = JSON.stringify(annotation);
      const payloadBytes = CryptoEngine.encodeText(payloadString);
      const encrypted = await CryptoEngine.encryptPayload(payloadBytes, encryptionKey);
      
      const annRef = doc(db, "annotations", annotation.id);
      await setDoc(annRef, {
        ownerId: auth.currentUser?.uid,
        docId,
        type: annotation.type,
        pageIndex: 0,
        encryptedPayload: encrypted,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to sync annotation:", error);
    }
  }

  static subscribeToAnnotations(docId: string, encryptionKey: CryptoKey, onUpdate: (annotations: Annotation[]) => void) {
    const annRef = collection(db, "annotations");
    // In a real app we would index docId and query by it.
    // For simplicity in this demo, we'll fetch and filter, or just use a query if index is assumed.
    // const q = query(annRef, where("docId", "==", docId));
    
    return onSnapshot(query(annRef, where('ownerId', '==', auth.currentUser?.uid), where('docId', '==', docId)), async (snapshot) => {
      const decryptedAnnotations: Annotation[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.docId !== docId) continue;
        
        try {
          const decryptedBytes = await CryptoEngine.decryptPayload(data.encryptedPayload, encryptionKey);
          const decryptedString = CryptoEngine.decodeText(decryptedBytes);
          const annotation = JSON.parse(decryptedString) as Annotation;
          annotation.isEncrypted = true; // Mark as successfully E2EE synced
          decryptedAnnotations.push(annotation);
        } catch (e) {
          console.error("Failed to decrypt annotation", docSnap.id, e);
        }
      }
      
      onUpdate(decryptedAnnotations);
    }, (error) => {
      console.error("Firestore Annotations Snapshot Error:", error);
    });
  }

  static async deleteAnnotation(annotationId: string) {
    const annRef = doc(db, "annotations", annotationId);
    await deleteDoc(annRef);
  }
}

