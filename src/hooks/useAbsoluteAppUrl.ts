import { useEffect, useState } from "react";
import { absoluteAppUrl } from "@/lib/deployment/absoluteUrl";

export function useAbsoluteAppUrl(url: string): string {
  const [value, setValue] = useState(() => absoluteAppUrl(url, ""));
  useEffect(() => { setValue(absoluteAppUrl(url, window.location.origin)); }, [url]);
  return value;
}
