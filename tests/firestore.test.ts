import { test, before, after } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
let env: RulesTestEnvironment;
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
before(async () => {
  if (!enabled) return;
  env = await initializeTestEnvironment({
    projectId: "demo-workspace",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "documents", "file"), {
      ownerId: "owner",
      sharedWith: [],
      folderId: "root",
      storagePath: "real-token",
      encryptedTitle: {},
    });
    await setDoc(doc(db, "annotations", "legacy"), { docId: "demo-doc-123" });
    await setDoc(doc(db, "notes", "private-note"), { ownerId: "owner" });
  });
});
after(async () => {
  if (env) await env.cleanup();
});
function db(uid: string, verified = true) {
  return env
    .authenticatedContext(uid, {
      email: "rfnsyhmi.principal@gmail.com",
      email_verified: verified,
    })
    .firestore();
}
test(
  "Firestore isolates encrypted records and denies unauthenticated/unverified clients",
  { skip: !enabled },
  async () => {
    const payload = { iv: "a", ciphertext: "b", tag: "c" };
    await assertSucceeds(
      setDoc(doc(db("owner"), "users", "owner", "records", "note"), {
        payload,
        updatedAt: 1,
      }),
    );
    await assertFails(
      getDoc(doc(db("other"), "users", "owner", "records", "note")),
    );
    await assertFails(
      getDoc(
        doc(
          env.unauthenticatedContext().firestore(),
          "users",
          "owner",
          "records",
          "note",
        ),
      ),
    );
    await assertFails(
      getDoc(doc(db("owner", false), "users", "owner", "records", "note")),
    );
    await assertSucceeds(
      getDocs(collection(db("owner"), "users", "owner", "records")),
    );
  },
);
test(
  "Firestore freezes server-owned file locations while permitting folder/rename changes",
  { skip: !enabled },
  async () => {
    await assertSucceeds(
      updateDoc(doc(db("owner"), "documents", "file"), {
        folderId: "Projects",
      }),
    );
    await assertFails(
      updateDoc(doc(db("owner"), "documents", "file"), {
        storagePath: "another-users-file",
      }),
    );
    await assertFails(
      updateDoc(doc(db("owner"), "documents", "file"), { ownerId: "other" }),
    );
    await assertFails(deleteDoc(doc(db("owner"), "documents", "file")));
    await assertFails(
      setDoc(doc(db("owner"), "documents", "forged"), {
        ownerId: "owner",
        storagePath: "victim",
      }),
    );
    await assertFails(getDoc(doc(db("other"), "documents", "file")));
    await assertSucceeds(
      getDocs(
        query(
          collection(db("owner"), "documents"),
          where("ownerId", "==", "owner"),
        ),
      ),
    );
  },
);
test(
  "Firestore prevents vault config overwrite and private note/delta access by others",
  { skip: !enabled },
  async () => {
    await assertSucceeds(
      setDoc(doc(db("owner"), "users", "owner"), { vault: { version: 2 } }),
    );
    await assertFails(
      updateDoc(doc(db("owner"), "users", "owner"), { vault: { version: 1 } }),
    );
    await assertFails(getDoc(doc(db("owner"), "annotations", "legacy")));
    await assertSucceeds(
      setDoc(doc(db("owner"), "notes", "private-note", "deltas", "delta"), {
        encryptedUpdate: {},
      }),
    );
    await assertFails(
      getDoc(doc(db("other"), "notes", "private-note", "deltas", "delta")),
    );
    await assertFails(
      setDoc(doc(db("other"), "annotations", "forged"), {
        ownerId: "owner",
        docId: "file",
      }),
    );
  },
);
