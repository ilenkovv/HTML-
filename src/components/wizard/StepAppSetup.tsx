import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Database,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  AiFieldAccess,
  AppEntityConfig,
  AppFieldConfig,
  AppRelationConfig,
  AppRoleConfig,
  AppRuntimeConfig,
  FieldDataType,
  PermissionAction,
  RelationKind,
} from "@/types/appConfig";
import { validateAppConfig } from "@/lib/app-config/config";

const FIELD_TYPES: Array<{ value: FieldDataType; label: string }> = [
  { value: "text", label: "Текст" },
  { value: "number", label: "Число" },
  { value: "boolean", label: "Да/нет" },
  { value: "date", label: "Дата" },
  { value: "datetime", label: "Дата и время" },
  { value: "select", label: "Список" },
  { value: "file", label: "Файл" },
  { value: "user", label: "Пользователь" },
  { value: "status", label: "Статус" },
  { value: "json", label: "Структура данных" },
];

const AI_ACCESS: Array<{ value: AiFieldAccess; label: string }> = [
  { value: "none", label: "ИИ не видит" },
  { value: "read", label: "ИИ читает" },
  { value: "write", label: "ИИ записывает" },
  { value: "read_write", label: "ИИ читает и записывает" },
];

const PERMISSIONS: Array<{ value: PermissionAction; label: string }> = [
  { value: "view", label: "Просмотр" },
  { value: "create", label: "Создание" },
  { value: "update", label: "Изменение" },
  { value: "delete", label: "Удаление" },
  { value: "export", label: "Выгрузка" },
  { value: "manage_users", label: "Пользователи" },
  { value: "manage_settings", label: "Настройки" },
  { value: "use_ai", label: "ИИ" },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function slugKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/giu, "_")
    .replace(/^_+|_+$/gu, "") || "field";
}

function newField(index: number): AppFieldConfig {
  return {
    id: makeId("field"),
    key: `field_${index}`,
    label: `Поле ${index}`,
    type: "text",
    required: false,
    unique: false,
    userOwned: false,
    aiAccess: "none",
    sensitive: false,
    source: "manual",
  };
}

function newEntity(index: number): AppEntityConfig {
  return {
    id: makeId("entity"),
    key: `table_${index}`,
    label: `Таблица ${index}`,
    pluralLabel: `Таблица ${index}`,
    fields: [newField(1)],
  };
}

function replaceEntity(config: AppRuntimeConfig, next: AppEntityConfig): AppRuntimeConfig {
  return {
    ...config,
    entities: config.entities.map((entity) => entity.id === next.id ? next : entity),
    updatedAt: new Date().toISOString(),
  };
}

function roleActions(role: AppRoleConfig): PermissionAction[] {
  return role.permissions.find((rule) => rule.entityId === "*")?.actions ?? [];
}

function setRoleAction(role: AppRoleConfig, action: PermissionAction, enabled: boolean): AppRoleConfig {
  const wildcard = role.permissions.find((rule) => rule.entityId === "*") ?? { entityId: "*" as const, actions: [] };
  const actions = new Set(wildcard.actions);
  if (enabled) actions.add(action); else actions.delete(action);
  return {
    ...role,
    permissions: [
      { entityId: "*", actions: Array.from(actions) },
      ...role.permissions.filter((rule) => rule.entityId !== "*"),
    ],
  };
}

export function StepAppSetup({ value, onChange, onBack, onNext }: {
  value: AppRuntimeConfig;
  onChange: (value: AppRuntimeConfig) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const errors = validateAppConfig(value);
  const [relationFrom, setRelationFrom] = useState("");
  const [relationTo, setRelationTo] = useState("");
  const [relationKind, setRelationKind] = useState<RelationKind>("one_to_many");
  const [relationLabel, setRelationLabel] = useState("");

  const cards = [
    ["database", "База данных", "Хранить рабочие записи приложения", Database],
    ["multiUser", "Несколько пользователей", "Роли, права и приглашения", Users],
    ["ai", "ИИ", "Работа только с разрешёнными данными", Brain],
    ["adminPanel", "Панель администратора", "Пользователи, данные, журнал и дашборд", ShieldCheck],
  ] as const;

  const entityNames = useMemo(
    () => new Map(value.entities.map((entity) => [entity.id, entity.pluralLabel || entity.label])),
    [value.entities],
  );

  function toggle(key: keyof AppRuntimeConfig["features"], enabled: boolean) {
    onChange({
      ...value,
      features: { ...value.features, [key]: enabled },
      multiUser: key === "multiUser" ? { ...value.multiUser, enabled } : value.multiUser,
      ai: key === "ai" ? { ...value.ai, enabled, collectionEnabled: enabled ? value.ai.collectionEnabled : false } : value.ai,
      admin: key === "adminPanel" ? { ...value.admin, enabled } : value.admin,
      updatedAt: new Date().toISOString(),
    });
  }

  function addEntity() {
    onChange({
      ...value,
      features: { ...value.features, database: true },
      entities: [...value.entities, newEntity(value.entities.length + 1)],
      updatedAt: new Date().toISOString(),
    });
  }

  function removeEntity(entityId: string) {
    onChange({
      ...value,
      entities: value.entities.filter((entity) => entity.id !== entityId),
      relations: value.relations.filter((relation) => relation.fromEntityId !== entityId && relation.toEntityId !== entityId),
      updatedAt: new Date().toISOString(),
    });
  }

  function addRelation() {
    if (!relationFrom || !relationTo || relationFrom === relationTo) return;
    const relation: AppRelationConfig = {
      id: makeId("relation"),
      fromEntityId: relationFrom,
      toEntityId: relationTo,
      kind: relationKind,
      label: relationLabel.trim() || `${entityNames.get(relationFrom) ?? "Запись"} → ${entityNames.get(relationTo) ?? "Запись"}`,
    };
    onChange({ ...value, relations: [...value.relations, relation], updatedAt: new Date().toISOString() });
    setRelationLabel("");
  }

  return <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
    <div>
      <h2 className="text-xl font-semibold">Настройка приложения</h2>
      <p className="mt-1 text-sm text-muted-foreground">Выберите функции и при необходимости настройте данные, связи и права. Веб Мастер сохранит это отдельно от версии HTML/ZIP.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(([key, title, text, Icon]) => <div key={key} className="flex items-start gap-3 rounded-xl border border-border p-4">
        <div className="rounded-lg bg-primary-soft p-2 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><div className="font-medium">{title}</div><div className="mt-1 text-xs text-muted-foreground">{text}</div></div>
        <Switch checked={value.features[key]} onCheckedChange={(checked) => toggle(key, checked)} />
      </div>)}
    </div>

    {value.features.database && <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div><div className="font-medium">Поля и таблицы</div><p className="mt-1 text-xs text-muted-foreground">Найденные автоматически поля можно изменить, дополнить или удалить.</p></div>
        <Button type="button" variant="outline" size="sm" onClick={addEntity}><Plus className="mr-1 h-4 w-4" />Таблица</Button>
      </div>

      {value.entities.length === 0 && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Поля не найдены. Добавьте таблицу вручную или вернитесь к проверке кода.</div>}

      {value.entities.map((entity) => <div key={entity.id} className="space-y-3 rounded-xl bg-muted/40 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={entity.label} onChange={(event) => replaceEntity(value, { ...entity, label: event.currentTarget.value, pluralLabel: event.currentTarget.value }) && onChange(replaceEntity(value, { ...entity, label: event.currentTarget.value, pluralLabel: event.currentTarget.value }))} placeholder="Название таблицы" />
          <input className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs sm:w-44" value={entity.key} onChange={(event) => onChange(replaceEntity(value, { ...entity, key: slugKey(event.currentTarget.value) }))} placeholder="table_key" />
          <Button type="button" variant="ghost" size="sm" onClick={() => removeEntity(entity.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-2">
          {entity.fields.map((field) => <div key={field.id} className="grid gap-2 rounded-lg border border-border bg-background p-3 lg:grid-cols-[1.2fr_0.9fr_130px_170px_auto] lg:items-center">
            <div className="grid grid-cols-2 gap-2">
              <input className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={field.label} onChange={(event) => onChange(replaceEntity(value, { ...entity, fields: entity.fields.map((item) => item.id === field.id ? { ...item, label: event.currentTarget.value } : item) }))} placeholder="Название" />
              <input className="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs" value={field.key} onChange={(event) => onChange(replaceEntity(value, { ...entity, fields: entity.fields.map((item) => item.id === field.id ? { ...item, key: slugKey(event.currentTarget.value) } : item) }))} placeholder="field_key" />
            </div>
            <Select value={field.type} onValueChange={(type) => onChange(replaceEntity(value, { ...entity, fields: entity.fields.map((item) => item.id === field.id ? { ...item, type: type as FieldDataType } : item) }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={field.required} onChange={(event) => onChange(replaceEntity(value, { ...entity, fields: entity.fields.map((item) => item.id === field.id ? { ...item, required: event.currentTarget.checked } : item) }))} />Обязательное</label>
            <Select value={field.aiAccess} disabled={!value.features.ai || field.sensitive} onValueChange={(aiAccess) => onChange(replaceEntity(value, { ...entity, fields: entity.fields.map((item) => item.id === field.id ? { ...item, aiAccess: aiAccess as AiFieldAccess } : item) }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{AI_ACCESS.map((mode) => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center justify-end gap-2">
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={field.userOwned} onChange={(event) => onChange(replaceEntity(value, { ...entity, fields: entity.fields.map((item) => item.id === field.id ? { ...item, userOwned: event.currentTarget.checked } : item) }))} />Пользователь</label>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(replaceEntity(value, { ...entity, fields: entity.fields.filter((item) => item.id !== field.id) }))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>)}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => onChange(replaceEntity(value, { ...entity, fields: [...entity.fields, newField(entity.fields.length + 1)] }))}><Plus className="mr-1 h-4 w-4" />Поле</Button>
      </div>)}
    </div>}

    {value.features.database && value.entities.length >= 2 && <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /><div className="font-medium">Связи между таблицами</div></div>
      <div className="grid gap-2 md:grid-cols-[1fr_150px_1fr]">
        <Select value={relationFrom} onValueChange={setRelationFrom}><SelectTrigger><SelectValue placeholder="Откуда" /></SelectTrigger><SelectContent>{value.entities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.pluralLabel}</SelectItem>)}</SelectContent></Select>
        <Select value={relationKind} onValueChange={(kind) => setRelationKind(kind as RelationKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one_to_one">Один к одному</SelectItem><SelectItem value="one_to_many">Один ко многим</SelectItem><SelectItem value="many_to_many">Многие ко многим</SelectItem></SelectContent></Select>
        <Select value={relationTo} onValueChange={setRelationTo}><SelectTrigger><SelectValue placeholder="Куда" /></SelectTrigger><SelectContent>{value.entities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{entity.pluralLabel}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="flex gap-2"><input className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={relationLabel} onChange={(event) => setRelationLabel(event.currentTarget.value)} placeholder="Название связи, например Клиент → Заказы" /><Button type="button" size="sm" onClick={addRelation} disabled={!relationFrom || !relationTo || relationFrom === relationTo}><Plus className="mr-1 h-4 w-4" />Добавить</Button></div>
      {value.relations.map((relation) => <div key={relation.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-xs"><div><div className="font-medium">{relation.label}</div><div className="mt-1 text-muted-foreground">{entityNames.get(relation.fromEntityId)} → {entityNames.get(relation.toEntityId)} · {relation.kind === "one_to_one" ? "1:1" : relation.kind === "one_to_many" ? "1:N" : "N:M"}</div></div><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...value, relations: value.relations.filter((item) => item.id !== relation.id), updatedAt: new Date().toISOString() })}><Trash2 className="h-4 w-4" /></Button></div>)}
    </div>}

    {value.features.multiUser && <div className="space-y-4 rounded-xl border border-border p-4">
      <div><div className="font-medium">Многопользовательский режим</div><p className="mt-1 text-xs text-muted-foreground">Регистрация и права ролей. Владелец всегда сохраняет полный доступ.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><div className="mb-1 text-xs text-muted-foreground">Регистрация</div><Select value={value.multiUser.registration} onValueChange={(registration) => onChange({ ...value, multiUser: { ...value.multiUser, registration: registration as AppRuntimeConfig["multiUser"]["registration"] } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invite_only">Только по приглашению</SelectItem><SelectItem value="admin_created">Создаёт администратор</SelectItem><SelectItem value="open">Открытая регистрация</SelectItem></SelectContent></Select></div>
        <div><div className="mb-1 text-xs text-muted-foreground">Роль нового пользователя</div><Select value={value.multiUser.defaultRoleKey} onValueChange={(defaultRoleKey) => onChange({ ...value, multiUser: { ...value.multiUser, defaultRoleKey } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{value.roles.filter((role) => role.key !== "owner").map((role) => <SelectItem key={role.key} value={role.key}>{role.label}</SelectItem>)}</SelectContent></Select></div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[760px] w-full text-xs">
          <thead className="bg-muted"><tr><th className="p-2 text-left font-medium">Роль</th>{PERMISSIONS.map((permission) => <th key={permission.value} className="p-2 text-center font-medium">{permission.label}</th>)}</tr></thead>
          <tbody>{value.roles.map((role) => { const actions = roleActions(role); const owner = role.key === "owner"; return <tr key={role.id} className="border-t border-border"><td className="p-2 font-medium">{role.label}</td>{PERMISSIONS.map((permission) => <td key={permission.value} className="p-2 text-center"><input type="checkbox" checked={owner || actions.includes(permission.value)} disabled={owner} onChange={(event) => onChange({ ...value, roles: value.roles.map((item) => item.id === role.id ? setRoleAction(item, permission.value, event.currentTarget.checked) : item), updatedAt: new Date().toISOString() })} /></td>)}</tr>; })}</tbody>
        </table>
      </div>
    </div>}

    {value.features.ai && <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="font-medium">База ИИ</div><p className="mt-1 text-xs text-muted-foreground">Сбор данных выключен по умолчанию. Пароли, токены и ключи в набор ИИ не допускаются.</p></div><Switch checked={value.ai.collectionEnabled} onCheckedChange={(collectionEnabled) => onChange({ ...value, ai: { ...value.ai, collectionEnabled } })} /></div>
    </div>}

    {value.features.adminPanel && <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
      <label className="flex items-center justify-between gap-3 text-sm"><span><span className="block font-medium">Дашборд</span><span className="text-xs text-muted-foreground">Показатели приложения</span></span><Switch checked={value.admin.dashboardEnabled} onCheckedChange={(dashboardEnabled) => onChange({ ...value, admin: { ...value.admin, dashboardEnabled } })} /></label>
      <label className="flex items-center justify-between gap-3 text-sm"><span><span className="block font-medium">Журнал действий</span><span className="text-xs text-muted-foreground">Кто и что изменил</span></span><Switch checked={value.admin.auditLogEnabled} onCheckedChange={(auditLogEnabled) => onChange({ ...value, admin: { ...value.admin, auditLogEnabled } })} /></label>
    </div>}

    {errors.length > 0 && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errors[0]?.message}</div>}

    <div className="flex gap-2 pt-1">
      <Button variant="outline" className="h-11" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Назад</Button>
      <Button className="h-11 flex-1" onClick={onNext} disabled={errors.length > 0}>Продолжить<ArrowRight className="ml-2 h-4 w-4" /></Button>
    </div>
  </div>;
}
