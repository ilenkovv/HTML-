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

const MAX_RECORD_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 64 * 1024;
const MAX_JSON_DEPTH = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Entity-specific permission rules override the wildcard rule.
 * This is important for the UI permissions matrix: an explicit per-entity
 * restriction must not be silently re-enabled by a global wildcard grant.
 */
function roleActions(role: AppRoleConfig, entityId: string): Set<PermissionAction> {
  const specific = role.permissions.find((rule) => rule.entityId === entityId);
  const fallback = role.permissions.find((rule) => rule.entityId === "*");
  return new Set<PermissionAction>((specific ?? fallback)?.actions ?? []);
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

function jsonDepth(value: unknown, depth = 0): number {
  if (depth > MAX_JSON_DEPTH) return depth;
  if (value === null || typeof value !== "object") return depth;
  if (Array.isArray(value)) {
    return value.reduce((max, item) => Math.max(max, jsonDepth(item, depth + 1)), depth + 1);
  }
  return Object.values(value as Record<string, unknown>).reduce(
    (max, item) => Math.max(max, jsonDepth(item, depth + 1)),
    depth + 1,
  );
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoDateTime(value: string): boolean {
  if (value.length < 16 || value.length > 40) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function matchesType(type: FieldDataType, value: unknown): boolean {
  if (value === null) return true;
  switch (type) {
    case "text":
      return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
    case "select":
    case "status":
      return typeof value === "string" && value.length <= 512;
    case "date":
      return typeof value === "string" && isIsoDate(value);
    case "datetime":
      return typeof value === "string" && isIsoDateTime(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "file":
      return typeof value === "string" && value.length > 0 && value.length <= 4096;
    case "user":
    case "reference":
      return typeof value === "string" && UUID_RE.test(value);
    case "json":
      return typeof value === "object" && value !== null && jsonDepth(value) <= MAX_JSON_DEPTH;
    case "computed":
      return false;
    default:
      return false;
  }
}

function writableFields(entity: AppEntityConfig): AppFieldConfig[] {
  return entity.fields.filter((field) => field.type !== "computed" && field.source !== "system");
}

function validateConfiguredOptions(field: AppFieldConfig, value: unknown): void {
  if ((field.type !== "select" && field.type !== "status") || value === null || value === undefined) return;
  if (!field.options || field.options.length === 0) return;
  if (typeof value !== "string" || !field.options.includes(value)) {
    throw new AppRuntimePolicyError(
      "INVALID_OPTION",
      `Значение поля «${field.label}» отсутствует в разрешённом списке.`,
    );
  }
}

function serializedBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    throw new AppRuntimePolicyError("INVALID_JSON", "Данные записи невозможно сериализовать.");
  }
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
    validateConfiguredOptions(field, value);
    clean[key] = value;
  }

  if (mode === "create") {
    for (const field of allowed.values()) {
      if (field.required && (clean[field.key] === undefined || clean[field.key] === null || clean[field.key] === "")) {
        throw new AppRuntimePolicyError("REQUIRED_FIELD", `Поле «${field.label}» обязательно.`);
      }
    }
  }

  if (serializedBytes(clean) > MAX_RECORD_BYTES) {
    throw new AppRuntimePolicyError("RECORD_TOO_LARGE", "Запись превышает допустимый размер 512 КБ.");
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
