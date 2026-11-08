export const EMAIL_TEMPLATES = {
  booking_confirmed: {
    subject: "Uw boeking is bevestigd",
    body: `Hallo {naam},

Uw boeking op {datum} is bevestigd!

Bedrijf: {bedrijf}
Dienst: {dienst}
Tijd: {tijd}
Locatie: {locatie}

Bedrag: €{bedrag}

Tot ziens!
ZekerFlex Team`,
  },
  booking_cancelled: {
    subject: "Boeking geannuleerd",
    body: `Hallo {naam},

Uw boeking op {datum} is geannuleerd.

Reden: {reden}

Mocht u vragen hebben, neem contact op.

ZekerFlex Team`,
  },
  payment_received: {
    subject: "Betaling ontvangen",
    body: `Hallo {naam},

Wij hebben uw betaling van €{bedrag} ontvangen.

Referentie: {referentie}
Datum: {datum}

Dank u wel!
ZekerFlex Team`,
  },
  invoice_ready: {
    subject: "Uw factuur is klaar",
    body: `Hallo {naam},

Uw factuur {nummer} is klaar voor download.

Periode: {periode}
Bedrag: €{bedrag}

Download hier: {link}

ZekerFlex Team`,
  },
  worker_accepted: {
    subject: "Klus aangenomen!",
    body: `Gefeliciteerd {naam}!

U hebt een klus aangenomen voor {bedrijf}.

Datum: {datum}
Tijd: {tijd}
Locatie: {locatie}
Tarief: €{tarief}/uur

Veel sterkte!
ZekerFlex Team`,
  },
  rating_request: {
    subject: "Hoe ging het?",
    body: `Hallo {naam},

We zouden graag horen hoe uw ervaring was bij {bedrijf}.

Geef hier een beoordeling: {link}

Uw feedback helpt ons beter te worden!
ZekerFlex Team`,
  },
};

export function renderTemplate(templateId: string, data: Record<string, string>): { subject: string; body: string } {
  const template = EMAIL_TEMPLATES[templateId as keyof typeof EMAIL_TEMPLATES];
  if (!template) throw new Error(`Template ${templateId} not found`);

  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(data)) {
    subject = subject.replace(`{${key}}`, value);
    body = body.replace(`{${key}}`, value);
  }

  return { subject, body };
}
