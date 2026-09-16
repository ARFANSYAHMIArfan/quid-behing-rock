import { Document } from "flexsearch";

// Create a FlexSearch Document index
// Using any to bypass strict typing issues with flexsearch in older DT versions
const index = new (Document as any)({
  document: {
    id: "id",
    index: ["title", "content"],
    store: ["title", "content", "type"] // type could be "note" or "document"
  },
  tokenize: "forward",
  cache: true,
});

self.onmessage = (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  switch (type) {
    case "INDEX_DOC":
      // Add or update a document in the index
      index.add({
        id: payload.id,
        title: payload.title || "",
        content: payload.content || "",
        type: payload.type || "unknown"
      });
      self.postMessage({ type: "INDEX_DOC_SUCCESS", id });
      break;

    case "SEARCH":
      // Search the index
      const results = index.search(payload.query, 10, { enrich: true });
      
      // FlexSearch returns an array of objects per indexed field
      // e.g. [{ field: "title", result: [ { id: "1", doc: {...} } ] }]
      // We'll flatten and deduplicate this for the UI
      const dedupedMap = new Map<string, any>();
      
      results.forEach((fieldResult: any) => {
        fieldResult.result.forEach((res: any) => {
          if (!dedupedMap.has(res.id)) {
            dedupedMap.set(res.id, res.doc);
          }
        });
      });

      self.postMessage({ 
        type: "SEARCH_RESULTS", 
        id, 
        payload: { results: Array.from(dedupedMap.values()) } 
      });
      break;

    case "REMOVE_DOC":
      index.remove(payload.id);
      self.postMessage({ type: "REMOVE_DOC_SUCCESS", id });
      break;
  }
};
