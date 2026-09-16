// Simple Promise wrapper for IndexedDB to store heavy blobs (e.g. PDFs, images)
export class LRUStorageManager {
  private dbName = "LocalVaultDB";
  private storeName = "DocumentBlobs";
  private maxItems: number;

  constructor(maxItems = 50) {
    this.maxItems = maxItems;
    this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("lastAccessed", "lastAccessed", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveBlob(id: string, encryptedBlob: Uint8Array): Promise<void> {
    const db = await this.initDB();
    
    // First, evict if necessary
    await this.evictIfNeeded(db);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      
      const record = {
        id,
        blob: encryptedBlob,
        lastAccessed: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBlob(id: string): Promise<Uint8Array | null> {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result) {
          // Update lastAccessed
          request.result.lastAccessed = Date.now();
          store.put(request.result);
          resolve(request.result.blob);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async evictIfNeeded(db: IDBDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => {
        if (request.result >= this.maxItems) {
          // Find the oldest item
          const index = store.index("lastAccessed");
          const cursorRequest = index.openCursor(); // ascending by default
          
          cursorRequest.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
            if (cursor) {
              store.delete(cursor.primaryKey);
              // Recursively check if we need to evict more, though usually just 1 is enough
              resolve(); 
            } else {
              resolve();
            }
          };
          cursorRequest.onerror = () => reject(cursorRequest.error);
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}
