interface PasswordStrengthProps {
  password: string;
}

function getStrength(password: string): { level: number; label: string; color: string } {
  if (password.length === 0) return { level: 0, label: "", color: "" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { level: 2, label: "Fair", color: "bg-orange-500" };
  if (score <= 3) return { level: 3, label: "Good", color: "bg-yellow-500" };
  if (score <= 4) return { level: 4, label: "Strong", color: "bg-green-500" };
  return { level: 5, label: "Very Strong", color: "bg-emerald-400" };
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const { level, label, color } = getStrength(password);
  if (level === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= level ? color : "bg-white/10"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}
