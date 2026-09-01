import { describe, expect, test } from "bun:test";
import {
  canRole,
  createDefaultAppConfig,
  createDefaultRoles,
  detectedFieldsToEntity,
  isSecretLikeFieldKey,
  normalizeAiAccess,
  validateAppConfig,
  withFeatureState,
} from "../src/lib/app-config/config";
import { dashboardCards, formatStorageBytes } from "../src/lib/app-config/dashboard";

describe("app config defaults", () => {
  test("creates safe defaults", () => {
    const config = createDefaultAppConfig("00000000-0000-0000-0000-000000000001");
    expect(config.features.database).toBe(false);
    expect(config.multiUser.registration).toBe("invite_only");
    expect(config.ai.collectionEnabled).toBe(false);
    expect(config.roles.map((role) => role.key)).toEqual(["owner", "admin", "user", "viewer"]);
  });

  test("feature toggle synchronizes nested config", () => {
    const config = createDefaultAppConfig("p1");
    const next = withFeatureState(config, "multiUser", true);
    expect(next.features.multiUser).toBe(true);
    expect(next.multiUser.enabled).toBe(true);
  });
});

describe("roles", () => {
  test("owner can manage settings, viewer cannot", () => {
    const roles = createDefaultRoles();
    expect(canRole(roles[0], "manage_settings", "entity-1")).toBe(true);
    expect(canRole(roles[3], "manage_settings", "entity-1")).toBe(false);
    expect(canRole(roles[3], "view", "entity-1")).toBe(true);
  });
});

describe("detected fields", () => {
  test("maps HTML-like fields and removes duplicates", () => {
    const entity = detectedFieldsToEntity([
      { key: "amount", label: "Сумма", inputType: "number", required: true },
      { key: "amount", label: "Сумма 2", inputType: "text" },
      { key: "approved", inputType: "checkbox" },
    ], "payments", "Платёж");

    expect(entity.fields).toHaveLength(2);
    expect(entity.fields[0].type).toBe("number");
    expect(entity.fields[0].required).toBe(true);
    expect(entity.fields[1].type).toBe("boolean");
  });

  test("secret-like fields are blocked from AI", () => {
    const entity = detectedFieldsToEntity([{ key: "api_token", label: "API token" }]);
    expect(entity.fields[0].sensitive).toBe(true);
    expect(entity.fields[0].aiAccess).toBe("none");
    expect(isSecretLikeFieldKey("privateKey")).toBe(true);
    expect(normalizeAiAccess({ key: "password", sensitive: false, aiAccess: "read_write" })).toBe("none");
  });
});

describe("validation", () => {
  test("rejects duplicate fields and AI access to sensitive values", () => {
    const config = createDefaultAppConfig("p1");
    config.features.database = true;
    config.entities = [{
      id: "e1",
      key: "orders",
      label: "Заказ",
      pluralLabel: "Заказы",
      fields: [
        { id: "f1", key: "name", label: "Имя", type: "text", required: false, unique: false, userOwned: false, aiAccess: "read", sensitive: false, source: "manual" },
        { id: "f2", key: "NAME", label: "Имя 2", type: "text", required: false, unique: false, userOwned: false, aiAccess: "none", sensitive: false, source: "manual" },
        { id: "f3", key: "password", label: "Пароль", type: "text", required: false, unique: false, userOwned: true, aiAccess: "read", sensitive: true, source: "manual" },
      ],
    }];

    const issues = validateAppConfig(config);
    expect(issues.some((issue) => issue.code === "duplicate_field_key")).toBe(true);
    expect(issues.some((issue) => issue.code === "ai_sensitive_field")).toBe(true);
    expect(issues.some((issue) => issue.code === "ai_secret_like_field")).toBe(true);
  });

  test("validates relation targets and default role", () => {
    const config = withFeatureState(createDefaultAppConfig("p1"), "multiUser", true);
    config.multiUser.defaultRoleKey = "missing";
    config.relations = [{ id: "r1", fromEntityId: "missing-a", toEntityId: "missing-b", kind: "one_to_many", label: "Связь" }];
    const issues = validateAppConfig(config);
    expect(issues.some((issue) => issue.code === "invalid_relation")).toBe(true);
    expect(issues.some((issue) => issue.code === "missing_default_role")).toBe(true);
  });
});

describe("dashboard", () => {
  test("formats bytes and release", () => {
    expect(formatStorageBytes(0)).toBe("0 Б");
    expect(formatStorageBytes(1024)).toBe("1.0 КБ");
    const cards = dashboardCards({
      users: 12,
      activeUsers: 5,
      records: 100,
      storageBytes: 1024,
      aiRequests: 7,
      errors: 1,
      currentRelease: 3,
      updatedAt: "2026-09-01T00:00:00Z",
    });
    expect(cards.find((card) => card.key === "currentRelease")?.value).toBe("v3");
  });
});
