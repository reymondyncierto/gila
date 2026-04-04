import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar, { type Category } from "./Sidebar";
import DetailPanel from "./DetailPanel";
import CredentialList from "../credentials/CredentialList";
import CredentialDetail from "../credentials/CredentialDetail";
import CredentialForm from "../forms/CredentialForm";
import DeleteDialog from "../credentials/DeleteDialog";
import Toast from "./Toast";
import { useCredentials } from "../../hooks/useCredentials";
import { useSearch } from "../../hooks/useSearch";
import { useAuthGate } from "../../hooks/useAuthGate";
import AuthPrompt from "../auth/AuthPrompt";
import type { CredentialDetail as CredentialDetailType, CredentialType, CredentialListItem } from "../../types/credentials";

type View = "list" | "create" | "edit";

export default function AppLayout() {
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editData, setEditData] = useState<{
    id: string;
    name: string;
    cred_type: CredentialType;
    data: Record<string, string>;
  } | null>(null);
  const { credentials, loading, refresh } = useCredentials(selectedCategory);
  const { showAuthPrompt, gate, onAuthSuccess, onAuthCancel } = useAuthGate();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const credCountRef = useRef<number>(0);

  // Detect new credentials added via browser extension bridge
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const all = await invoke<CredentialListItem[]>("list_credentials", {
          credType: null,
          favoritesOnly: false,
        });
        if (credCountRef.current > 0 && all.length > credCountRef.current) {
          const newest = all[0]; // sorted by updated_at DESC
          setToastMessage(`Credential saved from browser: ${newest.name}`);
          refresh();
        }
        credCountRef.current = all.length;
      } catch {
        // ignore
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [refresh]);
  const { query, results: searchResults, searching, search, clearSearch } = useSearch();
  const displayCredentials = searchResults !== null ? searchResults : credentials;
  const isLoading = searchResults !== null ? searching : loading;

  function handleCreate() {
    setView("create");
    setSelectedId(null);
    setEditData(null);
  }

  function handleFormSuccess() {
    setView("list");
    setSelectedId(null);
    setEditData(null);
    refresh();
  }

  function handleEdit() {
    if (!selectedId) return;
    gate(async () => {
      try {
        const detail = await invoke<CredentialDetailType>("get_credential", { id: selectedId });
        setEditData({
          id: detail.id,
          name: detail.name,
          cred_type: detail.cred_type,
          data: JSON.parse(detail.data),
        });
        setView("edit");
      } catch (err) {
        console.error("Failed to load credential for edit:", err);
      }
    });
  }

  function handleDeleteRequest() {
    const cred = credentials.find((c) => c.id === selectedId);
    if (cred) {
      gate(() => {
        setDeleteTarget({ id: cred.id, name: cred.name });
      });
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar selected={selectedCategory} onSelect={(cat) => {
        setSelectedCategory(cat);
        setSelectedId(null);
        setView("list");
      }} />
      <div className="w-72 h-full border-r border-slate-200 bg-white flex flex-col">
        <div className="p-3 space-y-2 border-b border-slate-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
            />
            {query && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleCreate}
            className="w-full py-2 text-sm rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 active:bg-sky-700 transition-colors shadow-sm"
          >
            + Add Credential
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CredentialList
            credentials={displayCredentials}
            loading={isLoading}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setView("list");
            }}
          />
        </div>
      </div>
      <DetailPanel>
        {view === "create" && (
          <CredentialForm
            mode="create"
            onSuccess={handleFormSuccess}
            onCancel={() => setView("list")}
          />
        )}
        {view === "edit" && editData && (
          <CredentialForm
            mode="edit"
            editId={editData.id}
            initialType={editData.cred_type}
            initialName={editData.name}
            initialData={editData.data}
            onSuccess={handleFormSuccess}
            onCancel={() => setView("list")}
          />
        )}
        {view === "list" && selectedId && (
          <CredentialDetail
            credentialId={selectedId}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
          />
        )}
      </DetailPanel>

      {showAuthPrompt && (
        <AuthPrompt onSuccess={onAuthSuccess} onCancel={onAuthCancel} />
      )}

      {deleteTarget && (
        <DeleteDialog
          credentialId={deleteTarget.id}
          credentialName={deleteTarget.name}
          onConfirm={() => {
            setDeleteTarget(null);
            setSelectedId(null);
            refresh();
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}
