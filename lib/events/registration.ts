import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import QRCode from "qrcode";

const registrationSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  customAnswers: z.record(z.string()).optional(),
});

export async function registerAttendee(eventId: string, data: z.infer<typeof registrationSchema>) {
  const parsed = registrationSchema.parse(data);

  const qrCodeToken = uuid();
  const qrCodeData = await QRCode.toDataURL(qrCodeToken);

  const registration = await prisma.registration.create({
    data: {
      eventId,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      customAnswers: parsed.customAnswers || {},
      qrCodeToken,
      qrCodeData,
      status: "CONFIRMED",
      registeredAt: new Date(),
    },
  });

  // Send confirmation email
  await sendConfirmationEmail(parsed.email, registration.id, parsed.firstName);

  return registration;
}

async function sendConfirmationEmail(email: string, registrationId: string, name: string) {
  // Integration with email service would go here
  console.log(`Confirmation email sent to ${email} for registration ${registrationId}`);
}

export async function getRegistration(registrationId: string) {
  return prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tickets: true, event: true },
  });
}

export async function listRegistrations(eventId: string) {
  return prisma.registration.findMany({
    where: { eventId },
    orderBy: { registeredAt: "desc" },
    include: { _count: { select: { tickets: true } } },
  });
}

export async function validateRegistration(qrCodeToken: string) {
  const registration = await prisma.registration.findUnique({
    where: { qrCodeToken },
    include: { event: true },
  });

  if (!registration) throw new Error("Registration not found");
  if (registration.status === "CANCELLED") throw new Error("Registration cancelled");

  return registration;
}

export async function generateBadge(registrationId: string) {
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
  });

  if (!registration) throw new Error("Registration not found");

  // Badge generation logic - would use a library like PDFKit
  return {
    name: `${registration.firstName} ${registration.lastName}`,
    qrCode: registration.qrCodeData,
    badgeUrl: `/badges/${registrationId}.pdf`,
  };
}
