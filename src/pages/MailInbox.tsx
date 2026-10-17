import { useState, useEffect } from "react";
import { 
  Inbox, 
  Mail, 
  Loader2, 
  AlertCircle, 
  Star, 
  Send, 
  Trash2, 
  RefreshCw, 
  PenSquare, 
  Search, 
  ArrowLeft, 
  Reply, 
  CheckCircle2, 
  X,
  ExternalLink
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { AuthService } from "../services/AuthService";

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  fromName?: string;
  fromEmail?: string;
  to?: string;
  date?: string;
  timestamp?: number;
  isRead?: boolean;
  isStarred?: boolean;
  labelIds?: string[];
}

interface GmailMessageDetail extends GmailMessageSummary {
  bodyHtml?: string;
  bodyText?: string;
}

function base64UrlDecode(str: string): string {
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (e) {
    try {
      return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
      return "";
    }
  }
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function extractBody(payload: any): { html?: string; text?: string } {
  let html = "";
  let text = "";

  function traverse(part: any) {
    if (!part) return;
    if (part.mimeType === "text/html" && part.body?.data) {
      html += base64UrlDecode(part.body.data);
    } else if (part.mimeType === "text/plain" && part.body?.data) {
      text += base64UrlDecode(part.body.data);
    }

    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(traverse);
    }
  }

  traverse(payload);
  return { html, text };
}

export default function MailInbox() {
  const { user } = useAuth();
  
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"INBOX" | "STARRED" | "SENT" | "TRASH">("INBOX");
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageDetail | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Compose modal state
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    const existingToken = AuthService.getGmailAccessToken();
    if (existingToken) {
      setToken(existingToken);
    }
  }, []);

  const handleConnectGmail = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const accessToken = await AuthService.requestGmailAccess();
      setToken(accessToken);
    } catch (err: any) {
      console.error("Gmail Connection Error:", err);
      setError(err.message || "Gagal menyambung ke akaun Google Workspace Gmail.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Fetch message list
  const fetchMessages = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      let q = "";
      if (activeTab === "INBOX") q = "in:inbox";
      else if (activeTab === "STARRED") q = "is:starred";
      else if (activeTab === "SENT") q = "in:sent";
      else if (activeTab === "TRASH") q = "in:trash";

      if (searchQuery.trim()) {
        q = `${q} ${searchQuery.trim()}`.trim();
      }

      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(q)}`;
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (listRes.status === 401) {
        // Token expired
        setToken(null);
        setError("Sesi log masuk Google telah tamat. Sila klik butang di bawah untuk menyambung semula Gmail.");
        return;
      }

      if (!listRes.ok) {
        const errJson = await listRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Gagal mengambil senarai emel (${listRes.status})`);
      }

      const listData = await listRes.json();
      const rawList: { id: string; threadId: string }[] = listData.messages || [];

      if (rawList.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      // Fetch headers in parallel for top messages (up to 15)
      const topIds = rawList.slice(0, 15);
      const messageDetails = await Promise.all(
        topIds.map(async (item) => {
          try {
            const msgRes = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!msgRes.ok) return null;
            const msgData = await msgRes.json();

            const headers: GmailMessageHeader[] = msgData.payload?.headers || [];
            const getH = (n: string) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || "";

            const fromRaw = getH("From");
            let fromName = fromRaw;
            let fromEmail = fromRaw;
            const match = fromRaw.match(/(.*)<(.*)>/);
            if (match) {
              fromName = match[1].trim().replace(/^"|"$/g, "");
              fromEmail = match[2].trim();
            }

            const labelIds: string[] = msgData.labelIds || [];
            const isRead = !labelIds.includes("UNREAD");
            const isStarred = labelIds.includes("STARRED");

            return {
              id: item.id,
              threadId: item.threadId,
              snippet: msgData.snippet,
              subject: getH("Subject") || "(Tiada Subjek)",
              from: fromRaw,
              fromName: fromName || fromEmail,
              fromEmail: fromEmail,
              to: getH("To"),
              date: getH("Date"),
              timestamp: msgData.internalDate ? parseInt(msgData.internalDate, 10) : undefined,
              isRead,
              isStarred,
              labelIds
            } as GmailMessageSummary;
          } catch (e) {
            return null;
          }
        })
      );

      setMessages(messageDetails.filter(Boolean) as GmailMessageSummary[]);
    } catch (err: any) {
      const msg = err.message || "Gagal menghubungi pelayan Gmail.";
      if (msg.includes("Gmail API has not been used") || msg.includes("disabled")) {
        console.warn("[Gmail API] Perlu diaktifkan di Google Cloud Console:", msg);
      } else {
        console.error("Gmail Fetch Error:", err);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchMessages();
    }
  }, [token, activeTab]);

  // Load single email detail
  const handleSelectMessage = async (msgSummary: GmailMessageSummary) => {
    if (!token) return;
    setDetailLoading(true);
    setSelectedMessage(msgSummary);
    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Gagal mengambil kandungan mesej.");
      const fullData = await res.json();
      
      const { html, text } = extractBody(fullData.payload);
      
      setSelectedMessage({
        ...msgSummary,
        bodyHtml: html,
        bodyText: text || fullData.snippet || ""
      });

      // Automatically mark as read if it was unread
      if (!msgSummary.isRead) {
        await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}/modify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            removeLabelIds: ["UNREAD"]
          })
        }).catch(console.warn);

        setMessages(prev => prev.map(m => m.id === msgSummary.id ? { ...m, isRead: true } : m));
      }
    } catch (e: any) {
      console.error("Detail error:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  // Toggle Star
  const handleToggleStar = async (msg: GmailMessageSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;

    const newStarred = !msg.isStarred;
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isStarred: newStarred } : m));
    if (selectedMessage?.id === msg.id) {
      setSelectedMessage(prev => prev ? { ...prev, isStarred: newStarred } : null);
    }

    try {
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          addLabelIds: newStarred ? ["STARRED"] : [],
          removeLabelIds: !newStarred ? ["STARRED"] : []
        })
      });
    } catch (err) {
      console.warn("Toggle star error:", err);
    }
  };

  // Delete message to trash (with confirmation dialog)
  const handleDeleteMessage = async (msg: GmailMessageSummary) => {
    if (!token) return;
    
    // Explicit confirmation dialog as mandated by Workspace skill for destructive operations
    const confirmed = window.confirm(
      `Adakah anda pasti mahu memadamkan emel "${msg.subject}" ke Tong Sampah?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/trash`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Gagal memindahkan emel ke tong sampah.");

      setMessages(prev => prev.filter(m => m.id !== msg.id));
      if (selectedMessage?.id === msg.id) {
        setSelectedMessage(null);
      }
      setActionSuccess("Emel berjaya dipindahkan ke Tong Sampah.");
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      alert(`Gagal memadam emel: ${err.message}`);
    }
  };

  // Send new email (RFC 2822 base64url encoded)
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!composeTo.trim()) {
      alert("Sila masukkan alamat emel penerima.");
      return;
    }

    setIsSending(true);
    try {
      const rawEmail = [
        `To: ${composeTo.trim()}`,
        `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(composeSubject || "(Tiada Subjek)")))}?=`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        composeBody
      ].join("\r\n");

      const encoded = base64UrlEncode(rawEmail);

      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ raw: encoded })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Gagal menghantar emel melalui Gmail API.");
      }

      setIsComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setActionSuccess("Emel berjaya dihantar!");
      setTimeout(() => setActionSuccess(null), 4000);
      
      if (activeTab === "SENT") {
        fetchMessages();
      }
    } catch (err: any) {
      console.error("Send email error:", err);
      alert(`Ralat menghantar emel: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateStr?: string, timestamp?: number) => {
    if (timestamp) {
      const d = new Date(timestamp);
      return new Intl.DateTimeFormat("ms-MY", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(d);
    }
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("ms-MY", {
        month: "short",
        day: "numeric"
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex h-full flex-col p-8 bg-slate-50 overflow-hidden">
      {/* Top Bar Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
              <Mail className="h-5 w-5" />
            </div>
            Gmail Workspace
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Peti masuk emel rasmi Google Workspace dengan kebenaran OAuth disahkan
          </p>
        </div>

        <div className="flex items-center gap-3">
          {token && (
            <>
              <button
                onClick={() => {
                  setComposeTo("");
                  setComposeSubject("");
                  setComposeBody("");
                  setIsComposeOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 transition-colors"
              >
                <PenSquare className="h-4 w-4" />
                Tulis Emel
              </button>

              <button
                onClick={fetchMessages}
                disabled={loading}
                title="Muat semula emel"
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-red-600" : ""}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
        {!token ? (
          /* Connect Gmail Card */
          <div className="flex-1 p-8 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
            <div className="h-16 w-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mb-4 shadow-sm">
              <Mail className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Sambungkan Peti Masuk Gmail</h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Aplikasi ini sedia diintegrasikan dengan Google Workspace Gmail API rasmi. Klik butang di bawah untuk memberikan kebenaran membaca dan mengurus emel secara langsung.
            </p>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2 text-left">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleConnectGmail}
              disabled={isConnecting}
              className="mt-6 flex items-center gap-3 px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-semibold text-sm shadow-sm transition-all disabled:opacity-60"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyambungkan ke Google...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Sambungkan Gmail Sekarang
                </>
              )}
            </button>
          </div>
        ) : (
          <>
            {/* Folder Tabs & Search Bar */}
            <div className="border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 bg-slate-50/60">
              <div className="flex items-center gap-1">
                {[
                  { key: "INBOX", label: "Kotak Masuk" },
                  { key: "STARRED", label: "Berbintang" },
                  { key: "SENT", label: "Dihantar" },
                  { key: "TRASH", label: "Tong Sampah" },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key as any);
                      setSelectedMessage(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeTab === tab.key
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchMessages();
                }}
                className="flex items-center gap-2"
              >
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari emel..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-red-500 w-48 sm:w-64"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cari
                </button>
              </form>
            </div>

            {/* Content View: Message Reader OR Message List */}
            {selectedMessage ? (
              /* Detail Email Reader */
              <div className="flex-1 flex flex-col overflow-y-auto p-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Kembali ke senarai
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleToggleStar(selectedMessage, e)}
                      className={`p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors ${
                        selectedMessage.isStarred ? "text-amber-500" : "text-slate-400"
                      }`}
                      title={selectedMessage.isStarred ? "Buang Bintang" : "Bintangkan"}
                    >
                      <Star className="h-4 w-4 fill-current" />
                    </button>
                    <button
                      onClick={() => {
                        setComposeTo(selectedMessage.fromEmail || selectedMessage.from || "");
                        setComposeSubject(`Re: ${selectedMessage.subject || ""}`);
                        setComposeBody(`\n\n--- Pada ${selectedMessage.date}, ${selectedMessage.from} menulis:\n>${selectedMessage.snippet || ""}`);
                        setIsComposeOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Balas
                    </button>
                    <button
                      onClick={() => handleDeleteMessage(selectedMessage)}
                      className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
                      title="Padam ke Tong Sampah"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <h2 className="text-xl font-bold text-slate-900 leading-tight">
                    {selectedMessage.subject}
                  </h2>
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-red-100 text-red-700 font-bold flex items-center justify-center uppercase">
                        {(selectedMessage.fromName || "G")[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">
                          {selectedMessage.fromName}
                        </p>
                        <p className="text-slate-400 text-[11px]">
                          {selectedMessage.fromEmail}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-slate-400">
                      {formatDate(selectedMessage.date, selectedMessage.timestamp)}
                    </span>
                  </div>
                </div>

                <div className="flex-1 mt-6 border-t border-slate-100 pt-6">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-8 w-8 animate-spin text-red-600" />
                    </div>
                  ) : selectedMessage.bodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none text-slate-800 overflow-x-auto leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selectedMessage.bodyHtml }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed">
                      {selectedMessage.bodyText || selectedMessage.snippet}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              /* Message List */
              <div className="flex-1 overflow-y-auto">
                {error ? (
                  <div className="p-8 max-w-xl mx-auto my-8">
                    {error.includes("Gmail API has not been used") || error.includes("disabled") ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                            <AlertCircle className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-slate-900">
                              Pengaktifan Gmail API Diperlukan
                            </h3>
                            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                              Akaun Google anda telah berjaya disahkan, namun perkhidmatan <strong>Gmail API</strong> belum diaktifkan (disabled) pada projek Google Cloud <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px] text-amber-900">746985920657</code>.
                            </p>

                            <div className="mt-4 p-3 bg-white rounded-xl border border-amber-200/80 text-xs text-slate-700">
                              <p className="font-semibold text-slate-800 mb-1">Langkah Mudah:</p>
                              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                                <li>Klik butang <strong>"Buka Google Cloud Console"</strong> di bawah.</li>
                                <li>Tekan butang biru <strong>"ENABLE"</strong> pada halaman konsol Google.</li>
                                <li>Kembali ke sini dan klik butang <strong>"Cuba Semula"</strong>.</li>
                              </ol>
                            </div>

                            <div className="mt-5 flex items-center gap-3 flex-wrap">
                              <a
                                href="https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=746985920657"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-sm transition-all"
                              >
                                <span>Buka Google Cloud Console</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button
                                onClick={fetchMessages}
                                disabled={loading}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-red-600" : ""}`} />
                                <span>Cuba Semula</span>
                              </button>
                              <button
                                onClick={() => {
                                  AuthService.disconnectGmail();
                                  setToken(null);
                                  setError(null);
                                }}
                                className="text-xs text-slate-400 hover:text-slate-600 font-medium px-2 py-1"
                              >
                                Putuskan Sambungan
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
                        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
                        <h3 className="text-sm font-bold text-slate-900">Ralat Memuat Emel</h3>
                        <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">{error}</p>
                        <div className="mt-4 flex items-center justify-center gap-3">
                          <button
                            onClick={fetchMessages}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-xs transition-colors"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                            <span>Cuba Semula</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : loading && messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Loader2 className="h-8 w-8 text-red-600 animate-spin mb-3" />
                    <p className="text-sm font-medium text-slate-600">Mengambil emel dari Gmail...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Inbox className="h-12 w-12 text-slate-300 mb-3" />
                    <h3 className="text-base font-semibold text-slate-800">Tiada emel dijumpai</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Peti masuk anda kosong atau tiada emel sepadan dengan carian ini.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {messages.map(msg => (
                      <li
                        key={msg.id}
                        onClick={() => handleSelectMessage(msg)}
                        className={`px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 cursor-pointer transition-colors ${
                          !msg.isRead ? "bg-red-50/20" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            onClick={(e) => handleToggleStar(msg, e)}
                            className={`p-1 text-slate-300 hover:text-amber-500 transition-colors ${
                              msg.isStarred ? "text-amber-500" : ""
                            }`}
                          >
                            <Star className="h-4 w-4 fill-current" />
                          </button>

                          <div className="w-36 sm:w-48 shrink-0 truncate">
                            <span className={`text-xs truncate ${!msg.isRead ? "font-bold text-slate-900" : "font-medium text-slate-600"}`}>
                              {msg.fromName}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1 truncate">
                            <span className={`text-xs ${!msg.isRead ? "font-bold text-slate-900" : "text-slate-800"}`}>
                              {msg.subject}
                            </span>
                            <span className="text-xs text-slate-400 ml-2 truncate">
                              — {msg.snippet}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-3">
                          <span className="text-[11px] font-mono tabular-nums text-slate-400">
                            {formatDate(msg.date, msg.timestamp)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(msg);
                            }}
                            className="text-slate-300 hover:text-rose-600 p-1 rounded transition-colors"
                            title="Padam"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Compose Email Modal */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <PenSquare className="h-4 w-4 text-red-400" />
                Mesej Baharu (Gmail)
              </h3>
              <button
                onClick={() => setIsComposeOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kepada (Penerima)
                </label>
                <input
                  type="email"
                  required
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="contoh@gmail.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subjek
                </label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subjek emel anda"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kandungan Mesej
                </label>
                <textarea
                  rows={8}
                  required
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Tulis mesej anda di sini..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm transition-colors disabled:opacity-60"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Menghantar...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Hantar Emel
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
