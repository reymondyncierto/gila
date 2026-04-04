import { useState } from "react";
import Sidebar, { type Category } from "./Sidebar";
import DetailPanel from "./DetailPanel";
import CredentialList from "../credentials/CredentialList";
import { useCredentials } from "../../hooks/useCredentials";

export default function AppLayout() {
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { credentials, loading } = useCredentials(selectedCategory);

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <Sidebar selected={selectedCategory} onSelect={(cat) => {
        setSelectedCategory(cat);
        setSelectedId(null);
      }} />
      <div className="w-72 h-full border-r border-white/10 bg-white/[0.02] overflow-y-auto">
        <CredentialList
          credentials={credentials}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <DetailPanel />
    </div>
  );
}
