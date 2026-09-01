export interface DatabaseErrorLike { code?: string | null; message?: string | null; }
export interface ReservationResult<T> { data: T | null; error: DatabaseErrorLike | null; }
export interface ReservedVersion<T> { version: number; reservation: T; attempts: number; }

export class VersionReservationError extends Error {
  readonly attempts: number;
  readonly lastError: DatabaseErrorLike | null;
  constructor(message: string, attempts: number, lastError: DatabaseErrorLike | null) {
    super(message); this.name = "VersionReservationError"; this.attempts = attempts; this.lastError = lastError;
  }
}

export function isUniqueViolation(error: unknown): error is DatabaseErrorLike {
  return !!error && typeof error === "object" && "code" in error && (error as DatabaseErrorLike).code === "23505";
}

export async function reserveVersionWithRetry<T>(options: { nextVersion: () => Promise<number>; reserve: (version: number) => Promise<ReservationResult<T>>; maxAttempts?: number; }): Promise<ReservedVersion<T>> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError("maxAttempts must be a positive integer");
  let lastCandidate = 0;
  let lastError: DatabaseErrorLike | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const queried = await options.nextVersion();
    if (!Number.isInteger(queried) || queried < 1) throw new VersionReservationError("Invalid version candidate", attempt, null);
    const candidate = Math.max(queried, lastCandidate + 1);
    lastCandidate = candidate;
    const result = await options.reserve(candidate);
    if (!result.error && result.data) return { version: candidate, reservation: result.data, attempts: attempt };
    lastError = result.error;
    if (!isUniqueViolation(result.error)) throw new VersionReservationError("Unable to reserve application version", attempt, result.error);
  }
  throw new VersionReservationError("Unable to reserve application version after concurrent conflicts", maxAttempts, lastError);
}

export function shouldAdvanceCurrentVersion(currentVersion: number, candidateVersion: number): boolean {
  return Number.isInteger(currentVersion) && Number.isInteger(candidateVersion) && currentVersion >= 0 && candidateVersion > currentVersion;
}

export function nextMonotonicCurrentVersion(currentVersion: number, candidateVersion: number): number {
  return shouldAdvanceCurrentVersion(currentVersion, candidateVersion) ? candidateVersion : currentVersion;
}

export interface VersionTransactionState { committed: boolean; reservationId: string | null; ownedPrefix: string; createdPaths: readonly string[]; }
export interface VersionCleanupPlan { reservationId: string | null; paths: string[]; }

function normalizePrefix(prefix: string): string { return prefix.replace(/^\/+|\/+$/g, ""); }

export function buildVersionCleanupPlan(state: VersionTransactionState): VersionCleanupPlan {
  if (state.committed) return { reservationId: null, paths: [] };
  const prefix = normalizePrefix(state.ownedPrefix);
  const prefixWithSlash = prefix ? `${prefix}/` : "";
  const paths = [...new Set(state.createdPaths)].filter((path) => {
    const normalized = path.replace(/^\/+/, "");
    return prefixWithSlash !== "" && normalized.startsWith(prefixWithSlash);
  });
  return { reservationId: state.reservationId, paths };
}

export interface ProjectVersionSnapshot { currentVersion: number; url: string; hosting: string; advanced: unknown; status: string; }
export function projectSnapshotAfterAttempt<T extends ProjectVersionSnapshot>(previous: T, candidate: T, committed: boolean): T { return committed ? candidate : previous; }
