import { sanitizeAiPayload, validateEventType } from "./policy";
export const WEBMASTER_AI_EVENT = "webmaster:ai-event" as const;
export interface WebMasterAiEventMessage { type: typeof WEBMASTER_AI_EVENT; version: 1; eventType: string; payload: unknown; clientTime: string; }
export function emitAiEvent(eventType: string, payload: unknown): boolean {
  if (typeof window === "undefined" || window.parent === window) return false;
  const message: WebMasterAiEventMessage = { type: WEBMASTER_AI_EVENT, version: 1, eventType: validateEventType(eventType), payload: sanitizeAiPayload(payload), clientTime: new Date().toISOString() };
  window.parent.postMessage(message, "*");
  return true;
}
export function parseAiEventMessage(value: unknown): WebMasterAiEventMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<WebMasterAiEventMessage>;
  if (row.type !== WEBMASTER_AI_EVENT || row.version !== 1 || typeof row.eventType !== "string") return null;
  try { return { type: WEBMASTER_AI_EVENT, version: 1, eventType: validateEventType(row.eventType), payload: sanitizeAiPayload(row.payload), clientTime: typeof row.clientTime === "string" ? row.clientTime : new Date().toISOString() }; } catch { return null; }
}
