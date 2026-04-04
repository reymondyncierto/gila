import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DeleteDialogProps {
  credentialId: string;
  credentialName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteDialog({
  credentialId,
  credentialName,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await invoke("delete_credential", { id: credentialId });
      onConfirm();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 rounded-2xl bg-gray-900 border border-white/10">
        <h3 className="text-lg font-bold text-white">Delete Credential</h3>
        <p className="text-sm text-white/50 mt-2">
          Are you sure you want to delete <strong className="text-white/80">{credentialName}</strong>?
          This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-30 transition-colors"
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
