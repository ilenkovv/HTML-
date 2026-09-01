export type FieldDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "select"
  | "reference"
  | "file"
  | "user"
  | "status"
  | "json"
  | "computed";

export type AiFieldAccess = "none" | "read" | "write" | "read_write";
export type RelationKind = "one_to_one" | "one_to_many" | "many_to_many";
export type RegistrationMode = "invite_only" | "admin_created" | "open";

export const APP_CONFIG_LIMITS = {
  maxEntities: 50,
  maxFieldsPerEntity: 200,
  maxRelations: 200,
  maxRoles: 50,
  maxAiEventTypes: 100,
  maxKeyLength: 64,
  maxLabelLength: 120,
  maxOptionLength: 200,
  maxOptionsPerField: 200,
  maxTextLength: 20_000,
  maxJsonDepth: 20,
  maxConfigBytes: 512 * 1024,
  maxRecordBytes: 512 * 1024,
} as const;

export type PermissionAction =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "manage_users"
  | "manage_settings"
  | "use_ai";

export interface AppFieldConfig {
  id: string;
  key: string;
  label: string;
  type: FieldDataType;
  required: boolean;
  unique: boolean;
  userOwned: boolean;
  aiAccess: AiFieldAccess;
  sensitive: boolean;
  source: "detected" | "manual" | "system";
  options?: string[];
  referenceEntityId?: string;
  description?: string;
}

export interface AppEntityConfig {
  id: string;
  key: string;
  label: string;
  pluralLabel: string;
  fields: AppFieldConfig[];
}

export interface AppRelationConfig {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  kind: RelationKind;
  label: string;
  inverseLabel?: string;
}

export interface PermissionRule {
  entityId: "*" | string;
  actions: PermissionAction[];
}

export interface AppRoleConfig {
  id: string;
  key: string;
  label: string;
  system: boolean;
  permissions: PermissionRule[];
}

export interface MultiUserConfig {
  enabled: boolean;
  registration: RegistrationMode;
  defaultRoleKey: string;
  requireEmailVerification: boolean;
}

export interface AiDataConfig {
  enabled: boolean;
  collectionEnabled: boolean;
  allowedEventTypes: string[];
  requireHumanVerificationForTraining: boolean;
}

export interface AdminPanelConfig {
  enabled: boolean;
  auditLogEnabled: boolean;
  dashboardEnabled: boolean;
  dashboardMetrics: Array<
    | "users"
    | "active_users"
    | "records"
    | "storage"
    | "ai_requests"
    | "errors"
    | "current_release"
  >;
}

export interface AppFeatureFlags {
  database: boolean;
  multiUser: boolean;
  ai: boolean;
  adminPanel: boolean;
}

export interface AppRuntimeConfig {
  schemaVersion: 1;
  projectId: string;
  features: AppFeatureFlags;
  entities: AppEntityConfig[];
  relations: AppRelationConfig[];
  roles: AppRoleConfig[];
  multiUser: MultiUserConfig;
  ai: AiDataConfig;
  admin: AdminPanelConfig;
  updatedAt: string;
}

export interface DetectedFieldCandidate {
  entityHint?: string;
  key: string;
  label?: string;
  inputType?: string;
  required?: boolean;
}

export interface AppConfigValidationIssue {
  code:
    | "duplicate_entity_key"
    | "duplicate_field_key"
    | "invalid_reference"
    | "invalid_relation"
    | "ai_sensitive_field"
    | "ai_secret_like_field"
    | "missing_default_role"
    | "multiuser_without_roles"
    | "limit_exceeded"
    | "invalid_key"
    | "invalid_option";
  path: string;
  message: string;
}
