import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import PasswordStrength from "../components/onboarding/PasswordStrength";

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password === confirm;
  const isValid = password.length >= 8 && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError("");

    try {
      await invoke("initialize_vault", { masterPassword: password });
      onComplete();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Welcome to Gila</h1>
          <p className="text-white/50 mt-2">Create your master password to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">
              Master Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
                placeholder="Enter master password"
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
            <PasswordStrength password={password} />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">
              Confirm Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg bg-white/5 border text-white placeholder-white/30 focus:outline-none transition-colors ${
                confirm.length > 0 && !passwordsMatch
                  ? "border-red-500/50"
                  : "border-white/10 focus:border-white/30"
              }`}
              placeholder="Confirm master password"
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-400">Passwords do not match</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full py-3 rounded-lg bg-white/15 text-white font-medium hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Setting up vault..." : "Create Vault"}
          </button>

          <p className="text-xs text-white/30 text-center">
            Minimum 8 characters. This password cannot be recovered.
          </p>
        </form>
      </div>
    </div>
  );
}
