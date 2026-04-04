import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AuthCheckResult {
  authorized: boolean;
  reason: string | null;
}

export function useAuthGate() {
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const gate = useCallback(async (action: () => void) => {
    try {
      const result = await invoke<AuthCheckResult>("request_auth");
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
