import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PasswordGeneratorProps {
  onUse: (password: string) => void;
  onClose: () => void;
}

export default function PasswordGenerator({ onUse, onClose }: PasswordGeneratorProps) {
  const [mode, setMode] = useState<"character" | "passphrase">("character");
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(false);
  const [wordCount, setWordCount] = useState(4);
  const [separator, setSeparator] = useState("-");
  const [password, setPassword] = useState("");

  const generate = useCallback(async () => {
    try {
      const result = await invoke<string>("generate_password", {
        options: {
          mode,
          length: mode === "character" ? length : undefined,
          uppercase: mode === "character" ? uppercase : undefined,
          lowercase: mode === "character" ? lowercase : undefined,
          digits: mode === "character" ? digits : undefined,
          symbols: mode === "character" ? symbols : undefined,
          word_count: mode === "passphrase" ? wordCount : undefined,
          separator: mode === "passphrase" ? separator : undefined,
        },
      });
      setPassword(result);
    } catch (err) {
      console.error("Generate failed:", err);
    }
  }, [mode, length, uppercase, lowercase, digits, symbols, wordCount, separator]);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <div className="space-y-4 p-4 rounded-xl bg-sky-50 border border-sky-100">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">Password Generator</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-3 rounded-lg bg-white border border-sky-100">
        <p className="text-sm font-mono text-slate-800 break-all">{password}</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("character")}
          className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
            mode === "character" ? "bg-sky-500 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Characters
        </button>
        <button
          onClick={() => setMode("passphrase")}
          className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
            mode === "passphrase" ? "bg-sky-500 text-white" : "bg-white text-slate-500 border border-slate-200"
          }`}
        >
          Passphrase
        </button>
      </div>

      {mode === "character" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500 font-medium">Length</label>
              <span className="text-xs text-sky-600 font-medium">{length}</span>
            </div>
            <input
              type="range"
              min={8}
              max={128}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "A-Z", checked: uppercase, set: setUppercase },
              { label: "a-z", checked: lowercase, set: setLowercase },
              { label: "0-9", checked: digits, set: setDigits },
              { label: "!@#", checked: symbols, set: setSymbols },
            ].map(({ label, checked, set }) => (
              <label key={label} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set(e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500 font-medium">Words</label>
              <span className="text-xs text-sky-600 font-medium">{wordCount}</span>
            </div>
            <input
              type="range"
              min={3}
              max={10}
              value={wordCount}
              onChange={(e) => setWordCount(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">Separator</label>
            <input
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition-all"
              maxLength={3}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={generate}
          className="flex-1 py-2 text-xs rounded-lg bg-white text-slate-600 font-medium hover:bg-slate-50 border border-slate-200 transition-colors"
        >
          Regenerate
        </button>
        <button
          onClick={() => onUse(password)}
          className="flex-1 py-2 text-xs rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors shadow-sm"
        >
          Use Password
        </button>
      </div>
    </div>
  );
}
