import type {
  AiFieldAccess,
  AppConfigValidationIssue,
  AppEntityConfig,
  AppFieldConfig,
  AppRoleConfig,
  AppRuntimeConfig,
  DetectedFieldCandidate,
  FieldDataType,
  PermissionAction,
} from "../../types/appConfig";

const SECRET_LIKE_KEY = /(password|passwd|pwd|secret|token|cookie|api[_-]?key|private[_-]?key|authorization|auth[_-]?header)/iu;

const ALL_ACTIONS: PermissionAction[] = [
  "view",
  "create",
  "update",
  "delete",
  "export",
  "manage_users",
  "manage_settings",
  "use_ai",
];

const USER_ACTIONS: PermissionAction[] = ["view", "create", "update", "use_ai"];
const VIEWER_ACTIONS: PermissionAction[] = ["view"];

export function createDefaultRoles(): AppRoleConfig[] {
  return [
    {
      id: "role-owner",
      key: "owner",
      label: "Владелец",
      system: true,
      permissions: [{ entityId: "*", actions: [...ALL_ACTIONS] }],
    },
    {
      id: "role-admin",
      key: "admin",
      label: "Администратор",
      system: true,
      permissions: [{ entityId: "*", actions: [...ALL_ACTIONS] }],
    },
    {
      id: "role-user",
      key: "user",
      label: "Пользователь",
      system: true,
      permissions: [{ entityId: "*", actions: [...USER_ACTIONS] }],
    },
    {
      id: "role-viewer",
      key: "viewer",
      label: "Наблюдатель",
      system: true,
      permissions: [{ entityId: "*", actions: [...VIEWER_ACTIONS] }],
    },
  ];
}

export function createDefaultAppConfig(projectId: string): AppRuntimeConfig {
  return {
    schemaVersion: 1,
    projectId,
    features: {
      database: false,
      multiUser: false,
      ai: false,
      adminPanel: false,
    },
    entities: [],
    relations: [],
    roles: createDefaultRoles(),
    multiUser: {
      enabled: false,
      registration: "invite_only",
      defaultRoleKey: "user",
      requireEmailVerification: true,
    },
    ai: {
      enabled: false,
      collectionEnabled: false,
      allowedEventTypes: [],
      requireHumanVerificationForTraining: true,
    },
    admin: {
      enabled: false,
      auditLogEnabled: true,
      dashboardEnabled: true,
      dashboardMetrics: [
        "users",
        "active_users",
        "records",
        "storage",
        "ai_requests",
        "errors",
        "current_release",
      ],
    },
    updatedAt: new Date().toISOString(),
  };
}

export function canRole(
  role: AppRoleConfig,
  action: PermissionAction,
  entityId: string,
): boolean {
  return role.permissions.some(
    (rule) =>
      (rule.entityId === "*" || rule.entityId === entityId) &&
      rule.actions.includes(action),
  );
}

export function isSecretLikeFieldKey(key: string): boolean {
  return SECRET_LIKE_KEY.test(key.trim());
}

export function normalizeAiAccess(
  field: Pick<AppFieldConfig, "key" | "sensitive" | "aiAccess">,
): AiFieldAccess {
  if (field.sensitive || isSecretLikeFieldKey(field.key)) return "none";
  return field.aiAccess;
}

function inputTypeToFieldType(inputType?: string): FieldDataType {
  switch ((inputType ?? "").toLowerCase()) {
    case "number":
    case "range":
      return "number";
    case "checkbox":
      return "boolean";
    case "date":
      return "date";
    case "datetime-local":
      return "datetime";
    case "file":
      return "file";
    default:
      return "text";
  }
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "") || "field"}`;
}

export function detectedFieldsToEntity(
  candidates: DetectedFieldCandidate[],
  entityKey = "records",
  entityLabel = "Запись",
): AppEntityConfig {
  const used = new Set<string>();
  const fields: AppFieldConfig[] = [];

  for (const candidate of candidates) {
    const key = candidate.key.trim();
    if (!key || used.has(key.toLowerCase())) continue;
    used.add(key.toLowerCase());

    fields.push({
      id: stableId("field", key),
      key,
      label: candidate.label?.trim() || key,
      type: inputTypeToFieldType(candidate.inputType),
      required: Boolean(candidate.required),
      unique: false,
      userOwned: false,
      aiAccess: isSecretLikeFieldKey(key) ? "none" : "read",
      sensitive: isSecretLikeFieldKey(key),
      source: "detected",
    });
  }

  return {
    id: stableId("entity", entityKey),
    key: entityKey,
    label: entityLabel,
    pluralLabel: `${entityLabel}и`,
    fields,
  };
}

export function validateAppConfig(config: AppRuntimeConfig): AppConfigValidationIssue[] {
  const issues: AppConfigValidationIssue[] = [];
  const entityIds = new Set(config.entities.map((entity) => entity.id));
  const entityKeys = new Set<string>();

  config.entities.forEach((entity, entityIndex) => {
    const normalizedEntityKey = entity.key.trim().toLowerCase();
    if (entityKeys.has(normalizedEntityKey)) {
      issues.push({
        code: "duplicate_entity_key",
        path: `entities.${entityIndex}.key`,
        message: `Повторяется ключ сущности «${entity.key}».`,
      });
    }
    entityKeys.add(normalizedEntityKey);

    const fieldKeys = new Set<string>();
    entity.fields.forEach((field, fieldIndex) => {
      const path = `entities.${entityIndex}.fields.${fieldIndex}`;
      const normalizedFieldKey = field.key.trim().toLowerCase();
      if (fieldKeys.has(normalizedFieldKey)) {
        issues.push({
          code: "duplicate_field_key",
          path: `${path}.key`,
          message: `В сущности «${entity.label}» повторяется поле «${field.key}».`,
        });
      }
      fieldKeys.add(normalizedFieldKey);

      if (field.type === "reference" && field.referenceEntityId && !entityIds.has(field.referenceEntityId)) {
        issues.push({
          code: "invalid_reference",
          path: `${path}.referenceEntityId`,
          message: `Поле «${field.label}» ссылается на неизвестную сущность.`,
        });
      }

      if (field.aiAccess !== "none" && field.sensitive) {
        issues.push({
          code: "ai_sensitive_field",
          path: `${path}.aiAccess`,
          message: `Чувствительное поле «${field.label}» нельзя передавать ИИ.`,
        });
      }

      if (field.aiAccess !== "none" && isSecretLikeFieldKey(field.key)) {
        issues.push({
          code: "ai_secret_like_field",
          path: `${path}.aiAccess`,
          message: `Системное/секретное поле «${field.label}» нельзя передавать ИИ.`,
        });
      }
    });
  });

  config.relations.forEach((relation, relationIndex) => {
    if (!entityIds.has(relation.fromEntityId) || !entityIds.has(relation.toEntityId)) {
      issues.push({
        code: "invalid_relation",
        path: `relations.${relationIndex}`,
        message: `Связь «${relation.label}» содержит неизвестную сущность.`,
      });
    }
  });

  if (config.multiUser.enabled && config.roles.length === 0) {
    issues.push({
      code: "multiuser_without_roles",
      path: "roles",
      message: "Для многопользовательского режима нужна хотя бы одна роль.",
    });
  }

  if (
    config.multiUser.enabled &&
    !config.roles.some((role) => role.key === config.multiUser.defaultRoleKey)
  ) {
    issues.push({
      code: "missing_default_role",
      path: "multiUser.defaultRoleKey",
      message: "Роль по умолчанию не найдена.",
    });
  }

  return issues;
}

export function withFeatureState(
  config: AppRuntimeConfig,
  feature: keyof AppRuntimeConfig["features"],
  enabled: boolean,
): AppRuntimeConfig {
  const next: AppRuntimeConfig = {
    ...config,
    features: { ...config.features, [feature]: enabled },
    updatedAt: new Date().toISOString(),
  };

  if (feature === "multiUser") next.multiUser = { ...next.multiUser, enabled };
  if (feature === "ai") next.ai = { ...next.ai, enabled };
  if (feature === "adminPanel") next.admin = { ...next.admin, enabled };
  return next;
}