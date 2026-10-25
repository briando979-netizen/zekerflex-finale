// Veilig naar het klembord kopiëren. navigator.clipboard bestaat NIET in een
// onveilige context, oudere browsers of de Android-webview — daar gooit een
// directe writeText een fout. Deze helper probeert de Clipboard API en valt
// anders terug op een verborgen textarea + execCommand. Gooit nooit.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof window !== "undefined" && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* val terug op de execCommand-methode hieronder */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
