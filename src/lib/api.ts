import { auth } from "./firebase";
export async function apiFetch(url: string, init: RequestInit = {}) {
  if (!auth.currentUser) throw new Error("Please sign in again.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
  return fetch(url, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(60000),
  });
}
