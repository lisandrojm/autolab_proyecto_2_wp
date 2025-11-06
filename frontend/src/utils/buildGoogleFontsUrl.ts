export interface GoogleFontsUrlOptions {
  weights?: number[];
  display?: "swap" | "fallback" | "block" | "optional" | "auto";
}

export function buildGoogleFontsUrl(
  families: string[],
  opts?: GoogleFontsUrlOptions
): string {
  if (!families || families.length === 0) {
    return "";
  }

  const weights = opts?.weights || [400, 700];
  const display = opts?.display || "swap";

  const familyParams = families
    .map((family) => {
      const encodedFamily = family.replace(/\s+/g, "+");
      const weightStr = weights.join(";");
      return `family=${encodedFamily}:wght@${weightStr}`;
    })
    .join("&");

  return `https://fonts.googleapis.com/css2?${familyParams}&display=${display}`;
}
