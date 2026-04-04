import { useState } from "react";
import Sidebar, { type Category } from "./Sidebar";
import DetailPanel from "./DetailPanel";

interface AppLayoutProps {
  children?: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <Sidebar selected={selectedCategory} onSelect={setSelectedCategory} />
      <DetailPanel>{children}</DetailPanel>
    </div>
  );
}
