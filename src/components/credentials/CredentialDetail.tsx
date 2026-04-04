import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CredentialDetail as CredentialDetailType, CredentialType } from "../../types/credentials";
import { credTypeLabels } from "../../types/credentials";

interface CredentialDetailProps {
  credentialId: string;
  onEdit: () => void;
  onDelete: () => void;
}

interface FieldDisplayProps {
  label: string;
  value: string;
  sensitive?: boolean;
}

function FieldDisplay({ label, value, sensitive }: FieldDisplayProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-1">
      <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-sm text-white/90 font-mono flex-1 break-all">
          {sensitive && !revealed ? "\u2022".repeat(Math.min(value.length, 16)) : value}
        </p>
        {sensitive && (
          <button
            onClick={() => setRevealed(!revealed)}
            className="text-xs text-white/40 hover:text-white/70 shrink-0 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
          >
            {revealed ? "Hide" : "Reveal"}
          </button>
        )}
        <button
          onClick={() => navigator.clipboard.writeText(value)}
          className="text-xs text-white/40 hover:text-white/70 shrink-0 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function renderFields(credType: CredentialType, data: Record<string, string>) {
  switch (credType) {
    case "login":
      return (
        <>
          <FieldDisplay label="Service" value={data.service_name || ""} />
          <FieldDisplay label="URL" value={data.url || ""} />
          <FieldDisplay label="Username" value={data.username || ""} />
          <FieldDisplay label="Password" value={data.password || ""} sensitive />
        </>
      );
    case "app_password":
      return (
        <>
          <FieldDisplay label="App Name" value={data.app_name || ""} />
          <FieldDisplay label="Linked Account" value={data.linked_account || ""} />
          <FieldDisplay label="Password" value={data.password || ""} sensitive />
        </>
      );
    case "api_key":
      return (
        <>
          <FieldDisplay label="Service" value={data.service || ""} />
          <FieldDisplay label="Environment" value={data.environment || ""} />
          <FieldDisplay label="Key" value={data.key || ""} sensitive />
          {data.secret && <FieldDisplay label="Secret" value={data.secret} sensitive />}
        </>
      );
    case "wifi":
      return (
        <>
          <FieldDisplay label="SSID" value={data.ssid || ""} />
          <FieldDisplay label="Security Type" value={data.security_type || ""} />
          <FieldDisplay label="Password" value={data.password || ""} sensitive />
        </>
      );
    case "secure_note":
      return (
        <>
          <FieldDisplay label="Title" value={data.title || ""} />
          <FieldDisplay label="Note" value={data.body || ""} sensitive />
        </>
      );
    default:
      return <p className="text-white/50 text-sm">Unknown credential type</p>;
  }
}

export default function CredentialDetail({ credentialId, onEdit, onDelete }: CredentialDetailProps) {
  const [detail, setDetail] = useState<CredentialDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    invoke<CredentialDetailType>("get_credential", { id: credentialId })
      .then(setDetail)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [credentialId]);

  if (loading) {
    return <div className="p-8 text-white/30 text-sm">Loading...</div>;
  }

  if (error || !detail) {
    return <div className="p-8 text-red-400 text-sm">{error || "Not found"}</div>;
  }

  const data = JSON.parse(detail.data) as Record<string, string>;

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{detail.name}</h2>
          <p className="text-sm text-white/40 mt-1">
            {credTypeLabels[detail.cred_type]} · Added{" "}
            {new Date(detail.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="space-y-5 bg-white/5 rounded-xl p-6 border border-white/10">
        {renderFields(detail.cred_type, data)}
      </div>

      <p className="text-xs text-white/20 mt-4">
        Last modified {new Date(detail.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
