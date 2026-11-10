// ---------------------------------------------------------------------------
// De Meta Graph API voor de eigen Facebook-pagina en het eigen Instagram-zakelijk-account.
// Gratis en zonder goedkeuring van Meta zolang de app in ontwikkelmodus staat en de eigenaar
// beheerder van de app is (eigen pagina, eigen account). Het token is een paginatoken; het gaat
// alleen in de Authorization-header (nooit in een adres) en nooit in een log of antwoord.
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

export class MetaFout extends Error {
  constructor(message: string, readonly code: number | null = null) {
    super(message);
  }
}

interface GraphFoutBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

/** Een gewone zin van een Graph-fout, zonder tokens of adressen. */
export function metaFoutTekst(code: number | null, message: string | undefined): string {
  if (code === 190) return "Het token is verlopen of ingetrokken. Maak een nieuw paginatoken en vul het opnieuw in.";
  if (code === 10 || code === 200 || code === 283) return "Het token mist een recht (pages_manage_posts of instagram_content_publish). Geef die rechten bij het maken van het token.";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "Meta zegt dat er te vaak is gevraagd. Probeer het later opnieuw.";
  if (code === 368) return "Meta blokkeert het plaatsen tijdelijk (spamcontrole). Plaats dit bericht zelf.";
  const schoon = (message ?? "").replace(/https?:\/\/\S+/g, "").replace(/\b[A-Za-z0-9]{40,}\b/g, "").trim();
  return schoon ? `Meta meldt: ${schoon.slice(0, 160)}` : "Meta gaf een foutmelding zonder uitleg.";
}

async function graph<T>(pad: string, token: string, opties: { method?: "GET" | "POST"; body?: Record<string, string> } = {}): Promise<T> {
  const method = opties.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(`${GRAPH}${pad}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(method === "POST" && opties.body ? { body: new URLSearchParams(opties.body).toString() } : {}),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new MetaFout("Meta is niet bereikbaar. Probeer het later opnieuw.");
  }
  const data = (await res.json().catch(() => null)) as (T & GraphFoutBody) | null;
  if (!res.ok || !data || (data as GraphFoutBody).error) {
    const f = (data as GraphFoutBody | null)?.error;
    throw new MetaFout(metaFoutTekst(f?.code ?? null, f?.message), f?.code ?? null);
  }
  return data;
}

export interface MetaControle {
  pageId: string;
  pageNaam: string;
  igUserId: string | null;
  igNaam: string | null;
}

/** Controleert het token: welke pagina hoort erbij en is er een Instagram-zakelijk-account gekoppeld? */
export async function controleerToken(token: string): Promise<MetaControle> {
  const me = await graph<{ id: string; name?: string }>("/me?fields=id,name", token);
  let ig: { id: string; username?: string } | null = null;
  try {
    const r = await graph<{ instagram_business_account?: { id: string; username?: string } }>(
      `/${encodeURIComponent(me.id)}?fields=instagram_business_account{id,username}`,
      token,
    );
    ig = r.instagram_business_account ?? null;
  } catch {
    ig = null; // het token mag een Instagram-account missen; Facebook werkt dan nog
  }
  return { pageId: me.id, pageNaam: me.name ?? "Facebook-pagina", igUserId: ig?.id ?? null, igNaam: ig?.username ?? null };
}

/** Plaatst op de Facebook-pagina: tekst (met link) of een foto met bijschrift. Geeft het id van het bericht. */
export async function plaatsOpFacebook(
  v: { token: string; pageId: string },
  inhoud: { tekst: string; link: string; beeldUrl: string | null },
): Promise<string> {
  const pageId = encodeURIComponent(v.pageId);
  if (inhoud.beeldUrl) {
    const r = await graph<{ id?: string; post_id?: string }>(`/${pageId}/photos`, v.token, {
      method: "POST",
      body: { url: inhoud.beeldUrl, caption: inhoud.link ? `${inhoud.tekst}\n\n${inhoud.link}` : inhoud.tekst },
    });
    return r.post_id ?? r.id ?? "";
  }
  const r = await graph<{ id?: string }>(`/${pageId}/feed`, v.token, {
    method: "POST",
    body: { message: inhoud.tekst, ...(inhoud.link ? { link: inhoud.link } : {}) },
  });
  return r.id ?? "";
}

/** Plaatst op Instagram: eerst een mediacontainer, daarna publiceren. Een beeld is verplicht. */
export async function plaatsOpInstagram(
  v: { token: string; igUserId: string },
  inhoud: { tekst: string; beeldUrl: string },
): Promise<string> {
  const ig = encodeURIComponent(v.igUserId);
  const container = await graph<{ id: string }>(`/${ig}/media`, v.token, {
    method: "POST",
    body: { image_url: inhoud.beeldUrl, caption: inhoud.tekst },
  });
  const r = await graph<{ id?: string }>(`/${ig}/media_publish`, v.token, { method: "POST", body: { creation_id: container.id } });
  return r.id ?? "";
}

// --- reacties lezen en beantwoorden ("praten met ze") ---------------------------------------------
// Dezelfde paginatoken; voor het lezen en beantwoorden van reacties heeft hij de rechten
// pages_read_engagement, pages_manage_engagement (Facebook) en instagram_manage_comments (Instagram)
// nodig. Ontbreken die, dan zegt Meta dat en laat ZekerFlex de reacties met rust.

export interface GelezenReactie {
  extId: string;
  van: string;
  /** id van de schrijver (Facebook) of de gebruikersnaam (Instagram), om onze eigen reacties over te slaan */
  vanId: string;
  tekst: string;
  at: string;
  bericht: string;
  /** er staat al een antwoord onder (van ons of van iemand anders) */
  heeftAntwoord: boolean;
}

const tekstVan = (v: unknown): string => (typeof v === "string" ? v : "");

interface FbReactieRij {
  id?: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string };
  comment_count?: number;
}
interface IgReactieRij {
  id?: string;
  text?: string;
  timestamp?: string;
  username?: string;
  replies?: { data?: unknown[] };
}

/** De nieuwste reacties onder de laatste berichten van de Facebook-pagina. */
export async function haalReactiesFacebook(v: { token: string; pageId: string }): Promise<GelezenReactie[]> {
  const r = await graph<{ data?: { id?: string; message?: string; comments?: { data?: FbReactieRij[] } }[] }>(
    `/${encodeURIComponent(v.pageId)}/posts?fields=id,message,comments.limit(25){id,message,created_time,from{id,name},comment_count}&limit=8`,
    v.token,
  );
  const uit: GelezenReactie[] = [];
  for (const post of r.data ?? []) {
    for (const c of post.comments?.data ?? []) {
      if (!c.id || !tekstVan(c.message).trim()) continue;
      uit.push({
        extId: c.id,
        van: c.from?.name ?? "Iemand",
        vanId: c.from?.id ?? "",
        tekst: tekstVan(c.message).trim(),
        at: c.created_time ?? new Date().toISOString(),
        bericht: tekstVan(post.message).slice(0, 120),
        heeftAntwoord: (c.comment_count ?? 0) > 0,
      });
    }
  }
  return uit;
}

/** De nieuwste reacties onder de laatste Instagram-berichten. */
export async function haalReactiesInstagram(v: { token: string; igUserId: string }): Promise<GelezenReactie[]> {
  const r = await graph<{ data?: { id?: string; caption?: string; comments?: { data?: IgReactieRij[] } }[] }>(
    `/${encodeURIComponent(v.igUserId)}/media?fields=id,caption,comments.limit(25){id,text,timestamp,username,replies{id}}&limit=8`,
    v.token,
  );
  const uit: GelezenReactie[] = [];
  for (const m of r.data ?? []) {
    for (const c of m.comments?.data ?? []) {
      if (!c.id || !tekstVan(c.text).trim()) continue;
      uit.push({
        extId: c.id,
        van: c.username ? `@${c.username}` : "Iemand",
        vanId: c.username ?? "",
        tekst: tekstVan(c.text).trim(),
        at: c.timestamp ?? new Date().toISOString(),
        bericht: tekstVan(m.caption).slice(0, 120),
        heeftAntwoord: (c.replies?.data ?? []).length > 0,
      });
    }
  }
  return uit;
}

/** Antwoordt op een Facebook-reactie. */
export async function antwoordFacebook(token: string, commentId: string, tekst: string): Promise<string> {
  const r = await graph<{ id?: string }>(`/${encodeURIComponent(commentId)}/comments`, token, { method: "POST", body: { message: tekst } });
  return r.id ?? "";
}

/** Antwoordt op een Instagram-reactie. */
export async function antwoordInstagram(token: string, commentId: string, tekst: string): Promise<string> {
  const r = await graph<{ id?: string }>(`/${encodeURIComponent(commentId)}/replies`, token, { method: "POST", body: { message: tekst } });
  return r.id ?? "";
}
