import { useMemo } from "react";
import type {
  AiFieldAccess,
  AppEntityConfig,
  AppFeatureFlags,
  AppFieldConfig,
  AppRuntimeConfig,
  FieldDataType,
} from "../../types/appConfig";
import { validateAppConfig, withFeatureState } from "../../lib/app-config/config";

export interface AppSetupPanelProps {
  value: AppRuntimeConfig;
  onChange: (value: AppRuntimeConfig) => void;
  onSave?: () => void;
  saving?: boolean;
}

const featureLabels: Record<keyof AppFeatureFlags, { title: string; description: string }> = {
  database: { title: "База данных", description: "Хранить рабочие записи приложения." },
  multiUser: { title: "Несколько пользователей", description: "Пользователи, роли и права доступа." },
  ai: { title: "ИИ", description: "Разрешить ИИ работать только с выбранными полями." },
  adminPanel: { title: "Панель администратора", description: "Пользователи, данные, журнал и дашборд." },
};

const fieldTypeLabels: Record<FieldDataType, string> = {
  text: "Текст",
  number: "Число",
  boolean: "Да/нет",
  date: "Дата",
  datetime: "Дата и время",
  select: "Список",
  reference: "Связь",
  file: "Файл",
  user: "Пользователь",
  status: "Статус",
  json: "Структура данных",
  computed: "Вычисляемое",
};

const aiLabels: Record<AiFieldAccess, string> = {
  none: "ИИ не видит",
  read: "ИИ читает",
  write: "ИИ записывает",
  read_write: "ИИ читает и записывает",
};

function replaceEntity(config: AppRuntimeConfig, nextEntity: AppEntityConfig): AppRuntimeConfig {
  return {
    ...config,
    entities: config.entities.map((entity) => entity.id === nextEntity.id ? nextEntity : entity),
    updatedAt: new Date().toISOString(),
  };
}

function replaceField(entity: AppEntityConfig, nextField: AppFieldConfig): AppEntityConfig {
  return {
    ...entity,
    fields: entity.fields.map((field) => field.id === nextField.id ? nextField : field),
  };
}

export function AppSetupPanel({ value, onChange, onSave, saving }: AppSetupPanelProps) {
  const issues = useMemo(() => validateAppConfig(value), [value]);

  return (
    <section className="space-y-6 rounded-2xl border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Настройка приложения</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Выберите возможности. Технические таблицы, права и API Веб Мастер создаёт сам.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(featureLabels) as Array<keyof AppFeatureFlags>).map((key) => {
          const label = featureLabels[key];
          return (
            <label key={key} className="flex cursor-pointer gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={value.features[key]}
                onChange={(event) => onChange(withFeatureState(value, key, event.currentTarget.checked))}
              />
              <span>
                <span className="block font-medium">{label.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{label.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      {value.features.multiUser && (
        <div className="rounded-xl border p-4">
          <h3 className="font-semibold">Многопользовательский режим</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Регистрация</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-3"
                value={value.multiUser.registration}
                onChange={(event) => onChange({
                  ...value,
                  multiUser: { ...value.multiUser, registration: event.currentTarget.value as AppRuntimeConfig["multiUser"]["registration"] },
                })}
              >
                <option value="invite_only">Только по приглашению</option>
                <option value="admin_created">Создаёт администратор</option>
                <option value="open">Открытая регистрация</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Роль нового пользователя</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-3"
                value={value.multiUser.defaultRoleKey}
                onChange={(event) => onChange({
                  ...value,
                  multiUser: { ...value.multiUser, defaultRoleKey: event.currentTarget.value },
                })}
              >
                {value.roles.map((role) => <option key={role.id} value={role.key}>{role.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {value.roles.map((role) => (
              <div key={role.id} className="rounded-lg bg-muted p-3 text-sm">
                <div className="font-medium">{role.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {role.permissions.flatMap((rule) => rule.actions).length} разрешений
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {value.features.database && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Поля и данные</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Здесь показываются автоматически найденные и добавленные вручную сущности приложения.
            </p>
          </div>

          {value.entities.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Поля ещё не определены. После анализа HTML/ZIP Веб Мастер предложит структуру автоматически.
            </div>
          ) : value.entities.map((entity) => (
            <div key={entity.id} className="overflow-hidden rounded-xl border">
              <div className="border-b bg-muted/50 px-4 py-3">
                <div className="font-medium">{entity.pluralLabel}</div>
                <div className="text-xs text-muted-foreground">{entity.fields.length} полей</div>
              </div>
              <div className="divide-y">
                {entity.fields.map((field) => (
                  <div key={field.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_160px_170px_auto] lg:items-center">
                    <div>
                      <div className="font-medium">{field.label}</div>
                      <div className="text-xs text-muted-foreground">{field.key}</div>
                    </div>
                    <select
                      className="h-9 rounded-lg border bg-background px-2 text-sm"
                      value={field.type}
                      onChange={(event) => onChange(replaceEntity(value, replaceField(entity, {
                        ...field,
                        type: event.currentTarget.value as FieldDataType,
                      })))}
                    >
                      {Object.entries(fieldTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <select
                      className="h-9 rounded-lg border bg-background px-2 text-sm"
                      value={field.aiAccess}
                      disabled={!value.features.ai || field.sensitive}
                      onChange={(event) => onChange(replaceEntity(value, replaceField(entity, {
                        ...field,
                        aiAccess: event.currentTarget.value as AiFieldAccess,
                      })))}
                    >
                      {Object.entries(aiLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.userOwned}
                        onChange={(event) => onChange(replaceEntity(value, replaceField(entity, {
                          ...field,
                          userOwned: event.currentTarget.checked,
                        })))}
                      />
                      Поле пользователя
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {value.features.adminPanel && (
        <div className="rounded-xl border p-4">
          <h3 className="font-semibold">Административная панель</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {["Пользователи", "Роли и права", "Данные", "ИИ", "Журнал действий", "Ошибки", "Версии", "Дашборд"].map((item) => (
              <span key={item} className="rounded-full bg-muted px-3 py-1.5">{item}</span>
            ))}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <div className="font-medium">Нужно исправить: {issues.length}</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {issues.slice(0, 6).map((issue) => <li key={`${issue.path}-${issue.code}`}>{issue.message}</li>)}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="h-11 rounded-xl bg-primary px-5 font-medium text-primary-foreground disabled:opacity-50"
          disabled={saving || issues.length > 0}
          onClick={onSave}
        >
          {saving ? "Сохраняем…" : "Сохранить настройки"}
        </button>
      </div>
    </section>
  );
}