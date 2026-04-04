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
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <p className="text-white/50">Loading...</p>
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
