/** "{naam} praat" + {naam: "Sam"} wordt "Sam praat". Een onbekende plaatshouder blijft staan. Puur: ook voor client-bestanden. */
export function vulIn(sjabloon: string, waarden: Record<string, string | number>): string {
  return sjabloon.replace(/\{(\w+)\}/gu, (heel, sleutel: string) => {
    const waarde = waarden[sleutel];
    return waarde === undefined ? heel : String(waarde);
  });
}
