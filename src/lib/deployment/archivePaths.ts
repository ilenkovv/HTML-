const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/u;
const PERCENT_ENCODED_RE = /%[0-9a-f]{2}/iu;
const WINDOWS_DRIVE_RE = /^[a-z]:/iu;

export interface ArchivePathCollision {
  first: string;
  second: string;
  canonical: string;
}

export function canonicalArchivePath(rawPath: string): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const normalizedUnicode = rawPath.normalize("NFC");
  if (CONTROL_CHARACTER_RE.test(normalizedUnicode)) return null;
  if (normalizedUnicode.includes("\\")) return null;
  if (PERCENT_ENCODED_RE.test(normalizedUnicode)) return null;
  if (normalizedUnicode.startsWith("/")) return null;
  if (WINDOWS_DRIVE_RE.test(normalizedUnicode)) return null;
  const parts: string[] = [];
  for (const segment of normalizedUnicode.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    if (CONTROL_CHARACTER_RE.test(segment)) return null;
    parts.push(segment);
  }
  if (parts.length === 0) return null;
  return parts.join("/");
}

export function isSafeArchivePath(rawPath: string): boolean {
  return canonicalArchivePath(rawPath) !== null;
}

export function archivePathCollisionKey(rawPath: string): string | null {
  return canonicalArchivePath(rawPath)?.toLowerCase() ?? null;
}

export function findArchivePathCollision(names: readonly string[]): ArchivePathCollision | null {
  const seen = new Map<string, { raw: string; canonical: string }>();
  for (const raw of names) {
    const canonical = canonicalArchivePath(raw);
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    const previous = seen.get(key);
    if (previous) return { first: previous.raw, second: raw, canonical };
    seen.set(key, { raw, canonical });
  }
  return null;
}

export type CanonicalizeArchiveEntriesResult<T> =
  | { ok: true; files: Map<string, T> }
  | { ok: false; reason: "unsafe"; path: string }
  | { ok: false; reason: "collision"; first: string; second: string; canonical: string };

export function canonicalizeArchiveEntries<T>(entries: Iterable<readonly [string, T]>): CanonicalizeArchiveEntriesResult<T> {
  const files = new Map<string, T>();
  const rawByKey = new Map<string, string>();
  for (const [rawPath, value] of entries) {
    const canonical = canonicalArchivePath(rawPath);
    if (!canonical) return { ok: false, reason: "unsafe", path: rawPath };
    const key = canonical.toLowerCase();
    const previous = rawByKey.get(key);
    if (previous !== undefined) return { ok: false, reason: "collision", first: previous, second: rawPath, canonical };
    rawByKey.set(key, rawPath);
    files.set(canonical, value);
  }
  return { ok: true, files };
}
