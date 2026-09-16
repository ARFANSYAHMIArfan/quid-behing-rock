import { Settings as SettingsIcon, ShieldCheck, User, Key, Server, Mail, ShieldAlert } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";

export default function Settings() {
  const { user } = useAuth();
  const { isUnlocked, lockVault } = useCrypto();

  return (
    <div className="flex h-full flex-col p-8 bg-slate-50 overflow-y-auto">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-slate-700" />
          Settings
        </h1>
      </div>

      <div className="max-w-4xl space-y-6">
        
        {/* Account Settings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-base font-semibold leading-6 text-slate-900 flex items-center gap-2">
              <User className="h-4 w-4 text-slate-500" />
              Account Profile
            </h3>
          </div>
          <div className="px-6 py-6">
            <dl className="space-y-6">
              <div>
                <dt className="text-sm font-medium text-slate-500 flex items-center gap-2 mb-1">
                  <Mail className="h-4 w-4" />
                  Email Address
                </dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {user?.email || "Not authenticated"}
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-slate-500 flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4" />
                  Domain Authorization
                </dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    Verified Zero-Trust Domain
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-slate-500 flex items-center gap-2 mb-1">
                  <Server className="h-4 w-4" />
                  User UID
                </dt>
                <dd className="text-sm font-mono text-slate-600">
                  {user?.uid}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Security & Cryptography */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-base font-semibold leading-6 text-slate-900 flex items-center gap-2">
              <Key className="h-4 w-4 text-slate-500" />
              Security & Cryptography
            </h3>
          </div>
          <div className="px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                  Master Vault Status
                  {isUnlocked ? (
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      Unlocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                      Locked
                    </span>
                  )}
                </h4>
                <p className="text-sm text-slate-500 mt-1">
                  Your master encryption key is derived using Argon2id and kept only in your local session memory. 
                  It is never transmitted to the server.
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm("Locking the vault will require you to enter your master password again. Continue?")) {
                    lockVault();
                  }
                }}
                disabled={!isUnlocked}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Lock Vault Now
              </button>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <ShieldAlert className="h-5 w-5 text-amber-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">Master Password Recovery</h3>
                    <div className="mt-2 text-sm text-amber-700">
                      <p>
                        Because this workspace uses zero-knowledge client-side encryption (AES-256-GCM), 
                        we cannot recover your master password if you forget it. Your data will be permanently inaccessible.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
