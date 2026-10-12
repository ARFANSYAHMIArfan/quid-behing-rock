import { apiFetch } from '../lib/api';
import { useState, useEffect } from "react";
import { Inbox, Mail, Loader2, AlertCircle, Calendar } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface LarkEmail {
  message_id?: string;
  id?: string;
  subject: string;
  from: {
    mail_address: string;
    name: string;
  };
  to: any[];
  create_timestamp: string;
  is_read: boolean;
  system_labels: string[];
}

export default function MailInbox() {
  const { user } = useAuth();
  const [larkEmail, setLarkEmail] = useState("");
  const [emails, setEmails] = useState<LarkEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email) {
      setLarkEmail(user.email);
    }
  }, [user]);

  const fetchEmails = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!larkEmail) return;
    
    setLoading(true);
    setError(null);
    try {
      // In development, the proxy is at same origin /api/lark/emails
      const response = await apiFetch("/api/lark/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: larkEmail }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to fetch emails");
      }
      
      setEmails(data.emails || []);
    } catch (err: any) {
      console.error("Mail Inbox Error:", err);
      setError(err.message || "An unexpected error occurred connecting to Lark.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (larkEmail && emails.length === 0 && !error) {
      fetchEmails();
    }
  }, [larkEmail]);

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return "";
    const parsed = parseInt(timestamp);
    if (isNaN(parsed)) return "";
    const d = new Date(parsed);
    try {
      return new Intl.DateTimeFormat("en-MY", { 
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" 
      }).format(d);
    } catch (e) {
      return "";
    }
  };

  return (
    <div className="flex h-full flex-col p-8 bg-slate-50">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Inbox className="h-6 w-6 text-rose-600" />
          Lark Mail
        </h1>
        <form onSubmit={fetchEmails} className="flex items-center gap-2">
          <input 
            type="email" 
            value={larkEmail}
            readOnly
            aria-label="Your signed-in mailbox"
            placeholder="Your Lark Email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
          />
          <button 
            type="submit"
            disabled={loading || !larkEmail}
            className="flex items-center gap-2 rounded-md bg-white border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <Mail className="h-4 w-4 text-slate-500" />}
            {loading ? "Syncing..." : "Sync"}
          </button>
        </form>
      </div>

      <div className="flex-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
        {error ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center bg-rose-50">
            <AlertCircle className="h-12 w-12 text-rose-400 mb-4" />
            <h3 className="text-lg font-medium text-rose-900">Lark Connection Error</h3>
            <p className="text-rose-700 mt-2 max-w-md text-sm">{error}</p>
            <p className="text-rose-600 mt-4 text-xs font-medium">
              Make sure your email ({larkEmail}) has a valid Lark mailbox and the App Permissions are configured correctly in the Lark Developer Console.
            </p>
            <button 
              onClick={fetchEmails} 
              className="mt-6 bg-rose-600 text-white px-4 py-2 rounded-md hover:bg-rose-700 text-sm font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : loading && emails.length === 0 ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-slate-700">Connecting to Lark Workspace...</h3>
            <p className="text-slate-500 mt-1 text-sm">Fetching your latest emails securely.</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
            <Inbox className="h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">Your inbox is empty</h3>
            <p className="text-slate-500 mt-1 max-w-sm text-sm">
              No recent emails found in {user?.email}'s Lark mailbox.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {emails.map((email, index) => (
              <li 
                key={email.message_id || email.id || `email-${index}`} 
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors ${email.is_read ? 'opacity-70' : 'bg-blue-50/30'}`}
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${email.is_read ? 'bg-transparent' : 'bg-blue-600'}`} />
                  <div className="flex-1 min-w-0 pr-4">
                    <p className={`text-sm truncate ${email.is_read ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>
                      {email.from?.name || email.from?.mail_address || "Unknown Sender"}
                    </p>
                    <p className={`text-sm truncate ${email.is_read ? 'text-slate-500' : 'font-semibold text-slate-800'}`}>
                      {email.subject || "(No Subject)"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:mt-0 flex items-center gap-2 text-xs text-slate-400 flex-shrink-0 ml-6 sm:ml-0">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(email.create_timestamp)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

