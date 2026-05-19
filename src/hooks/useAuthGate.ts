import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AuthCheckResult {
  authorized: boolean;
  reason: string | null;
}

export interface AuthGateOptions {
  sensitive?: boolean;
}

export type AuthGate = (action: () => void, options?: AuthGateOptions) => Promise<void>;

export function useAuthGate() {
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const gate = useCallback<AuthGate>(async (action, options) => {
    try {
      const result = await invoke<AuthCheckResult>("request_auth", {
        sensitive: options?.sensitive ?? false,
      });
      if (result.authorized) {
        action();
      } else {
        setPendingAction(() => action);
        setShowAuthPrompt(true);
      }
    } catch {
      setPendingAction(() => action);
      setShowAuthPrompt(true);
    }
  }, []);

  const onAuthSuccess = useCallback(() => {
    setShowAuthPrompt(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const onAuthCancel = useCallback(() => {
    setShowAuthPrompt(false);
    setPendingAction(null);
  }, []);

  return { showAuthPrompt, gate, onAuthSuccess, onAuthCancel };
}
