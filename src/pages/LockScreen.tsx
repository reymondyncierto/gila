import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface LockScreenProps {
  onUnlock: () => void;
}

interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      await invoke("unlock_vault", { masterPassword: password });
      onUnlock();
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
      await invoke("biometric_unlock");
      onUnlock();
    } catch (err) {
      setError("Biometric authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50">
      <div className="w-full max-w-sm p-8 rounded-2xl bg-white border border-slate-200 shadow-lg text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center mx-auto mb-4 shadow-md">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Gila is Locked</h1>
        <p className="text-sm text-slate-500 mt-2 mb-6">Enter your master password to unlock</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
              placeholder="Master password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full py-3 rounded-lg bg-sky-500 text-white font-semibold hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {loading ? "Unlocking..." : "Unlock"}
          </button>

          {biometric.available && biometric.enrolled && (
            <button
              type="button"
              onClick={handleBiometric}
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 transition-colors border border-slate-200"
            >
              Unlock with Biometrics
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
