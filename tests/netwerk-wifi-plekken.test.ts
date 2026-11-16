import { describe, expect, it } from "vitest";
import { wifiPlekken, type WifiPlek } from "@/lib/netwerk/wifi-plekken";

// Werkgever → Wifi en VPN → Wifi instellen (16 nov 2026): elke klus op een los adres maakt een eigen eenmalige
// vestiging, dus hetzelfde adres stond er per klus opnieuw (Grote Houtstraat in Haarlem 4×). Elk adres één keer.

const vast = (id: string, naam: string, adres: string, plaats: string): WifiPlek => ({ id, naam, plaats, adres, eenmalig: false });
const los = (id: string, adres: string, plaats: string): WifiPlek => ({ id, naam: `Eenmalige locatie — ${adres}`, plaats, adres, eenmalig: true });
const ids = (rijen: WifiPlek[]) => rijen.map((r) => r.id);
const zonderWifi = () => false;

describe("wifiPlekken", () => {
  it("een eenmalig adres staat er één keer, de eerste; de volgorde blijft", () => {
    const rijen = [
      vast("v1", "Hoofdkantoor", "Markt 1", "Utrecht"),
      los("a1", "Grote Houtstraat 144O-L, 2011SW Haarlem", "Haarlem"),
      los("a2", "Grote Houtstraat 144O-L, 2011SW Haarlem", "Haarlem"),
      los("b1", "Het Hoge Rot 3, Hernen", "Hernen"),
      los("a3", "grote houtstraat 144O-L,  2011SW Haarlem", "Haarlem"),
      los("b2", "Het Hoge Rot 3, Hernen", "Hernen"),
      los("a4", "Grote Houtstraat 144O-L, 2011SW Haarlem", "Haarlem"),
    ];
    expect(ids(wifiPlekken(rijen, zonderWifi))).toEqual(["v1", "a1", "b1"]);
  });

  it("staat er al wifi op een dubbele, dan blijft die (er verdwijnt geen instelling)", () => {
    const rijen = [los("a1", "Grote Houtstraat 144, Haarlem", "Haarlem"), los("a2", "Grote Houtstraat 144, Haarlem", "Haarlem"), los("a3", "Grote Houtstraat 144, Haarlem", "Haarlem")];
    expect(ids(wifiPlekken(rijen, (id) => id === "a2"))).toEqual(["a2"]);
    expect(ids(wifiPlekken(rijen, (id) => id !== "a1"))).toEqual(["a2", "a3"]);
  });

  it("vaste vestigingen blijven allemaal staan, ook op hetzelfde adres; verschillende adressen ook", () => {
    const rijen = [vast("v1", "Winkel", "Markt 1", "Utrecht"), vast("v2", "Magazijn", "Markt 1", "Utrecht"), los("a1", "Markt 1, Utrecht", "Utrecht"), los("b1", "Jo Hansenstraat 2, Roermond", "Roermond")];
    expect(ids(wifiPlekken(rijen, zonderWifi))).toEqual(["v1", "v2", "a1", "b1"]);
    expect(wifiPlekken([], zonderWifi)).toEqual([]);
  });
});
