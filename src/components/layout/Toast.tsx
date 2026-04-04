import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({ message, duration = 5000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade-out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl bg-white/10 backdrop-blur-xl border border-white/10 shadow-2xl transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg shrink-0">🔐</span>
        <p className="text-sm text-white/80">{message}</p>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="text-white/30 hover:text-white/60 text-xs shrink-0 ml-2"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
