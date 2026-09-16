import { useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { useCrypto } from "../contexts/CryptoContext";
import { useAuth } from "../contexts/AuthContext";
import { AuthService } from "../services/AuthService";

export default function UnlockVault() {
  const [passphrase, setPassphrase] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { unlockVault } = useCrypto();
  const { user } = useAuth();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;
    
    setIsUnlocking(true);
    try {
      // Derives Argon2id master key (this is CPU intensive and takes a moment)
      await unlockVault(passphrase);
    } catch (error) {
      console.error("Failed to unlock vault", error);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 shadow-xl rounded-2xl border border-slate-100">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 shadow-sm">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
            Encrypted Workspace
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Welcome back, {user?.email}
          </p>
          <div className="mt-4 rounded-md bg-blue-50 p-4 text-sm text-blue-800 text-left border border-blue-100">
            Your data is End-to-End Encrypted (AES-256-GCM). We use Argon2id to derive your encryption keys locally. Your passphrase never leaves this device.
          </div>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleUnlock}>
          <div>
            <label htmlFor="passphrase" className="block text-sm font-medium leading-6 text-slate-900">
              Master Passphrase
            </label>
            <div className="relative mt-2 rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <KeyRound className="h-5 w-5 text-slate-400" aria-hidden="true" />
              </div>
              <input
                id="passphrase"
                name="passphrase"
                type="password"
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="block w-full rounded-md border-0 py-2.5 pl-10 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                placeholder="Enter your master passphrase"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={isUnlocking || !passphrase}
              className="flex w-full justify-center rounded-lg bg-blue-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-70 transition-all"
            >
              {isUnlocking ? "Deriving Keys (Argon2id)..." : "Unlock Workspace"}
            </button>
            <button
              type="button"
              onClick={() => AuthService.logOut()}
              className="flex w-full justify-center rounded-lg bg-white px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-all"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
