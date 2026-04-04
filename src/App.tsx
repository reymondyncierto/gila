import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppLayout from "./components/layout/AppLayout";
import Onboarding from "./pages/Onboarding";
import LockScreen from "./pages/LockScreen";

type AppScreen = "loading" | "onboarding" | "locked" | "main";

interface LockStateResult {
  locked: boolean;
  vault_initialized: boolean;
}

function App() {
  const [screen, setScreen] = useState<AppScreen>("loading");

  useEffect(() => {
    invoke<LockStateResult>("get_lock_state").then((result) => {
      if (!result.vault_initialized) {
        setScreen("onboarding");
      } else if (result.locked) {
        setScreen("locked");
      } else {
        setScreen("main");
      }
    });
  }, []);

  // Periodically check lock state for auto-lock
  useEffect(() => {
    if (screen !== "main") return;

    const interval = setInterval(async () => {
      try {
        const result = await invoke<LockStateResult>("get_lock_state");
        if (result.locked) {
          setScreen("locked");
        }
      } catch {
        // ignore
      }
    }, 10_000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [screen]);

  // Touch activity on user interaction
  useEffect(() => {
    if (screen !== "main") return;

    const touch = () => invoke("touch_activity").catch(() => {});
    window.addEventListener("mousemove", touch, { passive: true });
    window.addEventListener("keydown", touch, { passive: true });

    return () => {
      window.removeEventListener("mousemove", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [screen]);

  if (screen === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-sky-50">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (screen === "onboarding") {
    return <Onboarding onComplete={() => setScreen("main")} />;
  }

  if (screen === "locked") {
    return <LockScreen onUnlock={() => setScreen("main")} />;
  }

  return <AppLayout />;
}

export default App;
