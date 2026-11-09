import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { IosAppProvider, useInIosApp } from "@/components/app/useInIosApp";

// De lay-outs van /werkgever, /dashboard en /studio geven door of dit de iPhone-app is
// (inIosApp()). Dan weet NietInIphone het al in de server-HTML: op de website staat een
// koopknop meteen op zijn plek (geen verspringen na het laden, review 6d), in de
// iPhone-app komt hij er nooit in. Zonder lay-out blijft het "nog onbekend" (null).

function Toon() {
  return createElement("span", null, String(useInIosApp()));
}

describe("useInIosApp in de server-HTML", () => {
  it("op de website (lay-out zegt: geen iPhone): meteen false", () => {
    expect(renderToString(createElement(IosAppProvider, { ios: false }, createElement(Toon)))).toBe("<span>false</span>");
  });

  it("in de iPhone-app: meteen true", () => {
    expect(renderToString(createElement(IosAppProvider, { ios: true }, createElement(Toon)))).toBe("<span>true</span>");
  });

  it("zonder lay-out: null tot de cookie in de browser gelezen is", () => {
    expect(renderToString(createElement(Toon))).toBe("<span>null</span>");
  });
});
