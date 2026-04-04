import type { CredentialListItem, CredentialType } from "../../types/credentials";
import { credTypeIcons } from "../../types/credentials";

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
      <div className="p-4 text-white/30 text-sm">Loading credentials...</div>
    );
  }

  if (credentials.length === 0) {
    return (
      <div className="p-8 text-center text-white/30">
        <p className="text-3xl mb-3">📭</p>
        <p className="text-sm">No credentials found</p>
        <p className="text-xs mt-1">Add your first credential to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 p-2">
      {credentials.map((cred) => (
        <button
          key={cred.id}
          onClick={() => onSelect(cred.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
            selectedId === cred.id
              ? "bg-white/15 text-white"
              : "text-white/70 hover:bg-white/8 hover:text-white/90"
          }`}
        >
          <span className="text-lg shrink-0">
            {credTypeIcons[cred.cred_type as CredentialType]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{cred.name}</p>
            <p className="text-xs text-white/40 truncate">
              {cred.cred_type.replace("_", " ")}
            </p>
          </div>
          {cred.favorite && <span className="text-xs shrink-0">⭐</span>}
        </button>
      ))}
    </div>
  );
}
