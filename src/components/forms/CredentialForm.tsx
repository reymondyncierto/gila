import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CredentialType } from "../../types/credentials";
import { credTypeLabels } from "../../types/credentials";
import PasswordGenerator from "../generator/PasswordGenerator";

interface CredentialFormProps {
  mode: "create" | "edit";
  initialType?: CredentialType;
  initialName?: string;
  initialData?: Record<string, string>;
  editId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const credentialTypes: CredentialType[] = [
  "login",
  "app_password",
  "api_key",
  "wifi",
  "secure_note",
];

interface FieldConfig {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}

const fieldsByType: Record<CredentialType, FieldConfig[]> = {
  login: [
    { key: "service_name", label: "Service Name", required: true, placeholder: "e.g., Gmail" },
    { key: "url", label: "URL", placeholder: "https://..." },
    { key: "username", label: "Username / Email", required: true },
    { key: "password", label: "Password", type: "password", required: true },
  ],
  app_password: [
    { key: "app_name", label: "App Name", required: true, placeholder: "e.g., Slack" },
    { key: "password", label: "Generated Password", type: "password", required: true },
    { key: "linked_account", label: "Linked Account", placeholder: "e.g., user@example.com" },
  ],
  api_key: [
    { key: "service", label: "Service", required: true, placeholder: "e.g., Stripe" },
    { key: "key", label: "API Key", type: "password", required: true },
    { key: "secret", label: "Secret (optional)", type: "password" },
    { key: "environment", label: "Environment", placeholder: "e.g., production" },
  ],
  wifi: [
    { key: "ssid", label: "Network Name (SSID)", required: true },
    { key: "password", label: "Password", type: "password", required: true },
    { key: "security_type", label: "Security Type", placeholder: "WPA2, WPA3, etc." },
  ],
  secure_note: [
    { key: "title", label: "Title", required: true },
    { key: "body", label: "Note Content", required: true },
  ],
};

export default function CredentialForm({
  mode,
  initialType,
  initialName,
  initialData,
  editId,
  onSuccess,
  onCancel,
}: CredentialFormProps) {
  const [credType, setCredType] = useState<CredentialType>(initialType || "login");
  const [name, setName] = useState(initialName || "");
  const [fields, setFields] = useState<Record<string, string>>(initialData || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatorTarget, setGeneratorTarget] = useState<string | null>(null);

  const currentFields = fieldsByType[credType];

  function updateField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function buildSearchIndex(): string {
    const parts = [name];
    for (const f of currentFields) {
      if (f.type !== "password" && fields[f.key]) {
        parts.push(fields[f.key]);
      }
    }
    return parts.join(" ").toLowerCase();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate required fields
    for (const f of currentFields) {
      if (f.required && !fields[f.key]?.trim()) {
        setError(`${f.label} is required`);
        return;
      }
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = JSON.stringify(fields);
      const searchIndex = buildSearchIndex();

      if (mode === "create") {
        await invoke("create_credential", {
          input: { cred_type: credType, name, search_index: searchIndex, data },
        });
      } else {
        await invoke("update_credential", {
          input: { id: editId, name, search_index: searchIndex, data },
        });
      }
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-xl font-bold text-white mb-6">
        {mode === "create" ? "New Credential" : "Edit Credential"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {mode === "create" && (
          <div className="space-y-2">
            <label className="block text-xs text-white/40 uppercase tracking-wider">
              Type
            </label>
            <div className="flex flex-wrap gap-2">
              {credentialTypes.map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => {
                    setCredType(ct);
                    setFields({});
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    credType === ct
                      ? "bg-white/15 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {credTypeLabels[ct]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-xs text-white/40 uppercase tracking-wider">
            Display Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            placeholder="e.g., Personal Gmail"
            required
          />
        </div>

        <div className="space-y-4 bg-white/5 rounded-xl p-5 border border-white/10">
          {currentFields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="block text-xs text-white/40 uppercase tracking-wider">
                {f.label}
              </label>
              {f.key === "body" ? (
                <textarea
                  value={fields[f.key] || ""}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors min-h-[120px] resize-y"
                  placeholder={f.placeholder}
                  required={f.required}
                />
              ) : (
                <div className="flex gap-2">
                  <input
                    type={f.type || "text"}
                    value={fields[f.key] || ""}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
                    placeholder={f.placeholder}
                    required={f.required}
                  />
                  {f.type === "password" && (
                    <button
                      type="button"
                      onClick={() => setGeneratorTarget(generatorTarget === f.key ? null : f.key)}
                      className="px-3 py-2.5 text-xs rounded-lg bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 transition-colors shrink-0"
                    >
                      Gen
                    </button>
                  )}
                </div>
              )}
              {generatorTarget === f.key && (
                <PasswordGenerator
                  onUse={(pw) => {
                    updateField(f.key, pw);
                    setGeneratorTarget(null);
                  }}
                  onClose={() => setGeneratorTarget(null)}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-white/15 text-white font-medium hover:bg-white/20 disabled:opacity-30 transition-colors"
          >
            {loading ? "Saving..." : mode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
