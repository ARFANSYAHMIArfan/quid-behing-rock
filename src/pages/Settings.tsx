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
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Loader2
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";
import { AuthService } from "../services/AuthService";

export default function Settings() {
  const { user } = useAuth();
  const { isUnlocked, lockVault } = useCrypto();

  const [r2Status, setR2Status] = useState<{
    configured: boolean;
    bucket?: string;
    accountId?: string;
    publicDevUrl?: string;
    customDomain?: string;
    endpoint?: string;
    warning?: string;
  } | null>(null);

  const [testingR2, setTestingR2] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [connectingGmail, setConnectingGmail] = useState(false);

  useEffect(() => {
    checkR2Status();
    setGmailToken(AuthService.getGmailAccessToken());
  }, []);

  async function checkR2Status() {
    setTestingR2(true);
    try {
      const res = await fetch("/api/r2/status");
      if (res.ok) {
        const data = await res.json();
        setR2Status(data);
        setTestResult(data.configured ? "Sambungan ke bucket Cloudflare R2 berjaya dan sah!" : (data.error || "Ralat"));
      } else {
        setTestResult("Gagal berhubung dengan pelayan R2.");
      }
    } catch (err: any) {
      console.warn("Failed to test R2:", err);
      setTestResult(`Ralat ujian: ${err.message}`);
    } finally {
      setTestingR2(false);
    }
  }

  const handleReconnectGmail = async () => {
    setConnectingGmail(true);
    try {
      const token = await AuthService.requestGmailAccess();
      setGmailToken(token);
      alert("Akaun Gmail Google Workspace berjaya disambung semula!");
    } catch (e: any) {
      alert(`Gagal menyambung Gmail: ${e.message}`);
    } finally {
      setConnectingGmail(false);
    }
  };

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
              Profil Akaun Pengguna
            </h3>
          </div>
          <div className="px-6 py-6">
            <dl className="space-y-6">
              <div>
                <dt className="text-sm font-medium text-slate-500 flex items-center gap-2 mb-1">
                  <Mail className="h-4 w-4" />
                  Alamat Emel Pengguna
                </dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {user?.email || "Not authenticated"}
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-slate-500 flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4" />
                  Kebenaran Domain Zero-Trust
                </dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    Domain &amp; Emel Disahkan (rfnsyhmi.dpdns.org / Google OAuth)
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-slate-500 flex items-center gap-2 mb-1">
                  <Server className="h-4 w-4" />
                  Firebase User UID
                </dt>
                <dd className="text-sm font-mono text-slate-600">
                  {user?.uid}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Cloud Storage: Cloudflare R2 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-base font-semibold leading-6 text-slate-900 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-orange-600" />
              Storan Cloudflare R2 (S3-Compatible)
            </h3>
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
              <CheckCircle2 className="h-3 w-3" /> Enjin Utama Aktif
            </span>
          </div>
          
          <div className="px-6 py-6 space-y-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Bucket: {r2Status?.bucket || "rfnsyhmi-workspace"}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Storan objek berprestasi tinggi tanpa yuran pemindahan (Zero Egress Fees).
                  </p>
                </div>
                
                <button
                  onClick={checkR2Status}
                  disabled={testingR2}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shrink-0 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${testingR2 ? "animate-spin text-orange-600" : ""}`} />
                  {testingR2 ? "Menguji..." : "Uji Sambungan R2"}
                </button>
              </div>

              {testResult && (
                <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{testResult}</span>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Cloudflare Account ID</span>
                  <span className="text-slate-800 font-mono font-semibold text-[11px]">
                    {r2Status?.accountId || "582f56f4b43ffae6cd39f32868762050"}
                  </span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Domain Tersuai</span>
                  <a 
                    href="https://rfnsyhmi.dpdns.org" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-sky-600 font-semibold text-[11px] hover:underline inline-flex items-center gap-1"
                  >
                    rfnsyhmi.dpdns.org <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 sm:col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Public Development URL</span>
                  <a 
                    href="https://pub-bceec50286f2449da6fb6c9737572025.r2.dev" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-slate-700 font-mono text-[11px] hover:text-sky-600 hover:underline break-all inline-flex items-center gap-1"
                  >
                    https://pub-bceec50286f2449da6fb6c9737572025.r2.dev <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Google Workspace: Gmail Integration */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-base font-semibold leading-6 text-slate-900 flex items-center gap-2">
              <Mail className="h-4 w-4 text-red-600" />
              Integrasi Google Workspace (Gmail)
            </h3>
            {gmailToken ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <CheckCircle2 className="h-3 w-3" /> OAuth Disahkan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                <AlertCircle className="h-3 w-3" /> Perlu Sambungan
              </span>
            )}
          </div>
          
          <div className="px-6 py-6 space-y-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Google Workspace Gmail API
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Skop: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800 text-[11px]">https://www.googleapis.com/auth/gmail.modify</code>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Membolehkan anda menyemak emel, membaca mesej penuh, dan menulis emel baharu terus dari tab Peti Masuk.
                </p>
              </div>

              <button
                onClick={handleReconnectGmail}
                disabled={connectingGmail}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-colors shrink-0 disabled:opacity-60"
              >
                {connectingGmail ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Menyambungkan...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {gmailToken ? "Segarkan Akses Gmail" : "Sambungkan Gmail"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Security & Cryptography */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-base font-semibold leading-6 text-slate-900 flex items-center gap-2">
              <Key className="h-4 w-4 text-slate-500" />
              Keselamatan &amp; Kriptografi Bilik Kebal
            </h3>
          </div>
          <div className="px-6 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-slate-900 flex items-center gap-2">
                  Status Bilik Kebal Master
                  {isUnlocked ? (
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      Dibuka (Unlocked)
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                      Dikunci (Locked)
                    </span>
                  )}
                </h4>
                <p className="text-sm text-slate-500 mt-1">
                  Kunci penyulitan utama diterbitkan menggunakan Argon2id dan disimpan hanya dalam memori sesi tempatan anda.
                  Kunci ini tidak pernah dihantar kepada pelayan atau pihak ketiga.
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm("Mengunci bilik kebal memerlukan anda memasukkan kata laluan master semula. Teruskan?")) {
                    lockVault();
                  }
                }}
                disabled={!isUnlocked}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Kunci Bilik Kebal Sekarang
              </button>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <ShieldAlert className="h-5 w-5 text-amber-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-amber-800">Pemulihan Kata Laluan Master</h3>
                    <div className="mt-2 text-sm text-amber-700">
                      <p>
                        Kerana ruang kerja ini menggunakan penyulitan penuh Zero-Knowledge (AES-256-GCM), 
                        kata laluan anda tidak boleh dipulihkan sekiranya terlupa. Pastikan anda menyimpannya di tempat selamat.
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
