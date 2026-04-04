import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CredentialListItem } from "../types/credentials";

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CredentialListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!q.trim()) {
      setResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await invoke<CredentialListItem[]>("search_credentials", { query: q });
        setResults(res);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  function clearSearch() {
    setQuery("");
    setResults(null);
    setSearching(false);
  }

  return { query, results, searching, search, clearSearch };
}
