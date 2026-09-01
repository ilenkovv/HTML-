export interface PublishedPathOptions {
  spaFallback: boolean;
  custom404: boolean;
}

export type PublishedPathResolution =
  | { kind: "asset"; path: string; status: 200 | 404; reason: "entry" | "exact" | "spa-fallback" | "custom-404" }
  | { kind: "not-found"; status: 404; reason: "invalid-path" | "missing" };

function unsafeRuntimePath(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value) || value.includes("\\");
}

function canonicalRequestedPath(rawPath: string): { path: string; trailingSlash: boolean } | null {
  if (unsafeRuntimePath(rawPath)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (unsafeRuntimePath(decoded)) return null;
  const withoutLeadingSlash = decoded.replace(/^\/+/, "");
  const trailingSlash = withoutLeadingSlash.endsWith("/");
  const parts: string[] = [];
  for (const segment of withoutLeadingSlash.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    parts.push(segment);
  }
  return { path: parts.join("/"), trailingSlash };
}

function looksExtensionless(path: string, trailingSlash: boolean): boolean {
  if (trailingSlash) return true;
  const last = path.split("/").at(-1) ?? "";
  return last !== "" && !last.includes(".");
}

export function resolvePublishedPath(requestedPath: string, entryPath: string, fileList: readonly string[], options: PublishedPathOptions): PublishedPathResolution {
  const request = canonicalRequestedPath(requestedPath);
  if (!request) return { kind: "not-found", status: 404, reason: "invalid-path" };
  const files = new Set(fileList);
  if (request.path === "") return files.has(entryPath) ? { kind: "asset", path: entryPath, status: 200, reason: "entry" } : { kind: "not-found", status: 404, reason: "missing" };
  if (files.has(request.path)) return { kind: "asset", path: request.path, status: 200, reason: "exact" };
  if (options.spaFallback && looksExtensionless(request.path, request.trailingSlash) && files.has(entryPath)) return { kind: "asset", path: entryPath, status: 200, reason: "spa-fallback" };
  if (options.custom404 && files.has("404.html")) return { kind: "asset", path: "404.html", status: 404, reason: "custom-404" };
  return { kind: "not-found", status: 404, reason: "missing" };
}

export function cacheControlForPublishedAsset(path: string, cacheEnabled: boolean, versioned: boolean): string {
  if (!cacheEnabled) return "no-store";
  if (/\.html?$/iu.test(path)) return "no-cache";
  return versioned ? "public, max-age=31536000, immutable" : "no-cache";
}
