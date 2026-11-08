// ---------------------------------------------------------------------------
// Partner Portal — Partner self-service, resources, communication
// Subsystem 6/6 for production Partner & Affiliate Management
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

export interface PortalResource {
  id: string;
  title: string;
  description: string;
  category: 'GUIDE' | 'TEMPLATE' | 'TOOL' | 'TRAINING' | 'CASE_STUDY';
  url: string;
  downloadUrl?: string;
  publishedAt: Date;
  updatedAt: Date;
}

export interface PartnerNotification {
  id: string;
  affiliateId: string;
  type: 'PAYOUT' | 'PROMOTION' | 'ALERT' | 'NEWS' | 'TIP';
  title: string;
  message: string;
  actionUrl?: string;
  read: boolean;
  createdAt: Date;
}

/**
 * Get partner portal dashboard data
 */
export async function getPortalDashboard(affiliateId: string) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: {
      trackings: true,
      commissions: true,
      payouts: true,
    },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  const pendingCommissions = affiliate.commissions.filter((c) => c.status === 'PENDING');
  const approvedCommissions = affiliate.commissions.filter((c) => c.status === 'APPROVED');

  return {
    affiliateId,
    name: affiliate.name,
    email: affiliate.email,
    tier: affiliate.tier,
    status: affiliate.status,
    joinedAt: affiliate.joinedAt,
    stats: {
      totalEarnings: affiliate.totalEarnings,
      totalConversions: affiliate.totalConversions,
      commissionRate: affiliate.commissionRate,
      lastPayoutAt: affiliate.lastPayoutAt,
    },
    pending: {
      commissionsCents: pendingCommissions.reduce((sum, c) => sum + c.amount, 0),
      commissionsCount: pendingCommissions.length,
      approvedCents: approvedCommissions.reduce((sum, c) => sum + c.amount, 0),
      approvedCount: approvedCommissions.length,
    },
    recentPayouts: affiliate.payouts.slice(0, 5),
    recentTrackings: affiliate.trackings.slice(0, 10),
  };
}

/**
 * Get partner resources
 */
export async function getPartnerResources(category?: PortalResource['category']): Promise<PortalResource[]> {
  // In a real system, these would be fetched from a database
  const resources: PortalResource[] = [
    {
      id: '1',
      title: 'Gids voor partneronboarding',
      description: 'Stap-voor-stap handleiding voor het starten als ZekerFlex partner',
      category: 'GUIDE',
      url: 'https://zekerflex.nl/partners/onboarding-guide',
      publishedAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-11-01'),
    },
    {
      id: '2',
      title: 'Marketingsjablonen',
      description: 'Voorgemaakte e-mailsjablonen en socialmedia-posts',
      category: 'TEMPLATE',
      url: 'https://zekerflex.nl/partners/templates',
      downloadUrl: 'https://zekerflex.nl/partners/templates/download',
      publishedAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-10-15'),
    },
    {
      id: '3',
      title: 'Commissiecalculator',
      description: 'Interactieve tool om potentiële inkomsten te berekenen',
      category: 'TOOL',
      url: 'https://zekerflex.nl/partners/calculator',
      publishedAt: new Date('2024-03-01'),
      updatedAt: new Date('2024-11-01'),
    },
    {
      id: '4',
      title: 'Partner training — basis',
      description: 'Video-training over het partnerprogram en beste praktijken',
      category: 'TRAINING',
      url: 'https://zekerflex.nl/partners/training/basics',
      publishedAt: new Date('2024-04-01'),
      updatedAt: new Date('2024-10-01'),
    },
    {
      id: '5',
      title: 'Case Study: Succesvolle recruiter',
      description: 'Hoe een ZekerFlex-partner in 6 maanden €15k verdiende',
      category: 'CASE_STUDY',
      url: 'https://zekerflex.nl/partners/case-study/recruiter-1',
      publishedAt: new Date('2024-05-01'),
      updatedAt: new Date('2024-10-15'),
    },
  ];

  if (category) {
    return resources.filter((r) => r.category === category);
  }

  return resources;
}

/**
 * Get partner notifications
 */
export async function getPartnerNotifications(
  affiliateId: string,
  opts?: {
    unreadOnly?: boolean;
    type?: PartnerNotification['type'];
    limit?: number;
  }
): Promise<PartnerNotification[]> {
  // In a real system, fetch from database
  const notifications: PartnerNotification[] = [
    {
      id: '1',
      affiliateId,
      type: 'PAYOUT',
      title: 'Je uitbetaling is verwerkt',
      message: '€1,250 is verwerkt en komt binnen 2 werkdagen aan',
      actionUrl: 'https://zekerflex.nl/partners/payouts',
      read: false,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: '2',
      affiliateId,
      type: 'PROMOTION',
      title: 'Promotiemaand: extra 5% commissie',
      message: 'In november krijg je 5% extra op alle referrals',
      actionUrl: 'https://zekerflex.nl/partners/promotion',
      read: true,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: '3',
      affiliateId,
      type: 'ALERT',
      title: 'Handmatige goedkeuring vereist',
      message: 'Je verwijzingslink heeft verdachte activiteit,handmatig herzien nodig',
      actionUrl: 'https://zekerflex.nl/partners/referrals',
      read: true,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ];

  let filtered = notifications.filter((n) => n.affiliateId === affiliateId);

  if (opts?.unreadOnly) {
    filtered = filtered.filter((n) => !n.read);
  }

  if (opts?.type) {
    filtered = filtered.filter((n) => n.type === opts.type);
  }

  return filtered.slice(0, opts?.limit || 10);
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  // In a real system, update the database
  console.log(`Marked notification ${notificationId} as read`);
}

/**
 * Send message to partner support
 */
export async function sendSupportMessage(
  affiliateId: string,
  subject: string,
  message: string
): Promise<{ messageId: string; status: string }> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  // Send to support team
  try {
    await sendEmail({
      to: 'partners@zekerflex.nl',
      cc: affiliate.email,
      subject: `Partner Support: ${subject}`,
      html: `
        <h2>Nieuw ondersteuningsverzoek van partner</h2>
        <p><strong>Partner:</strong> ${affiliate.name} (${affiliateId})</p>
        <p><strong>Email:</strong> ${affiliate.email}</p>
        <p><strong>Onderwerp:</strong> ${subject}</p>
        <p><strong>Bericht:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send support message', err);
  }

  return {
    messageId: `msg_${Date.now()}`,
    status: 'SENT',
  };
}

/**
 * Get FAQ for partners
 */
export async function getPartnerFAQ(): Promise<{ question: string; answer: string }[]> {
  return [
    {
      question: 'Wanneer word ik betaald?',
      answer: `Je aanbrengbonus van €100 krijg je zodra jouw opdrachtgever zijn eerste klus heeft laten uitvoeren.
        De doorlopende commissie (meestal 20% van de platformfee) wordt maandelijks uitbetaald over de daadwerkelijk gewerkte uren.`,
    },
    {
      question: 'Hoe veel kan ik verdienen?',
      answer: `Dat hangt af van hoeveel klanten je aanbrengt en hoe actief zij zijn.
        Eén klant die 40 uur/week laat werken kan je maandelijks ongeveer €250-400 opleveren, een jaar lang.`,
    },
    {
      question: 'Zijn er verbergen kosten?',
      answer: `Nee. Je werkt als zzp'er, bepaalt zelf je uren en tempo, en er is geen target of boete.
        Je investeert je tijd; wij betalen uit resultaat.`,
    },
    {
      question: 'Kan ik meer verdienen als ik meer klanten breng?',
      answer: `Ja! Afhankelijk van je tier kun je een hoger commissiepercentage krijgen naarmate je meer verdient.`,
    },
    {
      question: 'Hoe track ik mijn verdiensten?',
      answer: `Via je partner-portaal zie je real-time je verwijzingen, conversies, commissies en geplande uitbetalingen.`,
    },
    {
      question: 'Kan ik ook freelancers aanbrengen?',
      answer: `Ja! Voor elke freelancer die je aanbrengt en die zijn eerste klus voltooit, krijg je €25.`,
    },
  ];
}

/**
 * Get partner tier benefits
 */
export async function getPartnerTierBenefits(): Promise<Record<string, any>> {
  return {
    SILVER: {
      name: 'Silver',
      commission: '10%',
      benefits: [
        'Basis marketing-materiaal',
        'Maandelijkse affiliate-updates',
        'Partner-community toegang',
        'Standaard support',
      ],
    },
    GOLD: {
      name: 'Gold',
      commission: '15%',
      benefits: [
        'Alles van Silver',
        'Dedicated account manager',
        'Geavanceerde marketing-tools',
        'Co-marketing mogelijkheden',
        'Prioriteitsupport',
      ],
    },
    PLATINUM: {
      name: 'Platinum',
      commission: '20%',
      benefits: [
        'Alles van Gold',
        'Maatwerk programmering',
        'Exclusief territoium',
        'VIP-events en training',
        'Direct contact met leadership',
      ],
    },
  };
}

/**
 * Generate referral link for sharing
 */
export async function generateSharingContent(affiliateId: string): Promise<{
  shortLink: string;
  twitterText: string;
  linkedinText: string;
  emailSubject: string;
  emailBody: string;
}> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
  });

  if (!affiliate) throw new Error('Affiliate not found');

  const link = `https://zekerflex.nl/ref/${affiliate.code}`;

  return {
    shortLink: link,
    twitterText: `Werk flexibel! Join ZekerFlex via mijn link en verdien je eerste klus. #Flexwerk #Verdienen`,
    linkedinText: `Ik ben partner bij ZekerFlex en help bedrijven hun uitzendkrachten te vinden.
      Wil je beter geld verdienen als freelancer? Check het uit!`,
    emailSubject: 'Verdien mee met ZekerFlex!',
    emailBody: `Hoi,

Ik ben begonnen als ZekerFlex partner en verdien er goed mee.
Wil jij ook meerdoen? Join via mijn link: ${link}

Dit is wat ik doe:
- Ik breng bedrijven naar ZekerFlex
- Ze krijgen flexkrachten en freelancers
- Ik verdien commissie op hun uitgaven

Makkelijk en lucratief!

Groeten`,
  };
}

/**
 * Get partner community resources
 */
export async function getCommunityResources(): Promise<any[]> {
  return [
    {
      id: '1',
      type: 'FORUM',
      title: 'Partner-forum',
      description: 'Vraag en antwoord met andere partners',
      url: 'https://zekerflex.nl/partners/forum',
    },
    {
      id: '2',
      type: 'WEBINAR',
      title: 'Maandelijkse webinar',
      description: 'Leer van topperformers',
      url: 'https://zekerflex.nl/partners/webinar',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      id: '3',
      type: 'NEWSLETTER',
      title: 'Partner-nieuwsbrief',
      description: 'Tips, trucs en updates',
      url: 'https://zekerflex.nl/partners/newsletter',
    },
  ];
}
