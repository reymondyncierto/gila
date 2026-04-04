import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar, { type Category } from "./Sidebar";
import DetailPanel from "./DetailPanel";
import CredentialList from "../credentials/CredentialList";
import CredentialDetail from "../credentials/CredentialDetail";
import CredentialForm from "../forms/CredentialForm";
import DeleteDialog from "../credentials/DeleteDialog";
import { useCredentials } from "../../hooks/useCredentials";
import type { CredentialDetail as CredentialDetailType, CredentialType } from "../../types/credentials";

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

  async function handleEdit() {
    if (!selectedId) return;
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
  }

  function handleDeleteRequest() {
    const cred = credentials.find((c) => c.id === selectedId);
    if (cred) {
      setDeleteTarget({ id: cred.id, name: cred.name });
    }
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
    </div>
  );
}
