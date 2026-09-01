export interface DetectedFieldCandidate {
  key: string;
  label?: string;
  inputType?: string;
  required?: boolean;
  source?: "form" | "localStorage";
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(re);
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim() || undefined;
}

function cleanFieldKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  if (!key || key.length > 120) return undefined;
  if (!/^[\p{L}\p{N}_.:-]+$/u.test(key)) return undefined;
  return key;
}

export function detectFieldCandidates(html: string): DetectedFieldCandidate[] {
  const out = new Map<string, DetectedFieldCandidate>();
  const put = (candidate: DetectedFieldCandidate) => {
    const key = cleanFieldKey(candidate.key);
    if (!key) return;
    const normalized = key.toLocaleLowerCase();
    if (out.has(normalized)) return;
    out.set(normalized, { ...candidate, key });
  };

  for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = match[0];
    const kind = match[1]!.toLowerCase();
    const inputType = kind === "input" ? (attr(tag, "type") ?? "text").toLowerCase() : kind;
    if (["submit", "button", "reset", "image"].includes(inputType)) continue;
    const key = cleanFieldKey(attr(tag, "name") ?? attr(tag, "id") ?? attr(tag, "data-field"));
    if (!key) continue;
    put({
      key,
      label: attr(tag, "aria-label") ?? attr(tag, "placeholder") ?? key,
      inputType,
      required: /\brequired(?:\s|=|>|$)/i.test(tag),
      source: "form",
    });
  }

  const storagePatterns = [
    /localStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*["']([^"']+)["']/gi,
    /localStorage\s*\[\s*["']([^"']+)["']\s*\]/gi,
  ];
  for (const re of storagePatterns) {
    for (const match of html.matchAll(re)) {
      const key = cleanFieldKey(match[1]);
      if (key) put({ key, label: key, inputType: "text", required: false, source: "localStorage" });
    }
  }
  return [...out.values()].slice(0, 200);
}
