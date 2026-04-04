import { useState } from "react";
import Sidebar, { type Category } from "./Sidebar";
import DetailPanel from "./DetailPanel";
import CredentialList from "../credentials/CredentialList";
import CredentialDetail from "../credentials/CredentialDetail";
import CredentialForm from "../forms/CredentialForm";
import { useCredentials } from "../../hooks/useCredentials";

type View = "list" | "create" | "edit";

export default function AppLayout() {
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const { credentials, loading, refresh } = useCredentials(selectedCategory);

  function handleCreate() {
    setView("create");
    setSelectedId(null);
  }

  function handleFormSuccess() {
    setView("list");
    setSelectedId(null);
    refresh();
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <Sidebar selected={selectedCategory} onSelect={(cat) => {
        setSelectedCategory(cat);
        setSelectedId(null);
        setView("list");
      }} />
      <div className="w-72 h-full border-r border-white/10 bg-white/[0.02] flex flex-col">
        <div className="p-3 border-b border-white/10">
          <button
            onClick={handleCreate}
            className="w-full py-2 text-sm rounded-lg bg-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-colors"
          >
            + Add Credential
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CredentialList
            credentials={credentials}
            loading={loading}
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
        {view === "list" && selectedId && (
          <CredentialDetail
            credentialId={selectedId}
            onEdit={() => setView("edit")}
            onDelete={async () => {
              setSelectedId(null);
              refresh();
            }}
          />
        )}
      </DetailPanel>
    </div>
  );
}
