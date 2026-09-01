import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AppRelationConfig, AppRuntimeConfig } from "../../types/appConfig";
import {
  AppRuntimePolicyError,
  getEntity,
  getRole,
  requirePermission,
  requireRecordScope,
  shouldOwnRecord,
  validateRecordInput,
  type RuntimeActor,
  type RuntimeRecord,
} from "./recordPolicy";

export class AppRuntimeDataError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AppRuntimeDataError";
  }
}

export type RuntimePrincipal =
  | { kind: "owner"; ownerToken: string }
  | { kind: "member"; externalAuthId: string };

export interface RuntimeAccessContext {
  projectId: string;
  config: AppRuntimeConfig;
  actor: RuntimeActor;
  actorMemberId: string | null;
  isOwner: boolean;
}

export interface AppRecordRow {
  id: string;
  projectId: string;
  entityKey: string;
  data: Record<string, unknown>;
  ownerMemberId: string | null;
  createdByMemberId: string | null;
  updatedByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListRecordsOptions {
  limit?: number;
  before?: string;
}

function toDataError(error: unknown): AppRuntimeDataError {
  if (error instanceof AppRuntimeDataError) return error;
  if (error instanceof AppRuntimePolicyError) return new AppRuntimeDataError(error.code, error.message);
  console.error("app-runtime: unexpected error", error);
  return new AppRuntimeDataError("RUNTIME_ERROR", "Не удалось выполнить операцию с данными приложения.");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapRecord(row: Record<string, unknown>): AppRecordRow {
  return {
    id: String(row.id ?? ""),
    projectId: String(row.project_id ?? ""),
    entityKey: String(row.entity_key ?? ""),
    data: asObject(row.data),
    ownerMemberId: typeof row.owner_member_id === "string" ? row.owner_member_id : null,
    createdByMemberId: typeof row.created_by_member_id === "string" ? row.created_by_member_id : null,
    updatedByMemberId: typeof row.updated_by_member_id === "string" ? row.updated_by_member_id : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function policyRecord(row: AppRecordRow): RuntimeRecord {
  return {
    id: row.id,
    entityKey: row.entityKey,
    data: row.data,
    ownerMemberId: row.ownerMemberId,
  };
}

export function normalizeRecordPageSize(limit: number | undefined): number {
  if (limit === undefined) return 50;
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function normalizeBefore(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppRuntimeDataError("INVALID_CURSOR", "Некорректная позиция списка записей.");
  }
  return date.toISOString();
}

async function loadConfig(projectId: string): Promise<AppRuntimeConfig> {
  const { data, error } = await supabaseAdmin
    .from("app_runtime_configs")
    .select("config")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error("app-runtime: config read failed", error);
    throw new AppRuntimeDataError("CONFIG_READ_FAILED", "Не удалось прочитать настройки приложения.");
  }
  if (!data?.config || typeof data.config !== "object") {
    throw new AppRuntimeDataError("CONFIG_NOT_FOUND", "Настройка приложения ещё не завершена.");
  }
  return data.config as unknown as AppRuntimeConfig;
}

export async function resolveRuntimeAccess(
  projectId: string,
  principal: RuntimePrincipal,
): Promise<RuntimeAccessContext> {
  try {
    const config = await loadConfig(projectId);

    if (principal.kind === "owner") {
      if (!principal.ownerToken || principal.ownerToken.length < 10) {
        throw new AppRuntimeDataError("SESSION_NOT_FOUND", "Сессия владельца не найдена.");
      }
      const { data, error } = await supabaseAdmin
        .from("app_projects")
        .select("id")
        .eq("id", projectId)
        .eq("owner_token", principal.ownerToken)
        .maybeSingle();
      if (error) {
        console.error("app-runtime: owner project check failed", error);
        throw new AppRuntimeDataError("PROJECT_READ_FAILED", "Не удалось проверить приложение.");
      }
      if (!data) throw new AppRuntimeDataError("PROJECT_NOT_FOUND", "Приложение не найдено.");
      getRole(config, "owner");
      return {
        projectId,
        config,
        actor: { memberId: "owner", roleKey: "owner" },
        actorMemberId: null,
        isOwner: true,
      };
    }

    if (!principal.externalAuthId.trim()) {
      throw new AppRuntimeDataError("AUTH_REQUIRED", "Пользователь не авторизован.");
    }
    const { data: member, error } = await supabaseAdmin
      .from("app_members")
      .select("id,role_key,status")
      .eq("project_id", projectId)
      .eq("external_auth_id", principal.externalAuthId)
      .maybeSingle();
    if (error) {
      console.error("app-runtime: member read failed", error);
      throw new AppRuntimeDataError("MEMBER_READ_FAILED", "Не удалось проверить доступ пользователя.");
    }
    if (!member || member.status !== "active") {
      throw new AppRuntimeDataError("MEMBER_NOT_ACTIVE", "Доступ пользователя к приложению отключён.");
    }
    getRole(config, member.role_key);
    return {
      projectId,
      config,
      actor: { memberId: member.id, roleKey: member.role_key },
      actorMemberId: member.id,
      isOwner: false,
    };
  } catch (error) {
    throw toDataError(error);
  }
}

async function audit(
  access: RuntimeAccessContext,
  action: string,
  entityKey?: string,
  recordId?: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from("app_audit_log").insert({
    project_id: access.projectId,
    actor_member_id: access.actorMemberId,
    action,
    entity_key: entityKey ?? null,
    record_id: recordId ?? null,
    metadata: metadata as never,
  });
  if (error) console.error("app-runtime: audit write failed", error);
}

async function loadRecord(
  access: RuntimeAccessContext,
  recordId: string,
  entityKey?: string,
): Promise<AppRecordRow> {
  let query = supabaseAdmin
    .from("app_records")
    .select("*")
    .eq("project_id", access.projectId)
    .eq("id", recordId)
    .is("deleted_at", null);
  if (entityKey) query = query.eq("entity_key", entityKey);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("app-runtime: record read failed", error);
    throw new AppRuntimeDataError("RECORD_READ_FAILED", "Не удалось прочитать запись.");
  }
  if (!data) throw new AppRuntimeDataError("RECORD_NOT_FOUND", "Запись не найдена.");
  const row = mapRecord(data as unknown as Record<string, unknown>);
  requireRecordScope(access.config, access.actor, policyRecord(row));
  return row;
}

export async function listRecords(
  access: RuntimeAccessContext,
  entityKey: string,
  options: ListRecordsOptions = {},
): Promise<AppRecordRow[]> {
  try {
    requirePermission(access.config, access.actor, "view", entityKey);
    const limit = normalizeRecordPageSize(options.limit);
    const before = normalizeBefore(options.before);
    let query = supabaseAdmin
      .from("app_records")
      .select("*")
      .eq("project_id", access.projectId)
      .eq("entity_key", entityKey)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (before) query = query.lt("created_at", before);
    if (shouldOwnRecord(access.config, entityKey) && !access.isOwner && access.actor.roleKey !== "admin") {
      query = query.eq("owner_member_id", access.actor.memberId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("app-runtime: record list failed", error);
      throw new AppRuntimeDataError("RECORD_LIST_FAILED", "Не удалось получить записи.");
    }
    return (data ?? []).map((row) => mapRecord(row as unknown as Record<string, unknown>));
  } catch (error) {
    throw toDataError(error);
  }
}

export async function getRecord(
  access: RuntimeAccessContext,
  entityKey: string,
  recordId: string,
): Promise<AppRecordRow> {
  try {
    requirePermission(access.config, access.actor, "view", entityKey);
    return await loadRecord(access, recordId, entityKey);
  } catch (error) {
    throw toDataError(error);
  }
}

export async function createRecord(
  access: RuntimeAccessContext,
  entityKey: string,
  input: Record<string, unknown>,
): Promise<AppRecordRow> {
  try {
    requirePermission(access.config, access.actor, "create", entityKey);
    const clean = validateRecordInput(access.config, entityKey, input, "create");
    const ownerMemberId = shouldOwnRecord(access.config, entityKey) ? access.actorMemberId : null;
    const { data, error } = await supabaseAdmin
      .from("app_records")
      .insert({
        project_id: access.projectId,
        entity_key: entityKey,
        data: clean as never,
        owner_member_id: ownerMemberId,
        created_by_member_id: access.actorMemberId,
        updated_by_member_id: access.actorMemberId,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("app-runtime: record insert failed", error);
      throw new AppRuntimeDataError("RECORD_CREATE_FAILED", "Не удалось создать запись.");
    }
    const row = mapRecord(data as unknown as Record<string, unknown>);
    await audit(access, "record.create", entityKey, row.id);
    return row;
  } catch (error) {
    throw toDataError(error);
  }
}

export async function updateRecord(
  access: RuntimeAccessContext,
  entityKey: string,
  recordId: string,
  patch: Record<string, unknown>,
): Promise<AppRecordRow> {
  try {
    requirePermission(access.config, access.actor, "update", entityKey);
    const current = await loadRecord(access, recordId, entityKey);
    const clean = validateRecordInput(access.config, entityKey, patch, "update");
    if (Object.keys(clean).length === 0) return current;
    const nextData = { ...current.data, ...clean };
    const { data, error } = await supabaseAdmin
      .from("app_records")
      .update({
        data: nextData as never,
        updated_by_member_id: access.actorMemberId,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", access.projectId)
      .eq("id", recordId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      console.error("app-runtime: record update failed", error);
      throw new AppRuntimeDataError("RECORD_UPDATE_FAILED", "Не удалось изменить запись.");
    }
    const row = mapRecord(data as unknown as Record<string, unknown>);
    await audit(access, "record.update", entityKey, row.id, { fields: Object.keys(clean) });
    return row;
  } catch (error) {
    throw toDataError(error);
  }
}

export async function deleteRecord(
  access: RuntimeAccessContext,
  entityKey: string,
  recordId: string,
): Promise<{ deleted: true }> {
  try {
    requirePermission(access.config, access.actor, "delete", entityKey);
    await loadRecord(access, recordId, entityKey);
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("app_records")
      .update({
        deleted_at: now,
        updated_by_member_id: access.actorMemberId,
        updated_at: now,
      })
      .eq("project_id", access.projectId)
      .eq("id", recordId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("app-runtime: record delete failed", error);
      throw new AppRuntimeDataError("RECORD_DELETE_FAILED", "Не удалось удалить запись.");
    }
    await audit(access, "record.delete", entityKey, recordId);
    return { deleted: true };
  } catch (error) {
    throw toDataError(error);
  }
}

function getRelation(config: AppRuntimeConfig, relationId: string): AppRelationConfig {
  const relation = config.relations.find((item) => item.id === relationId);
  if (!relation) throw new AppRuntimeDataError("RELATION_NOT_FOUND", "Связь не настроена.");
  return relation;
}

function assertRelationEntities(
  access: RuntimeAccessContext,
  relation: AppRelationConfig,
  from: AppRecordRow,
  to: AppRecordRow,
): void {
  const fromEntity = getEntity(access.config, from.entityKey);
  const toEntity = getEntity(access.config, to.entityKey);
  if (fromEntity.id !== relation.fromEntityId || toEntity.id !== relation.toEntityId) {
    throw new AppRuntimeDataError("RELATION_ENTITY_MISMATCH", "Записи не соответствуют настройке связи.");
  }
}

export async function linkRecords(
  access: RuntimeAccessContext,
  relationId: string,
  fromRecordId: string,
  toRecordId: string,
): Promise<{ linked: true }> {
  try {
    if (fromRecordId === toRecordId) throw new AppRuntimeDataError("SELF_LINK", "Запись нельзя связать саму с собой.");
    const relation = getRelation(access.config, relationId);
    const fromEntity = access.config.entities.find((item) => item.id === relation.fromEntityId);
    const toEntity = access.config.entities.find((item) => item.id === relation.toEntityId);
    if (!fromEntity || !toEntity) throw new AppRuntimeDataError("RELATION_INVALID", "Настройка связи повреждена.");
    requirePermission(access.config, access.actor, "update", fromEntity.key);
    requirePermission(access.config, access.actor, "update", toEntity.key);
    const from = await loadRecord(access, fromRecordId, fromEntity.key);
    const to = await loadRecord(access, toRecordId, toEntity.key);
    assertRelationEntities(access, relation, from, to);

    if (relation.kind === "one_to_one") {
      const { data: existing, error: readError } = await supabaseAdmin
        .from("app_record_links")
        .select("id")
        .eq("project_id", access.projectId)
        .eq("relation_id", relationId)
        .or(`from_record_id.eq.${fromRecordId},to_record_id.eq.${toRecordId}`)
        .limit(1);
      if (readError) throw new AppRuntimeDataError("RELATION_READ_FAILED", "Не удалось проверить существующую связь.");
      if ((existing ?? []).length > 0) throw new AppRuntimeDataError("RELATION_CARDINALITY", "Для этой связи уже выбрана запись.");
    } else if (relation.kind === "one_to_many") {
      const { data: existing, error: readError } = await supabaseAdmin
        .from("app_record_links")
        .select("id")
        .eq("project_id", access.projectId)
        .eq("relation_id", relationId)
        .eq("to_record_id", toRecordId)
        .limit(1);
      if (readError) throw new AppRuntimeDataError("RELATION_READ_FAILED", "Не удалось проверить существующую связь.");
      if ((existing ?? []).length > 0) throw new AppRuntimeDataError("RELATION_CARDINALITY", "Эта запись уже связана с другой родительской записью.");
    }

    const { error } = await supabaseAdmin.from("app_record_links").insert({
      project_id: access.projectId,
      relation_id: relationId,
      from_record_id: fromRecordId,
      to_record_id: toRecordId,
    });
    if (error) {
      if (error.code === "23505") return { linked: true };
      console.error("app-runtime: link insert failed", error);
      throw new AppRuntimeDataError("RELATION_CREATE_FAILED", "Не удалось создать связь.");
    }
    await audit(access, "record.link", from.entityKey, from.id, { relationId, toRecordId });
    return { linked: true };
  } catch (error) {
    throw toDataError(error);
  }
}

export async function unlinkRecords(
  access: RuntimeAccessContext,
  relationId: string,
  fromRecordId: string,
  toRecordId: string,
): Promise<{ unlinked: true }> {
  try {
    const relation = getRelation(access.config, relationId);
    const fromEntity = access.config.entities.find((item) => item.id === relation.fromEntityId);
    const toEntity = access.config.entities.find((item) => item.id === relation.toEntityId);
    if (!fromEntity || !toEntity) throw new AppRuntimeDataError("RELATION_INVALID", "Настройка связи повреждена.");
    requirePermission(access.config, access.actor, "update", fromEntity.key);
    requirePermission(access.config, access.actor, "update", toEntity.key);
    await loadRecord(access, fromRecordId, fromEntity.key);
    await loadRecord(access, toRecordId, toEntity.key);

    const { error } = await supabaseAdmin
      .from("app_record_links")
      .delete()
      .eq("project_id", access.projectId)
      .eq("relation_id", relationId)
      .eq("from_record_id", fromRecordId)
      .eq("to_record_id", toRecordId);
    if (error) {
      console.error("app-runtime: link delete failed", error);
      throw new AppRuntimeDataError("RELATION_DELETE_FAILED", "Не удалось удалить связь.");
    }
    await audit(access, "record.unlink", fromEntity.key, fromRecordId, { relationId, toRecordId });
    return { unlinked: true };
  } catch (error) {
    throw toDataError(error);
  }
}
