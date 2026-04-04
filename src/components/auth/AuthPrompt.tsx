import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AuthPromptProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
}

export default function AuthPrompt({ onSuccess, onCancel }: AuthPromptProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometric, setBiometric] = useState<BiometricStatus>({ available: false, enrolled: false });

  useEffect(() => {
    invoke<BiometricStatus>("check_biometric_status").then(setBiometric).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError("");

    try {
      await invoke("confirm_auth", { masterPassword: password });
      onSuccess();
    } catch {
      setError("Incorrect password");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometric() {
    setLoading(true);
    setError("");
    try {
      await invoke("biometric_confirm_auth");
      onSuccess();
    } catch {
      setError("Biometric authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 rounded-2xl bg-white border border-slate-200 shadow-xl">
        <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center mb-4">
          <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Authentication Required</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Enter your master password to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
            placeholder="Master password"
            autoFocus
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password || loading}
              className="px-4 py-2 text-sm rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? "Verifying..." : "Confirm"}
            </button>
          </div>

          {biometric.available && biometric.enrolled && (
            <button
              type="button"
              onClick={handleBiometric}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 transition-colors border border-slate-200"
            >
              Use Biometrics
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
