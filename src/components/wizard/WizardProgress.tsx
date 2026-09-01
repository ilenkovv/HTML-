import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const WIZARD_STEPS = [
  "Файл",
  "Пользователь",
  "Загрузка",
  "Проверка кода",
  "Настройка",
  "Размещение",
  "Готово",
] as const;

export function WizardProgress({ current }: { current: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-medium text-foreground">
          Шаг {current} из {WIZARD_STEPS.length}: {WIZARD_STEPS[current - 1]}
        </p>
        <p className="text-xs text-muted-foreground">
          {Math.round((current / WIZARD_STEPS.length) * 100)}%
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(current / WIZARD_STEPS.length) * 100}%` }} />
      </div>
      <ol className="mt-4 hidden grid-cols-7 gap-2 sm:grid">
        {WIZARD_STEPS.map((label, i) => {
          const index = i + 1;
          const done = index < current;
          const active = index === current;
          return <li key={label} className="flex flex-col items-center gap-1 text-center">
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold", done && "border-success bg-success text-success-foreground", active && "border-primary bg-primary text-primary-foreground", !done && !active && "border-border bg-background text-muted-foreground")}>{done ? <Check className="h-4 w-4" /> : index}</span>
            <span className={cn("text-[11px] leading-tight", active ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
          </li>;
        })}
      </ol>
    </div>
  );
}
