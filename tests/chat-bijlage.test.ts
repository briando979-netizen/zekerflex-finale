import { describe, expect, it } from "vitest";
import { chatOpslagType, isFotoType, isProgramma } from "@/lib/messaging/bijlage";

describe("chatbijlagen: elk type mag, maar veilig", () => {
  it("gewone soorten blijven zoals ze zijn (pdf, office, zip, audio, video, foto, exe)", () => {
    for (const t of [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/x-7z-compressed",
      "audio/webm",
      "video/mp4",
      "image/png",
      "application/x-msdownload",
      "application/vnd.android.package-archive",
      "text/csv",
    ]) {
      expect(chatOpslagType(t), t).toBe(t);
    }
  });

  it("wat een browser als pagina of script kan uitvoeren wordt een gewoon bestand", () => {
    for (const t of ["text/html", "TEXT/HTML; charset=utf-8", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml", "text/javascript", "application/javascript", "application/x-javascript", "text/x-php"]) {
      expect(chatOpslagType(t), t).toBe("application/octet-stream");
    }
  });

  it("leeg of onzin wordt een gewoon bestand", () => {
    for (const t of ["", "   ", "geen-type", "image/", "/png", "image/png\nx-evil: 1"]) {
      expect(chatOpslagType(t), JSON.stringify(t)).toBe("application/octet-stream");
    }
  });

  it("alleen echte fotoformaten worden als foto getoond, SVG niet", () => {
    expect(isFotoType("image/jpeg")).toBe(true);
    expect(isFotoType("image/heic")).toBe(true);
    expect(isFotoType("image/svg+xml")).toBe(false);
    expect(isFotoType("application/pdf")).toBe(false);
    expect(isFotoType("")).toBe(false);
  });

  it("herkent programma's en installatiebestanden voor de waarschuwing", () => {
    for (const n of ["setup.exe", "Factuur.PDF.exe", "app.apk", "script.ps1", "start.bat", "installer.msi", "tool.jar", "mac.dmg"]) {
      expect(isProgramma(n), n).toBe(true);
    }
    for (const n of ["factuur.pdf", "foto.jpg", "rooster.xlsx", "archief.zip", "notities.txt", "exe", ""]) {
      expect(isProgramma(n), n).toBe(false);
    }
  });
});
