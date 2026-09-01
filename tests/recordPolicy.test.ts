import { describe, expect, test } from "bun:test";
import { createDefaultAppConfig, withFeatureState } from "../src/lib/app-config/config";
import {
  AppRuntimePolicyError,
  canPerform,
  filterRecordForAi,
  requirePermission,
  requireRecordScope,
  validateRecordInput,
  writableAiFields,
} from "../src/lib/app-runtime/recordPolicy";

function makeConfig() {
  const config = withFeatureState(createDefaultAppConfig("p1"), "database", true);
  config.entities = [{
    id: "entity-orders",
    key: "orders",
    label: "Заказ",
    pluralLabel: "Заказы",
    fields: [
      { id: "f1", key: "name", label: "Название", type: "text", required: true, unique: false, userOwned: false, aiAccess: "read", sensitive: false, source: "manual" },
      { id: "f2", key: "amount", label: "Сумма", type: "number", required: false, unique: false, userOwned: false, aiAccess: "read_write", sensitive: false, source: "manual" },
      { id: "f3", key: "owner", label: "Пользователь", type: "user", required: false, unique: false, userOwned: true, aiAccess: "none", sensitive: false, source: "system" },
      { id: "f4", key: "secret", label: "Секрет", type: "text", required: false, unique: false, userOwned: false, aiAccess: "read_write", sensitive: true, source: "manual" },
    ],
  }];
  return config;
}

describe("record permissions", () => {
  test("owner always has access, viewer only has view", () => {
    const config = makeConfig();
    expect(canPerform(config, "owner", "delete", "orders")).toBe(true);
    expect(canPerform(config, "viewer", "view", "orders")).toBe(true);
    expect(canPerform(config, "viewer", "update", "orders")).toBe(false);
  });

  test("requirePermission throws on denied action", () => {
    const config = makeConfig();
    expect(() => requirePermission(config, { memberId: "m1", roleKey: "viewer" }, "delete", "orders"))
      .toThrow(AppRuntimePolicyError);
  });

  test("user-owned entity blocks other users", () => {
    const config = makeConfig();
    const record = { id: "r1", entityKey: "orders", data: {}, ownerMemberId: "m1" };
    expect(() => requireRecordScope(config, { memberId: "m2", roleKey: "user" }, record))
      .toThrow(AppRuntimePolicyError);
    expect(() => requireRecordScope(config, { memberId: "m1", roleKey: "user" }, record))
      .not.toThrow();
    expect(() => requireRecordScope(config, { memberId: "m2", roleKey: "admin" }, record))
      .not.toThrow();
  });
});

describe("record validation", () => {
  test("accepts configured fields and rejects unknown fields", () => {
    const config = makeConfig();
    expect(validateRecordInput(config, "orders", { name: "Заказ", amount: 100 }, "create"))
      .toEqual({ name: "Заказ", amount: 100 });
    expect(() => validateRecordInput(config, "orders", { unknown: true }, "create"))
      .toThrow(AppRuntimePolicyError);
  });

  test("requires configured required fields and validates types", () => {
    const config = makeConfig();
    expect(() => validateRecordInput(config, "orders", { amount: 100 }, "create"))
      .toThrow(AppRuntimePolicyError);
    expect(() => validateRecordInput(config, "orders", { name: "Заказ", amount: "100" }, "create"))
      .toThrow(AppRuntimePolicyError);
  });
});

describe("AI field policy", () => {
  test("AI only receives explicitly readable non-sensitive fields", () => {
    const config = makeConfig();
    expect(filterRecordForAi(config, "orders", { name: "A", amount: 10, owner: "m1", secret: "x" }))
      .toEqual({ name: "A", amount: 10 });
    expect(writableAiFields(config, "orders")).toEqual(["amount"]);
  });
});
