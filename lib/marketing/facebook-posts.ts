/**
 * Facebook Organic Posts for ZekerFlex Page
 * Dutch, authentic, bedrijven-focused posts
 * No ads budget needed—pure organic reach
 */

export interface FacebookPost {
  content: string;
  cta?: string;
  hashtags?: string;
  bestTimeToPost?: string; // e.g., "Tuesday 10am"
}

/**
 * Post 1: "No BS Flexwerk" Proof
 * Hook: Real workers, real results
 */
export function facebookPostProof(): FacebookPost {
  return {
    content: `500+ geverifieerde flexwerkers. Echte profielen. Geen neppers.

Dat is ons bewijsstuk.

Geen "1 op de 10 accepteert je klus". Geen wachtrijen.
Klus plaatsen → 24h match → Klaar.

Echt flexwerk voor bedrijven die niet willen wachten.

Wie herken je hier? 👇`,

    cta: "Probeer het gratis",
    hashtags: "#Flexwerk #ZekerFlex #NoBSWerk",
    bestTimeToPost: "Dinsdag 10:00",
  };
}

/**
 * Post 2: "24h Guarantee" Speed
 * Hook: Speed is a feature
 */
export function facebookPostSpeed(): FacebookPost {
  return {
    content: `Pieken niet meer.

Morgen heb je 3 extra mensen nodig. Overmorgen zijn ze weg.
Normale uitzendbureaus? Wachtrij. Drie dagen. Fout.

Met ZekerFlex:
✓ Klus plaatsen vandaag
✓ Match morgenochtend
✓ Aan het werk morgen

Hoe doen we het?
500+ flexwerkers. Gescreend. Klaar om te gaan.

Zeg maar dag tegen "jammer, kan niet op tijd".`,

    cta: "Jouw eerste klus",
    hashtags: "#Flexwerk #Snelheid #ZekerFlex",
    bestTimeToPost: "Woensdag 14:00",
  };
}

/**
 * Post 3: "Real Workers, Real Results" Case-ish
 * Hook: Proof without naming names
 */
export function facebookPostResults(): FacebookPost {
  return {
    content: `Vorige week:

Bedrijf in Rotterdam had dinsdag pieken.
Donderdag 10 uur nodig. Vrijdag noodtoestand.

Met ZekerFlex:
• Dinsdag klus plaatst
• Woensdag match (3 keuzes)
• Donderdag aan het werk

Ze hebben ons nu in het bakje. 😊

Jij bent volgende. Klus plaatsen, wij matchen.

zekerflex.com/klus-plaatsen`,

    cta: "Schrijf je klus",
    hashtags: "#Flexwerk #Bewezen #ZekerFlex",
    bestTimeToPost: "Maandag 09:00",
  };
}

/**
 * Post 4: Team Post (behind-the-scenes feel)
 * Hook: Trust + authenticity
 */
export function facebookPostTeam(): FacebookPost {
  return {
    content: `Hoe kiezen we 500+ flexwerkers?

Niet op willekeur. Niet op "wie zich aanmeldt".

Stap 1: ID-check (echt)
Stap 2: Werkrecht-check (echt)
Stap 3: Profile-vragen (werkgever + werker)

Ja, het is gedoe. Ja, het kost tijd.

Maar zo zeg ik tegen bedrijven: "Je krijgt de goede mensen."

En dat is het punt.

Wil je ook die zekerheid?
zekerflex.com/for-companies-v2`,

    cta: "Lees meer",
    hashtags: "#ZekerFlex #Transparantie #Flexwerk",
    bestTimeToPost: "Donderdag 11:00",
  };
}

/**
 * Post 5: Myth-busting
 * Hook: Counter common objections
 */
export function facebookPostMyth(): FacebookPost {
  return {
    content: `Mythe: "Flexwerk is duur en traag."

Feit: We zijn sneller dan traditionele kantoren.

€ 3,50/uur (volle prijs)
24h match
500+ geverifieerde mensen

Traditioneel?
€ 25/uur (uitzendbureau)
3-5 dagen wachten
Random match

Niet meer gelijk, toch?

Klus plaatsen → klaar.
zekerflex.com/klus-plaatsen`,

    cta: "Probeer nu",
    hashtags: "#Flexwerk #Prijs #Snelheid",
    bestTimeToPost: "Vrijdag 15:00",
  };
}

/**
 * Post 6: Social Proof (simple numbers)
 * Hook: Credibility through scale
 */
export function facebookPostNumbers(): FacebookPost {
  return {
    content: `Vorig jaar:
❌ 0 bedrijven
📈 Nu?
✅ 500+ flexwerkers in het systeem
✅ 24h matchtime
✅ 0 BS

Klein? Ja.
Echt? Ja.

Volgende maand: nog meer.

Word je nummer volgende?
zekerflex.com/for-companies-v2`,

    cta: "Deel je klus",
    hashtags: "#Flexwerk #Groei #ZekerFlex",
    bestTimeToPost: "Dinsdag 10:00",
  };
}

/**
 * Post 7: Call-out (direct to businesses)
 * Hook: Direct challenge
 */
export function facebookPostCallout(): FacebookPost {
  return {
    content: `Zeg me één ding:

Hoe lang wacht je normaal op flexwerkers?

...

Ja. Te lang.

Dat gaan we veranderen.

24h match, echte mensen, nul gedoe.

Deel even in comments: hoe veel uur per week heb je nodig?
👇👇👇`,

    cta: "Reageer in comments",
    hashtags: "#Flexwerk #ZekerFlex #NulGedoe",
    bestTimeToPost: "Woensdag 09:30",
  };
}

/**
 * Utility: Get all posts in order
 */
export function allFacebookPosts(): FacebookPost[] {
  return [
    facebookPostProof(),
    facebookPostSpeed(),
    facebookPostResults(),
    facebookPostTeam(),
    facebookPostMyth(),
    facebookPostNumbers(),
    facebookPostCallout(),
  ];
}

export interface FacebookCampaignConfig {
  /** How many posts per week */
  postsPerWeek: number;
  /** Day of week to start posting (0 = Sunday, 1 = Monday, etc.) */
  startDay: number;
  /** Time to post (24h format, e.g., "10:00") */
  postTime: string;
}

export const facebookDefaults: FacebookCampaignConfig = {
  postsPerWeek: 3,
  startDay: 1, // Monday
  postTime: "10:00",
};

/**
 * Posting strategy:
 *
 * Week 1: Posts 1-2 (proof + speed)
 * Week 2: Posts 3-4 (results + team)
 * Week 3: Posts 5-6 (myth-bust + numbers)
 * Week 4: Posts 7 + engagement
 * Then cycle or mix based on engagement
 *
 * Engagement tactics:
 * - Respond to ALL comments in first 2 hours
 * - Ask questions (yes/no, fill-in-the-blank)
 * - Like + comment on other's posts (5-10 per day)
 * - Share to company page + relevant groups
 *
 * Avoid:
 * - Overly salesy tone (we have this, so we're good!)
 * - Direct product shots
 * - Too many links (max 1 per post)
 * - Posting same time every day (varies = better reach)
 *
 * Best times (Facebook Netherlands):
 * - Mon-Wed 10:00-11:00 (work browsing)
 * - Wed-Thu 14:00-15:00 (afternoon break)
 * - Fri 15:00-16:00 (end of week wind-down)
 *
 * Metrics to watch:
 * - Engagement rate (comments + shares, not just likes)
 * - Click-through to website (use UTM: ?utm_source=facebook)
 * - Follower growth (1-5% weekly is healthy growth)
 * - Share of voice (how much your post shows vs competitors)
 */

/**
 * Post scheduling helper
 * Returns array of ISO dates for posting
 */
export function schedulePostsForWeek(startDate: Date, config: FacebookCampaignConfig): Date[] {
  const posts: Date[] = [];
  const allPosts = allFacebookPosts();

  for (let i = 0; i < config.postsPerWeek && i < allPosts.length; i++) {
    const daysFromStart = (config.startDay + i * 2) % 7; // Space out by 2 days
    const postDate = new Date(startDate);
    postDate.setDate(postDate.getDate() + daysFromStart);
    const timeParts = config.postTime.split(":").map(Number);
    const hours = timeParts[0] ?? 9;
    const minutes = timeParts[1] ?? 0;
    postDate.setHours(hours, minutes, 0, 0);
    posts.push(postDate);
  }

  return posts;
}
