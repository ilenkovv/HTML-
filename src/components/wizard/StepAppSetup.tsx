import { Database, Users, Brain, ShieldCheck, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppRuntimeConfig } from "@/types/appConfig";
import { validateAppConfig } from "@/lib/app-config/config";

export function StepAppSetup({ value, onChange, onBack, onNext }: {
  value: AppRuntimeConfig;
  onChange: (value: AppRuntimeConfig) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const errors = validateAppConfig(value);
  const cards = [
    ["database", "База данных", "Хранить рабочие записи приложения", Database],
    ["multiUser", "Несколько пользователей", "Роли, права и приглашения", Users],
    ["ai", "ИИ", "Работа только с разрешёнными данными", Brain],
    ["adminPanel", "Панель администратора", "Пользователи, данные, журнал и дашборд", ShieldCheck],
  ] as const;

  function toggle(key: keyof AppRuntimeConfig["features"], enabled: boolean) {
    onChange({
      ...value,
      features: { ...value.features, [key]: enabled },
      multiUser: key === "multiUser" ? { ...value.multiUser, enabled } : value.multiUser,
      ai: key === "ai" ? { ...value.ai, enabled, collectionEnabled: enabled ? value.ai.collectionEnabled : false } : value.ai,
      admin: key === "adminPanel" ? { ...value.admin, enabled } : value.admin,
    });
  }

  return <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
    <div>
      <h2 className="text-xl font-semibold">Настройка приложения</h2>
      <p className="mt-1 text-sm text-muted-foreground">Выберите только нужные функции. Технические таблицы и права Веб Мастер подготовит сам.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(([key, title, text, Icon]) => <div key={key} className="flex items-start gap-3 rounded-xl border border-border p-4">
        <div className="rounded-lg bg-primary-soft p-2 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><div className="font-medium">{title}</div><div className="mt-1 text-xs text-muted-foreground">{text}</div></div>
        <Switch checked={value.features[key]} onCheckedChange={(checked) => toggle(key, checked)} />
      </div>)}
    </div>

    {value.features.multiUser && <div className="rounded-xl border border-border p-4">
      <div className="font-medium">Доступ пользователей</div>
      <p className="mt-1 text-xs text-muted-foreground">Безопасный вариант по умолчанию — приглашения владельцем.</p>
      <div className="mt-3 max-w-sm">
        <Select value={value.multiUser.registration} onValueChange={(registration) => onChange({ ...value, multiUser: { ...value.multiUser, registration: registration as AppRuntimeConfig["multiUser"]["registration"] } })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="invite_only">Только по приглашению</SelectItem>
            <SelectItem value="admin_created">Создаёт администратор</SelectItem>
            <SelectItem value="open">Открытая регистрация</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{value.roles.map((role) => <div key={role.key} className="rounded-lg bg-muted p-3 text-xs"><div className="font-medium">{role.label}</div><div className="mt-1 text-muted-foreground">{role.permissions.flatMap((rule) => rule.actions).length} прав</div></div>)}</div>
    </div>}

    {value.features.ai && <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="font-medium">База ИИ</div><p className="mt-1 text-xs text-muted-foreground">Сбор данных выключен по умолчанию. Пароли, токены и ключи в набор ИИ не допускаются.</p></div><Switch checked={value.ai.collectionEnabled} onCheckedChange={(collectionEnabled) => onChange({ ...value, ai: { ...value.ai, collectionEnabled } })} /></div>
    </div>}

    {errors.length > 0 && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errors[0]?.message}</div>}

    <div className="flex gap-2 pt-1">
      <Button variant="outline" className="h-11" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Назад</Button>
      <Button className="h-11 flex-1" onClick={onNext} disabled={errors.length > 0}>Продолжить<ArrowRight className="ml-2 h-4 w-4" /></Button>
    </div>
  </div>;
}
