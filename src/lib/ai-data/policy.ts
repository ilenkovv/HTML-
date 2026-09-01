const EVENT_TYPE_RE = /^[a-z0-9][a-z0-9._:-]{0,79}$/iu;
const SECRET_KEY_RE = /(password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|session|private[_-]?key)/iu;
const MAX_DEPTH = 8;
const MAX_STRING = 16_000;
const MAX_ARRAY = 1_000;
const MAX_OBJECT_KEYS = 500;
export class AiDataValidationError extends Error {}
export function validateEventType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!EVENT_TYPE_RE.test(normalized)) throw new AiDataValidationError("Некорректный тип события");
  return normalized;
}
export function sanitizeAiPayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) throw new AiDataValidationError("Слишком глубокая структура данных");
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") { if (value.length > MAX_STRING) throw new AiDataValidationError("Слишком длинное текстовое поле"); return value; }
  if (Array.isArray(value)) { if (value.length > MAX_ARRAY) throw new AiDataValidationError("Слишком большой массив данных"); return value.map((item) => sanitizeAiPayload(item, depth + 1)); }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_OBJECT_KEYS) throw new AiDataValidationError("Слишком много полей в объекте");
    const clean: Record<string, unknown> = {};
    for (const [key, item] of entries) { if (SECRET_KEY_RE.test(key)) throw new AiDataValidationError(`Поле «${key}» похоже на секрет и не может быть сохранено в Базе ИИ`); clean[key] = sanitizeAiPayload(item, depth + 1); }
    return clean;
  }
  throw new AiDataValidationError("Неподдерживаемый тип данных");
}
export function isTrainingEligible(example: { status: string; input: unknown; output: unknown | null; qualityScore: number | null; }): boolean {
  return example.status === "training_ready" && example.output !== null && example.input !== null && (example.qualityScore === null || example.qualityScore >= 60);
}
