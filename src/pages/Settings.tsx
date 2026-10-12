import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";
import { apiFetch } from "../lib/api";
export default function Settings() {
  const { user } = useAuth();
  const { lockVault } = useCrypto();
  const [status, setStatus] = useState<{ telegram?: boolean; lark?: boolean }>(
    {},
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch("/api/telegram/status").then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
      apiFetch("/api/lark/health").then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
    ])
      .then(([tg, lark]) => {
        if (active)
          setStatus({ telegram: tg.configured, lark: lark.configured });
      })
      .catch(() => {
        if (active) setError("Unable to check storage configuration.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR PREFERENCES</p>
          <h1>Settings</h1>
        </div>
      </div>
      <div className="max-w-3xl space-y-5">
        <div className="record-card">
          <h2 className="font-semibold">Account</h2>
          <p className="mt-3 text-sm break-all">{user?.email}</p>
          <p className="subtitle">
            Only your own mailbox and files are available in this session.
          </p>
        </div>
        <div className="record-card">
          <h2 className="font-semibold">Vault security</h2>
          <p className="subtitle">
            Your key stays in session memory. The vault locks after 15 minutes
            without interaction.
          </p>
          <p className="subtitle">
            Keep your original passphrase safe. It is needed to open your
            encrypted data.
          </p>
          <button className="secondary-button mt-4" onClick={lockVault}>
            Lock vault now
          </button>
        </div>
        <div className="record-card">
          <h2 className="font-semibold">Storage</h2>
          {error && <p className="error-banner mt-3">{error}</p>}
          <p className="mt-4 text-sm">
            Telegram:{" "}
            {status.telegram === undefined
              ? "Checking…"
              : status.telegram
                ? "Connected"
                : "Unavailable"}
          </p>
          <p className="mt-3 text-sm">
            Lark:{" "}
            {status.lark === undefined
              ? "Checking…"
              : status.lark
                ? "Configured"
                : "Unavailable"}
          </p>
          <p className="subtitle">
            Files up to 2 MiB can be uploaded through this workspace.
            Connections are managed by the workspace owner.
          </p>
        </div>
      </div>
    </section>
  );
}
