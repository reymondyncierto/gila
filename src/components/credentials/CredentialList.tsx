import type { CredentialListItem, CredentialType } from "../../types/credentials";
import { extractDomain, extractEmail } from "../../types/credentials";

const credTypeIcons: Record<CredentialType, React.ReactNode> = {
  login: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  ),
  app_password: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  api_key: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  wifi: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
    </svg>
  ),
  secure_note: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
};

interface CredentialListProps {
  credentials: CredentialListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function CredentialList({
  credentials,
  loading,
  selectedId,
  onSelect,
}: CredentialListProps) {
  if (loading) {
    return (
      <div className="p-4 text-slate-400 text-sm">Loading credentials...</div>
    );
  }

  if (credentials.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 font-medium">No credentials found</p>
        <p className="text-xs mt-1 text-slate-400">Add your first credential to get started</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-0.5">
      {credentials.map((cred) => {
        const domain = extractDomain(cred.search_index);
        const email = extractEmail(cred.search_index);
        const displayName = domain || cred.name;
        const subtitle = email || cred.cred_type.replace("_", " ");

        return (
          <button
            key={cred.id}
            onClick={() => onSelect(cred.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
              selectedId === cred.id
                ? "bg-sky-50 text-sky-700"
                : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              selectedId === cred.id
                ? "bg-sky-100 text-sky-500"
                : "bg-slate-100 text-slate-400"
            }`}>
              {credTypeIcons[cred.cred_type as CredentialType]}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium truncate ${
                selectedId === cred.id ? "text-sky-700" : "text-slate-700"
              }`}>{displayName}</p>
              <p className={`text-xs truncate ${
                selectedId === cred.id ? "text-sky-400" : "text-slate-400"
              }`}>{subtitle}</p>
            </div>
            {cred.favorite && (
              <svg className={`w-3.5 h-3.5 shrink-0 ${
                selectedId === cred.id ? "text-sky-400" : "text-amber-400"
              }`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
