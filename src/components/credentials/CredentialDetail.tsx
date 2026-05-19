import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AuthGate } from "../../hooks/useAuthGate";
import type { CredentialDetail as CredentialDetailType, CredentialType } from "../../types/credentials";
import { credTypeLabels } from "../../types/credentials";

interface CredentialDetailProps {
  credentialId: string;
  onEdit: () => void;
  onDelete: () => void;
  gate: AuthGate;
}

interface FieldDisplayProps {
  label: string;
  value: string;
  sensitive?: boolean;
  gate: AuthGate;
}

const typeIcons: Record<CredentialType, React.ReactNode> = {
  login: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  ),
  app_password: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  api_key: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  wifi: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
    </svg>
  ),
  secure_note: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
};

function CopyButton({ value, sensitive, gate }: { value: string; sensitive?: boolean; gate: AuthGate }) {
  const [copied, setCopied] = useState(false);

  function copyValue() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleCopy() {
    if (sensitive) {
      void gate(copyValue, { sensitive: true });
      return;
    }

    copyValue();
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1.5 rounded-md text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function FieldDisplay({ label, value, sensitive, gate }: FieldDisplayProps) {
  const [revealed, setRevealed] = useState(false);
  const displayValue = sensitive && !revealed
    ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
    : value;

  function handleReveal() {
    if (!sensitive) {
      return;
    }

    if (revealed) {
      setRevealed(false);
      return;
    }

    void gate(() => setRevealed(true), { sensitive: true });
  }

  return (
    <div className="group px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors">
      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <p
          className="text-[13px] text-slate-700 font-mono flex-1 truncate"
          title={sensitive && !revealed ? undefined : value}
        >
          {displayValue}
        </p>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {sensitive && (
            <button
              onClick={handleReveal}
              className="p-1.5 rounded-md text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors"
              title={revealed ? "Hide" : "Reveal"}
            >
              {revealed ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          )}
          <CopyButton value={value} sensitive={sensitive} gate={gate} />
        </div>
      </div>
    </div>
  );
}

function renderFields(credType: CredentialType, data: Record<string, string>, gate: AuthGate) {
  switch (credType) {
    case "login":
      return (
        <>
          <FieldDisplay label="Service" value={data.service_name || ""} gate={gate} />
          <FieldDisplay label="URL" value={data.url || ""} gate={gate} />
          <FieldDisplay label="Username" value={data.username || ""} gate={gate} />
          <FieldDisplay label="Password" value={data.password || ""} sensitive gate={gate} />
        </>
      );
    case "app_password":
      return (
        <>
          <FieldDisplay label="App Name" value={data.app_name || ""} gate={gate} />
          <FieldDisplay label="Linked Account" value={data.linked_account || ""} gate={gate} />
          <FieldDisplay label="Password" value={data.password || ""} sensitive gate={gate} />
        </>
      );
    case "api_key":
      return (
        <>
          <FieldDisplay label="Service" value={data.service || ""} gate={gate} />
          <FieldDisplay label="Environment" value={data.environment || ""} gate={gate} />
          <FieldDisplay label="Key" value={data.key || ""} sensitive gate={gate} />
          {data.secret && <FieldDisplay label="Secret" value={data.secret} sensitive gate={gate} />}
        </>
      );
    case "wifi":
      return (
        <>
          <FieldDisplay label="SSID" value={data.ssid || ""} gate={gate} />
          <FieldDisplay label="Security Type" value={data.security_type || ""} gate={gate} />
          <FieldDisplay label="Password" value={data.password || ""} sensitive gate={gate} />
        </>
      );
    case "secure_note":
      return (
        <>
          <FieldDisplay label="Title" value={data.title || ""} gate={gate} />
          <FieldDisplay label="Note" value={data.body || ""} sensitive gate={gate} />
        </>
      );
    default:
      return <p className="text-slate-500 text-sm">Unknown credential type</p>;
  }
}

export default function CredentialDetail({ credentialId, onEdit, onDelete, gate }: CredentialDetailProps) {
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
    return <div className="p-8 text-slate-400 text-sm">Loading...</div>;
  }

  if (error || !detail) {
    return <div className="p-8 text-red-500 text-sm">{error || "Not found"}</div>;
  }

  const data = JSON.parse(detail.data) as Record<string, string>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6 pt-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center mx-auto mb-3 text-white shadow-md">
          {typeIcons[detail.cred_type]}
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{detail.name}</h2>
        <p className="text-xs text-slate-400 mt-1">
          {credTypeLabels[detail.cred_type]} · Added{" "}
          {new Date(detail.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-2 mb-5">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] rounded-lg bg-slate-100 text-slate-500 font-medium hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>

      {/* Fields card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {renderFields(detail.cred_type, data, gate)}
      </div>

      <p className="text-[11px] text-slate-300 mt-4 text-center">
        Last modified {new Date(detail.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
