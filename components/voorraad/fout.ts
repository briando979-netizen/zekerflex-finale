/** De Nederlandse foutmelding uit een API-antwoord, of de standaardtekst. */
export async function leesFout(res: Response, standaard: string): Promise<string> {
  const d = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return d?.error?.message ?? standaard;
}
