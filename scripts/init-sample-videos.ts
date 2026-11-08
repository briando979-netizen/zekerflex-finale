import { prisma } from "@/lib/prisma";

const SAMPLE_VIDEOS = [
  {
    title: "Welkom bij ZekerFlex",
    description: "Een korte introductie tot het ZekerFlex platform en hoe het werkt voor flexwerkers en opdrachtgevers.",
    category: "tutorial",
    role: "general",
    durationSeconds: 420,
    thumbnailUrl: "https://via.placeholder.com/320x180?text=ZekerFlex+Intro",
    hostedOn: "vimeo" as const,
    hostId: "placeholder-intro",
    qualities: ["720p", "1080p"],
  },
  {
    title: "Hoe je een klus plaatst",
    description: "Stap voor stap gids voor opdrachtgevers om een nieuwe klus/shift op het platform te plaatsen.",
    category: "tutorial",
    role: "employer",
    durationSeconds: 300,
    thumbnailUrl: "https://via.placeholder.com/320x180?text=Klus+Plaatsen",
    hostedOn: "youtube" as const,
    hostId: "placeholder-post-shift",
    qualities: ["720p"],
  },
  {
    title: "Flexwerker registratie",
    description: "Volledige gids voor flexwerkers om zich aan te melden en hun profiel in te stellen.",
    category: "tutorial",
    role: "worker",
    durationSeconds: 480,
    thumbnailUrl: "https://via.placeholder.com/320x180?text=Registratie",
    hostedOn: "vimeo" as const,
    hostId: "placeholder-signup",
    qualities: ["720p", "1080p"],
  },
  {
    title: "Betalingen en uitbetalingen",
    description: "Hoe betalingen werken op ZekerFlex en hoe je je verdiensten kan uitbetalen.",
    category: "guide",
    role: "general",
    durationSeconds: 360,
    thumbnailUrl: "https://via.placeholder.com/320x180?text=Betalingen",
    hostedOn: "youtube" as const,
    hostId: "placeholder-payments",
    qualities: ["720p"],
  },
  {
    title: "Uren aanmelden",
    description: "Hoe flexwerkers hun gewerkte uren correct aanmelden en bevestigen.",
    category: "tutorial",
    role: "worker",
    durationSeconds: 240,
    thumbnailUrl: "https://via.placeholder.com/320x180?text=Uren+Aanmelden",
    hostedOn: "vimeo" as const,
    hostId: "placeholder-hours",
    qualities: ["720p"],
  },
  {
    title: "Succesverhaal: Een drukke horeca zaak",
    description: "Hoe een horeca zaak ZekerFlex gebruikt om snel flexwerkers in te huren.",
    category: "story",
    role: "employer",
    durationSeconds: 600,
    thumbnailUrl: "https://via.placeholder.com/320x180?text=Succesverhaal",
    hostedOn: "youtube" as const,
    hostId: "placeholder-story",
    qualities: ["1080p"],
  },
  {
    title: "Veelgestelde vragen",
    description: "Antwoorden op de meestgestelde vragen van ZekerFlex gebruikers.",
    category: "faq",
    role: "general",
    durationSeconds: 180,
    thumbnailUrl: "https://via.placeholder.com/320x180?text=FAQ",
    hostedOn: "vimeo" as const,
    hostId: "placeholder-faq",
    qualities: ["720p"],
  },
];

async function initSampleVideos() {
  console.log("Initializing sample videos...");

  try {
    for (const video of SAMPLE_VIDEOS) {
      const existing = await prisma.video.findFirst({
        where: { title: video.title },
      });

      if (existing) {
        console.log(`✓ Video "${video.title}" already exists`);
        continue;
      }

      await prisma.video.create({
        data: {
          ...video,
          views: 0,
          watchTime: 0,
        },
      });

      console.log(`✓ Created video: "${video.title}"`);
    }

    console.log("✅ Sample videos initialized successfully!");
  } catch (error) {
    console.error("Error initializing sample videos:", error);
    process.exit(1);
  }
}

initSampleVideos();
