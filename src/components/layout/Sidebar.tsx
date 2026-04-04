import { useTheme } from "../../hooks/useTheme";

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
  { key: "all", label: "All Items", icon: "\uD83D\uDD10" },
  { key: "login", label: "Logins", icon: "\uD83C\uDF10" },
  { key: "app_password", label: "App Passwords", icon: "\uD83D\uDCF1" },
  { key: "api_key", label: "API Keys", icon: "\uD83D\uDD11" },
  { key: "wifi", label: "Wi-Fi", icon: "\uD83D\uDCF6" },
  { key: "secure_note", label: "Secure Notes", icon: "\uD83D\uDCDD" },
  { key: "favorites", label: "Favorites", icon: "\u2B50" },
];

const themeOptions = [
  { value: "system" as const, label: "Auto" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];

export default function Sidebar({ selected, onSelect }: SidebarProps) {
  const { theme, setTheme } = useTheme();

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

      <div className="p-3 border-t border-white/10">
        <div className="flex rounded-lg bg-white/5 p-0.5">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex-1 py-1 text-xs rounded-md transition-colors ${
                theme === opt.value
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
