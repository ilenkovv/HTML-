import type {
  AppEntityConfig,
  AppFieldConfig,
  AppRoleConfig,
  AppRuntimeConfig,
  FieldDataType,
  PermissionAction,
} from "../../types/appConfig";

export class AppRuntimePolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AppRuntimePolicyError";
  }
}

export interface RuntimeActor {
  memberId: string;
  roleKey: string;
}

export interface RuntimeRecord {
  id: string;
  entityKey: string;
  data: Record<string, unknown>;
  ownerMemberId: string | null;
}

function roleActions(role: AppRoleConfig, entityId: string): Set<PermissionAction> {
  const actions = new Set<PermissionAction>();
  for (const rule of role.permissions) {
    if (rule.entityId === "*" || rule.entityId === entityId) {
      for (const action of rule.actions) actions.add(action);
    }
  }
  return actions;
}

export function getEntity(config: AppRuntimeConfig, entityKey: string): AppEntityConfig {
  const entity = config.entities.find((item) => item.key === entityKey);
  if (!entity) throw new AppRuntimePolicyError("ENTITY_NOT_FOUND", `Сущность «${entityKey}» не настроена.`);
  return entity;
}

export function getRole(config: AppRuntimeConfig, roleKey: string): AppRoleConfig {
  const role = config.roles.find((item) => item.key === roleKey);
  if (!role) throw new AppRuntimePolicyError("ROLE_NOT_FOUND", `Роль «${roleKey}» не настроена.`);
  return role;
}

export function canPerform(
  config: AppRuntimeConfig,
  roleKey: string,
  action: PermissionAction,
  entityKey: string,
): boolean {
  const entity = getEntity(config, entityKey);
  const role = getRole(config, roleKey);
  if (role.key === "owner") return true;
  return roleActions(role, entity.id).has(action);
}

export function requirePermission(
  config: AppRuntimeConfig,
  actor: RuntimeActor,
  action: PermissionAction,
  entityKey: string,
): void {
  if (!canPerform(config, actor.roleKey, action, entityKey)) {
    throw new AppRuntimePolicyError("FORBIDDEN", `Роль «${actor.roleKey}» не имеет права «${action}».`);
  }
}

function matchesType(type: FieldDataType, value: unknown): boolean {
  if (value === null) return true;
  switch (type) {
    case "text":
    case "select":
    case "status":
    case "date":
    case "datetime":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "file":
      return typeof value === "string" || (typeof value === "object" && value !== null);
    case "user":
    case "reference":
      return typeof value === "string";
    case "json":
      return typeof value === "object" && value !== null;
    case "computed":
      return true;
    default:
      return false;
  }
}

function writableFields(entity: AppEntityConfig): AppFieldConfig[] {
  return entity.fields.filter((field) => field.type !== "computed" && field.source !== "system");
}

export function validateRecordInput(
  config: AppRuntimeConfig,
  entityKey: string,
  input: Record<string, unknown>,
  mode: "create" | "update",
): Record<string, unknown> {
  const entity = getEntity(config, entityKey);
  const allowed = new Map(writableFields(entity).map((field) => [field.key, field]));
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    const field = allowed.get(key);
    if (!field) throw new AppRuntimePolicyError("UNKNOWN_FIELD", `Поле «${key}» не разрешено.`);
    if (!matchesType(field.type, value)) {
      throw new AppRuntimePolicyError("INVALID_FIELD_TYPE", `Некорректный тип поля «${field.label}».`);
    }
    clean[key] = value;
  }

  if (mode === "create") {
    for (const field of allowed.values()) {
      if (field.required && (clean[field.key] === undefined || clean[field.key] === null || clean[field.key] === "")) {
        throw new AppRuntimePolicyError("REQUIRED_FIELD", `Поле «${field.label}» обязательно.`);
      }
    }
  }

  return clean;
}

export function shouldOwnRecord(config: AppRuntimeConfig, entityKey: string): boolean {
  const entity = getEntity(config, entityKey);
  return entity.fields.some((field) => field.userOwned);
}

export function requireRecordScope(
  config: AppRuntimeConfig,
  actor: RuntimeActor,
  record: RuntimeRecord,
): void {
  const role = getRole(config, actor.roleKey);
  if (role.key === "owner" || role.key === "admin") return;
  if (!shouldOwnRecord(config, record.entityKey)) return;
  if (record.ownerMemberId !== actor.memberId) {
    throw new AppRuntimePolicyError("RECORD_SCOPE_FORBIDDEN", "Пользователь не имеет доступа к чужой записи.");
  }
}

export function filterRecordForAi(
  config: AppRuntimeConfig,
  entityKey: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const entity = getEntity(config, entityKey);
  const readable = new Set(
    entity.fields
      .filter((field) => !field.sensitive && (field.aiAccess === "read" || field.aiAccess === "read_write"))
      .map((field) => field.key),
  );
  return Object.fromEntries(Object.entries(data).filter(([key]) => readable.has(key)));
}

export function writableAiFields(config: AppRuntimeConfig, entityKey: string): string[] {
  const entity = getEntity(config, entityKey);
  return entity.fields
    .filter((field) => !field.sensitive && (field.aiAccess === "write" || field.aiAccess === "read_write"))
    .map((field) => field.key);
}
