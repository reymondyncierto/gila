import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CredentialListItem } from "../types/credentials";
import type { Category } from "../components/layout/Sidebar";

export function useCredentials(category: Category) {
  const [credentials, setCredentials] = useState<CredentialListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const credType = category === "all" || category === "favorites" ? null : category;
      const favoritesOnly = category === "favorites";
      const result = await invoke<CredentialListItem[]>("list_credentials", {
        credType,
        favoritesOnly,
      });
      setCredentials(result);
    } catch (err) {
      console.error("Failed to list credentials:", err);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { credentials, loading, refresh };
}
