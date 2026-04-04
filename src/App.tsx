import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppLayout from "./components/layout/AppLayout";
import Onboarding from "./pages/Onboarding";

type AppScreen = "loading" | "onboarding" | "main";

function App() {
  const [screen, setScreen] = useState<AppScreen>("loading");

  useEffect(() => {
    invoke<boolean>("is_vault_setup").then((isSetup) => {
      setScreen(isSetup ? "main" : "onboarding");
    });
  }, []);

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

  return <AppLayout />;
}

export default App;
