export type Category =
  | "all"
  | "login"
  | "app_password"
  | "api_key"
  | "wifi"
  | "secure_note"
  | "favorites";

interface SidebarProps {
  selected: Category;
  onSelect: (category: Category) => void;
}

const categories: { key: Category; label: string; icon: string }[] = [
  { key: "all", label: "All Items", icon: "🔐" },
  { key: "login", label: "Logins", icon: "🌐" },
  { key: "app_password", label: "App Passwords", icon: "📱" },
  { key: "api_key", label: "API Keys", icon: "🔑" },
  { key: "wifi", label: "Wi-Fi", icon: "📶" },
  { key: "secure_note", label: "Secure Notes", icon: "📝" },
  { key: "favorites", label: "Favorites", icon: "⭐" },
];

export default function Sidebar({ selected, onSelect }: SidebarProps) {
  return (
    <aside className="w-64 h-full flex flex-col border-r border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="p-6 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight">Gila</h1>
        <p className="text-xs text-white/40 mt-0.5">The Apex Vault</p>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => onSelect(cat.key)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
              ${
                selected === cat.key
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/60 hover:bg-white/8 hover:text-white/80"
              }`}
          >
            <span className="text-base">{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
