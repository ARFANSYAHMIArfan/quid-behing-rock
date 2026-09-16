import { createContext, useContext, useState, ReactNode } from "react";
import { CryptoEngine } from "../services/CryptoEngine";

interface CryptoContextType {
  isUnlocked: boolean;
  masterKey: CryptoKey | null;
  ecdhKeyPair: CryptoKeyPair | null;
  unlockVault: (passphrase: string) => Promise<void>;
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
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [ecdhKeyPair, setEcdhKeyPair] = useState<CryptoKeyPair | null>(null);

  const unlockVault = async (passphrase: string) => {
    // In a real app, salt should be retrieved from the user's Firestore document.
    // For demonstration, we'll derive a deterministic salt from their email,
    // though a random salt stored in the DB is cryptographically required in production.
    const mockSalt = new TextEncoder().encode("user-specific-static-salt-demo");
    
    const key = await CryptoEngine.deriveMasterKey(passphrase, mockSalt);
    const keyPair = await CryptoEngine.generateECDHKeyPair();
    
    setMasterKey(key);
    setEcdhKeyPair(keyPair);
  };

  const lockVault = () => {
    setMasterKey(null);
    setEcdhKeyPair(null);
  };

  return (
    <CryptoContext.Provider
      value={{
        isUnlocked: masterKey !== null,
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
