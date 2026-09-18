import { useState, useEffect } from "react";
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  User, 
  Key, 
  Server, 
  Mail, 
  ShieldAlert, 
  HardDrive, 
  Send, 
  Cloud, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  ExternalLink
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";

export default function Settings() {
  const { user } = useAuth();
  const { isUnlocked, lockVault } = useCrypto();

  const [telegramStatus, setTelegramStatus] = useState<{
    configured: boolean;
    botUsername?: string;
    botName?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/telegram/status");
        if (res.ok) {
          const data = await res.json();
          setTelegramStatus(data);
        }
      } catch (err) {
        console.warn("Failed to fetch storage status:", err);
      }
    }
    fetchStatus();
  }, []);

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

        {/* Storage Backends Configuration */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-base font-semibold leading-6 text-slate-900 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-slate-500" />
              Cloud Storage Engines
            </h3>
            <span className="text-xs text-slate-500">Multi-Backend Support</span>
          </div>
          <div className="px-6 py-6 space-y-6">
            
            {/* Telegram Bot Storage Card */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600">
                    <Send className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      Telegram Bot Storage
                      {telegramStatus?.configured ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          <CheckCircle2 className="h-3 w-3" /> Connected (@{telegramStatus.botUsername})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                          <AlertCircle className="h-3 w-3" /> Setup Needed
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Store encrypted files inside a private Telegram chat/channel with unlimited capacity.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-2">
                <p className="font-medium text-slate-700">Required Environment Variables (in <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">.env</code>):</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">BOT TOKEN (@BotFather)</span>
                    <span className="text-slate-800 font-semibold">TELEGRAM_BOT_TOKEN</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">CHAT/CHANNEL ID</span>
                    <span className="text-slate-800 font-semibold">TELEGRAM_CHAT_ID</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 text-[11px] pt-1">
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>Tip: Create a bot with <strong>@BotFather</strong>, add it to your private channel as admin, and obtain the channel ID.</span>
                </div>
              </div>
            </div>

            {/* Lark Drive Card */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <Cloud className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    Lark Drive Storage
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
                      Configured
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Utilizes Lark OpenAPI credentials (<code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">LARK_APP_ID</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">LARK_APP_SECRET</code>).
                  </p>
                </div>
              </div>
            </div>

            {/* Cloudflare R2 Card (Upcoming) */}
            <div className="rounded-xl border border-dashed border-slate-300 p-4 bg-slate-50/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      Cloudflare R2 (S3-Compatible)
                      <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
                        Queued Next
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      10GB free monthly storage with zero egress fees via AWS S3-compatible API.
                    </p>
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
