import { Instrument_Serif } from "next/font/google";

// De koppenletter van de webshop: de schreefzus van Instrument Sans (de
// tekstletter van de hele site). Alleen in app/shop/layout.tsx gebruikt, dus de
// rest van de site laadt hem niet. Net als lib/fonts.ts zelf gehost via next/font.
export const fontSerif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});
