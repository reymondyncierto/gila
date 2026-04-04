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
    <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Password Generator</h3>
        <button
          onClick={onClose}
          className="text-xs text-white/40 hover:text-white/60"
        >
          Close
        </button>
      </div>

      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
        <p className="text-sm font-mono text-white break-all">{password}</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setMode("character")}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
            mode === "character" ? "bg-white/15 text-white" : "bg-white/5 text-white/50"
          }`}
        >
          Characters
        </button>
        <button
          onClick={() => setMode("passphrase")}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
            mode === "passphrase" ? "bg-white/15 text-white" : "bg-white/5 text-white/50"
          }`}
        >
          Passphrase
        </button>
      </div>

      {mode === "character" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-white/40">Length</label>
              <span className="text-xs text-white/60">{length}</span>
            </div>
            <input
              type="range"
              min={8}
              max={128}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full accent-white/50"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "A-Z", checked: uppercase, set: setUppercase },
              { label: "a-z", checked: lowercase, set: setLowercase },
              { label: "0-9", checked: digits, set: setDigits },
              { label: "!@#", checked: symbols, set: setSymbols },
            ].map(({ label, checked, set }) => (
              <label key={label} className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set(e.target.checked)}
                  className="accent-white/50"
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
              <label className="text-xs text-white/40">Words</label>
              <span className="text-xs text-white/60">{wordCount}</span>
            </div>
            <input
              type="range"
              min={3}
              max={10}
              value={wordCount}
              onChange={(e) => setWordCount(Number(e.target.value))}
              className="w-full accent-white/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-white/40">Separator</label>
            <input
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none"
              maxLength={3}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={generate}
          className="flex-1 py-2 text-xs rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
        >
          Regenerate
        </button>
        <button
          onClick={() => onUse(password)}
          className="flex-1 py-2 text-xs rounded-lg bg-white/15 text-white font-medium hover:bg-white/20 transition-colors"
        >
          Use Password
        </button>
      </div>
    </div>
  );
}
