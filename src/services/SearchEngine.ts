export interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: "note" | "document";
}

export class SearchEngine {
  private static worker: Worker | null = null;
  private static messageCounter = 0;
  private static callbacks = new Map<number, (payload: any) => void>();

  static init() {
    if (!this.worker) {
      this.worker = new Worker(new URL("../workers/search.worker.ts", import.meta.url), {
        type: "module",
      });

      this.worker.onmessage = (e: MessageEvent) => {
        const { id, payload } = e.data;
        if (id && this.callbacks.has(id)) {
          this.callbacks.get(id)!(payload);
          this.callbacks.delete(id);
        }
      };
    }
  }

  private static postMessageAsync(type: string, payload: any): Promise<any> {
    this.init();
    return new Promise((resolve) => {
      const id = ++this.messageCounter;
      this.callbacks.set(id, resolve);
      this.worker!.postMessage({ type, id, payload });
    });
  }

  /**
   * Indexes a decrypted document or note into the local Web Worker.
   * Never sends this data to the cloud.
   */
  static async indexDocument(doc: { id: string; title: string; content: string; type: "note" | "document" }) {
    return this.postMessageAsync("INDEX_DOC", doc);
  }

  /**
   * Performs a full-text search against the locally indexed decrypted data.
   */
  static async search(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const response = await this.postMessageAsync("SEARCH", { query });
    return response.results as SearchResult[];
  }

  static async removeDocument(id: string) {
    return this.postMessageAsync("REMOVE_DOC", { id });
  }
}
