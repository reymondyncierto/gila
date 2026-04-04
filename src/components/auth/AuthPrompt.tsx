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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 rounded-2xl bg-gray-900 border border-white/10">
        <h3 className="text-lg font-bold text-white">Authentication Required</h3>
        <p className="text-sm text-white/50 mt-1 mb-4">
          Enter your master password to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            placeholder="Master password"
            autoFocus
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

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
              disabled={!password || loading}
              className="px-4 py-2 text-sm rounded-lg bg-white/15 text-white font-medium hover:bg-white/20 disabled:opacity-30 transition-colors"
            >
              {loading ? "Verifying..." : "Confirm"}
            </button>
          </div>

          {biometric.available && biometric.enrolled && (
            <button
              type="button"
              onClick={handleBiometric}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-white/5 text-white/60 text-xs hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              Use Biometrics
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
