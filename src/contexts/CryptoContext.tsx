import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import { CryptoEngine, EncryptedPayload } from "../services/CryptoEngine";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthContext";
interface VaultConfig {
  version: number;
  salt: string;
  wrappedKey: EncryptedPayload;
  verifier: EncryptedPayload;
  privateKey: EncryptedPayload;
  publicKey: string;
}
interface CryptoContextType {
  isUnlocked: boolean;
  masterKey: CryptoKey | null;
  ecdhKeyPair: CryptoKeyPair | null;
  unlockVault: (passphrase: string, create?: boolean) => Promise<void>;
  lockVault: () => void;
}
const CryptoContext = createContext<CryptoContextType>({
  isUnlocked: false,
  masterKey: null,
  ecdhKeyPair: null,
  unlockVault: async () => {},
  lockVault: () => {},
});
export function CryptoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [ecdhKeyPair, setEcdhKeyPair] = useState<CryptoKeyPair | null>(null);
  const epoch = useRef(0);
  const lockVault = () => {
    epoch.current++;
    setMasterKey(null);
    setEcdhKeyPair(null);
  };
  useEffect(() => {
    lockVault();
  }, [user?.uid]);
  useEffect(() => {
    if (!masterKey) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lockVault, 15 * 60 * 1000);
    };
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [masterKey]);
  async function unlockVault(passphrase: string, create = false) {
    if (!user) throw new Error("Please sign in first.");
    const session = epoch.current;
    const ref = doc(db, "users", user.uid);
    const profile = await getDoc(ref);
    let config = profile.data()?.vault as VaultConfig | undefined;
    if (!config) {
      const oldDocs = await getDocs(
        query(collection(db, "documents"), where("ownerId", "==", user.uid)),
      );
      const hasLegacy = !oldDocs.empty;
      if (!hasLegacy && !create)
        throw new Error(
          "No vault has been set up. Choose Create vault and confirm your passphrase.",
        );
      if (!hasLegacy && passphrase.length < 12)
        throw new Error("Use a passphrase of at least 12 characters.");
      let dataKey: CryptoKey;
      if (hasLegacy) {
        // Preserve the old data key; wrap it with a new, randomly salted key.
        const legacySalt = new TextEncoder().encode(
          "user-specific-static-salt-demo",
        );
        const legacyKey = await CryptoEngine.deriveMasterKey(
          passphrase,
          legacySalt,
        );
        try {
          for (const row of oldDocs.docs)
            await CryptoEngine.decryptPayload(
              row.data().encryptedTitle,
              legacyKey,
            );
        } catch {
          throw new Error(
            "Incorrect passphrase for your existing files. No data was changed.",
          );
        }
        dataKey = await CryptoEngine.deriveMasterKey(
          passphrase,
          legacySalt,
          true,
        );
      } else dataKey = await CryptoEngine.generateDEK();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const wrappingKey = await CryptoEngine.deriveMasterKey(passphrase, salt);
      const pair = await CryptoEngine.generateECDHKeyPair();
      const privateBytes = new Uint8Array(
        await crypto.subtle.exportKey("pkcs8", pair.privateKey),
      );
      config = {
        version: 2,
        salt: CryptoEngine.bufferToBase64(salt),
        wrappedKey: await CryptoEngine.encryptPayload(
          CryptoEngine.base64ToBuffer(
            await CryptoEngine.exportKeyToBase64(dataKey),
          ),
          wrappingKey,
        ),
        verifier: await CryptoEngine.encryptPayload(
          CryptoEngine.encodeText("workspace-vault-v2:" + user.uid),
          dataKey,
        ),
        privateKey: await CryptoEngine.encryptPayload(privateBytes, dataKey),
        publicKey: await CryptoEngine.exportPublicKey(pair.publicKey),
      };
      if (epoch.current !== session)
        throw new Error("Session changed. Please unlock again.");
      const candidate = config;
      config = await runTransaction(db, async (tx) => {
        const current = await tx.get(ref);
        if (current.data()?.vault) return current.data()!.vault as VaultConfig;
        tx.set(ref, { vault: candidate }, { merge: true });
        return candidate;
      });
    }
    try {
      const wrappingKey = await CryptoEngine.deriveMasterKey(
        passphrase,
        CryptoEngine.base64ToBuffer(config.salt),
      );
      const raw = await CryptoEngine.decryptPayload(
        config.wrappedKey,
        wrappingKey,
      );
      const key = await CryptoEngine.importAESKeyFromBase64(
        CryptoEngine.bufferToBase64(raw),
        false,
      );
      raw.fill(0);
      const check = CryptoEngine.decodeText(
        await CryptoEngine.decryptPayload(config.verifier, key),
      );
      if (check !== "workspace-vault-v2:" + user.uid)
        throw new Error("Invalid vault.");
      const privateBytes = await CryptoEngine.decryptPayload(
        config.privateKey,
        key,
      );
      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        privateBytes,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey", "deriveBits"],
      );
      privateBytes.fill(0);
      const publicKey = await CryptoEngine.importPublicKey(config.publicKey);
      if (epoch.current !== session) throw new Error("Session changed.");
      setMasterKey(key);
      setEcdhKeyPair({ privateKey, publicKey });
    } catch {
      throw new Error(
        "Unable to unlock. Check your original passphrase and try again.",
      );
    }
  }
  return (
    <CryptoContext.Provider
      value={{
        isUnlocked: !!masterKey,
        masterKey,
        ecdhKeyPair,
        unlockVault,
        lockVault,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
}
export function useCrypto() {
  return useContext(CryptoContext);
}
