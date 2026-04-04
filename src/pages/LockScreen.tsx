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
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="w-full max-w-sm p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-center">
        <p className="text-5xl mb-4">🔒</p>
        <h1 className="text-2xl font-bold text-white">Gila is Locked</h1>
        <p className="text-sm text-white/40 mt-2 mb-6">Enter your master password to unlock</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              placeholder="Master password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 text-sm"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full py-3 rounded-lg bg-white/15 text-white font-medium hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Unlocking..." : "Unlock"}
          </button>

          {biometric.available && biometric.enrolled && (
            <button
              type="button"
              onClick={handleBiometric}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              Unlock with Biometrics
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
