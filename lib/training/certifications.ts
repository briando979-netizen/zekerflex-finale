import { prisma } from "@/lib/prisma";

export async function createCertification(data: {
  name: string;
  issuer: string;
  requiredProgramId: string;
  validityMonths: number;
  renewalRequired: boolean;
}) {
  return prisma.certification.create({
    data,
  });
}

export async function issueCertificate(userId: string, certificationId: string) {
  const cert = await prisma.certification.findUnique({ where: { id: certificationId } });
  if (!cert) return null;

  const badge = `BADGE_${cert.id}_${userId}`;

  return prisma.userCertificate.create({
    data: {
      userId,
      certificationId,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + cert.validityMonths * 30 * 24 * 60 * 60 * 1000),
      digitalBadge: badge,
      status: "ACTIVE",
    },
  });
}

export async function renewCertification(certificateId: string) {
  const cert = await prisma.userCertificate.findUnique({ where: { id: certificateId } });
  if (!cert || !cert.certification?.renewalRequired) return null;

  return prisma.userCertificate.update({
    where: { id: certificateId },
    data: {
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      renewedAt: new Date(),
      status: "RENEWED",
    },
  });
}

export async function getUserCertifications(userId: string) {
  return prisma.userCertificate.findMany({
    where: { userId },
    include: { certification: true },
    orderBy: { issuedAt: "desc" },
  });
}

export async function trackCertificationExpiry() {
  const expiring = await prisma.userCertificate.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: {
        lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    },
    include: { user: true, certification: true },
  });

  return expiring.map(cert => ({
    user: cert.user,
    certification: cert.certification,
    expiresIn: Math.floor((cert.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  }));
}

export async function getBadgeVerification(badge: string) {
  return prisma.userCertificate.findUnique({
    where: { digitalBadge: badge },
    include: { user: true, certification: true },
  });
}
