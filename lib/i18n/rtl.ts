const RTL_LANGUAGES = ["ar", "he", "ur", "fa", "yi"];

export function isRTL(lang: string): boolean {
  return RTL_LANGUAGES.includes(lang);
}

export function getDirection(lang: string): "ltr" | "rtl" {
  return isRTL(lang) ? "rtl" : "ltr";
}

export function getAlign(lang: string): "left" | "right" {
  return isRTL(lang) ? "right" : "left";
}

export function getMargin(lang: string, side: "left" | "right", value: string): Record<string, string> {
  if (isRTL(lang)) {
    return side === "left" ? { marginRight: value } : { marginLeft: value };
  }
  return side === "left" ? { marginLeft: value } : { marginRight: value };
}
