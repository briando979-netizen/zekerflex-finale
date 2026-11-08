import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Delivery } from "@prisma/client";

// ---------------------------------------------------------------------------
// Customer Experience: Real-time tracking, delivery notifications,
// proof of delivery, and contactless delivery options
// ---------------------------------------------------------------------------

export const DeliveryTrackingSchema = z.object({
  deliveryId: z.string(),
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PICKING",
    "READY",
    "IN_TRANSIT",
    "DELIVERED",
    "CANCELLED",
    "FAILED",
  ]),
  currentLocation: z
    .object({
      lat: z.number(),
      lon: z.number(),
      timestamp: z.date(),
    })
    .optional(),
  partnerName: z.string().optional(),
  partnerPhone: z.string().optional(),
  estimatedArrival: z.date().optional(),
});

export type DeliveryTracking = z.infer<typeof DeliveryTrackingSchema>;

export const ProofOfDeliverySchema = z.object({
  deliveryId: z.string(),
  signatureProof: z.string().optional(), // URL of signature image
  photoProof: z.string().optional(), // URL of delivery photo
  deliveredAt: z.date(),
  recipientName: z.string(),
  comments: z.string().optional(),
});

export type ProofOfDelivery = z.infer<typeof ProofOfDeliverySchema>;

export const DeliveryNotificationSchema = z.object({
  deliveryId: z.string(),
  type: z.enum([
    "ORDER_CONFIRMED",
    "PARTNER_ASSIGNED",
    "PICKING_STARTED",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
    "ARRIVING_SOON",
    "DELIVERED",
    "DELIVERY_FAILED",
  ]),
  title: z.string(),
  message: z.string(),
  sentAt: z.date(),
  channel: z.enum(["PUSH", "SMS", "EMAIL"]).optional(),
});

export type DeliveryNotification = z.infer<typeof DeliveryNotificationSchema>;

export const ContactlessDeliveryOptionsSchema = z.object({
  leaveAtDoor: z.boolean().default(false),
  leaveAtSpecificLocation: z.string().optional(),
  photoAfterDelivery: z.boolean().default(true),
  requireSignature: z.boolean().default(false),
});

export type ContactlessDeliveryOptions = z.infer<
  typeof ContactlessDeliveryOptionsSchema
>;

/**
 * Get real-time tracking information for a delivery
 */
export async function getDeliveryTracking(
  deliveryId: string
): Promise<DeliveryTracking | null> {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      deliveryPartner: true,
    },
  });

  if (!delivery) return null;

  return {
    deliveryId: delivery.id,
    status: delivery.status as any,
    partnerName: delivery.deliveryPartner?.name,
    partnerPhone: delivery.deliveryPartner?.phoneNumber,
    estimatedArrival: delivery.estimatedDeliveryTime ?? undefined,
    currentLocation: delivery.actualPickupTime
      ? {
          // Placeholder: in real system, fetch from GPS/location service
          lat: delivery.deliveryLat,
          lon: delivery.deliveryLon,
          timestamp: new Date(),
        }
      : undefined,
  };
}

/**
 * Update delivery status and send notification
 */
export async function updateDeliveryStatus(
  deliveryId: string,
  newStatus: Delivery["status"],
  notificationMessage?: string
): Promise<Delivery> {
  const delivery = await prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      status: newStatus,
      ...(newStatus === "PICKED_UP" && { actualPickupTime: new Date() }),
      ...(newStatus === "DELIVERED" && { actualDeliveryTime: new Date() }),
    },
  });

  // Queue notification
  if (notificationMessage) {
    await queueDeliveryNotification({
      deliveryId,
      type: mapStatusToNotificationType(newStatus),
      title: generateNotificationTitle(newStatus),
      message: notificationMessage,
      sentAt: new Date(),
      channel: "PUSH",
    });
  }

  return delivery;
}

/**
 * Map delivery status to notification type
 */
function mapStatusToNotificationType(
  status: Delivery["status"]
): DeliveryNotification["type"] {
  const map: Record<Delivery["status"], DeliveryNotification["type"]> = {
    PENDING: "ORDER_CONFIRMED",
    CONFIRMED: "ORDER_CONFIRMED",
    PICKING: "PICKING_STARTED",
    READY: "READY_FOR_DELIVERY",
    IN_TRANSIT: "OUT_FOR_DELIVERY",
    DELIVERED: "DELIVERED",
    CANCELLED: "DELIVERY_FAILED",
    FAILED: "DELIVERY_FAILED",
  };
  return map[status] || "ORDER_CONFIRMED";
}

/**
 * Generate user-friendly notification title
 */
function generateNotificationTitle(status: Delivery["status"]): string {
  const titles: Record<Delivery["status"], string> = {
    PENDING: "Bestelling geplaatst",
    CONFIRMED: "Bestelling bevestigd",
    PICKING: "We halen je order op",
    READY: "Klaar voor verzending",
    IN_TRANSIT: "Onderweg naar je",
    DELIVERED: "Bezorgd!",
    CANCELLED: "Bestelling geannuleerd",
    FAILED: "Bezorging mislukt",
  };
  return titles[status] || "Statusupdate";
}

/**
 * Queue a delivery notification
 */
export async function queueDeliveryNotification(
  notification: DeliveryNotification
): Promise<void> {
  // Store in a notifications queue or KV for async processing
  // TODO: Implement notification queue system
  console.log("Notification queued:", notification);
}

/**
 * Record proof of delivery (signature and/or photo)
 */
export async function recordProofOfDelivery(
  deliveryId: string,
  proof: ProofOfDelivery
): Promise<Delivery> {
  const delivery = await prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      status: "DELIVERED",
      actualDeliveryTime: proof.deliveredAt,
      signatureProof: proof.signatureProof,
      photoProof: proof.photoProof,
      recipientName: proof.recipientName,
    },
  });

  // Send delivery confirmation notification
  await queueDeliveryNotification({
    deliveryId,
    type: "DELIVERED",
    title: "Bezorgd!",
    message: `Je order is bezorgd door ${delivery.recipientName}`,
    sentAt: new Date(),
    channel: "PUSH",
  });

  return delivery;
}

/**
 * Generate shareable tracking link for customer
 */
export function generateTrackingLink(deliveryId: string): string {
  // Generate public token or use short URL
  return `/track/${deliveryId}`;
}

/**
 * Apply contactless delivery preferences
 */
export async function applyContactlessDeliveryPreferences(
  deliveryId: string,
  preferences: ContactlessDeliveryOptions
): Promise<Delivery> {
  return prisma.delivery.update({
    where: { id: deliveryId },
    data: {
      specialInstructions: JSON.stringify(preferences),
    },
  });
}

/**
 * Get estimated arrival time window based on current position
 */
export async function getEstimatedArrivalWindow(
  deliveryId: string
): Promise<{
  estimatedArrivalMin: Date;
  estimatedArrivalMax: Date;
  confidence: number;
}> {
  const delivery = await prisma.delivery.findUniqueOrThrow({
    where: { id: deliveryId },
  });

  if (!delivery.estimatedDeliveryTime) {
    throw new Error("No estimated delivery time set");
  }

  // Create a window: ±15 minutes from estimate
  const estimate = new Date(delivery.estimatedDeliveryTime);
  const min = new Date(estimate.getTime() - 15 * 60000);
  const max = new Date(estimate.getTime() + 15 * 60000);

  return {
    estimatedArrivalMin: min,
    estimatedArrivalMax: max,
    confidence: 0.85, // 85% confidence in window
  };
}

/**
 * Schema for delivery feedback
 */
export const DeliveryFeedbackSchema = z.object({
  deliveryId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  issues: z.array(z.enum(["DAMAGED", "WRONG_ITEM", "LATE", "OTHER"])).optional(),
});

export type DeliveryFeedback = z.infer<typeof DeliveryFeedbackSchema>;

/**
 * Submit delivery feedback and update partner rating
 */
export async function submitDeliveryFeedback(
  feedback: DeliveryFeedback
): Promise<void> {
  const delivery = await prisma.delivery.findUniqueOrThrow({
    where: { id: feedback.deliveryId },
  });

  if (!delivery.deliveryPartnerId) return;

  // Calculate if on-time
  const isOnTime =
    delivery.actualDeliveryTime &&
    delivery.estimatedDeliveryTime &&
    delivery.actualDeliveryTime <= delivery.estimatedDeliveryTime;

  // Update partner rating
  const partner = await prisma.deliveryPartner.findUnique({
    where: { id: delivery.deliveryPartnerId },
  });

  if (partner) {
    const totalRating =
      partner.averageRating * partner.completedDeliveries + feedback.rating;
    const newAverage = totalRating / (partner.completedDeliveries + 1);

    await prisma.deliveryPartner.update({
      where: { id: delivery.deliveryPartnerId },
      data: {
        averageRating: newAverage,
      },
    });
  }

  // TODO: Store feedback details for platform analytics
}

/**
 * Schema for delivery issue reporting
 */
export const ReportDeliveryIssueSchema = z.object({
  deliveryId: z.string(),
  issueType: z.enum([
    "NOT_DELIVERED",
    "DAMAGED_ITEM",
    "WRONG_ITEM",
    "LATE_DELIVERY",
    "PARTNER_BEHAVIOR",
    "OTHER",
  ]),
  description: z.string().min(10),
  photosUrls: z.array(z.string().url()).optional(),
});

export type ReportDeliveryIssue = z.infer<typeof ReportDeliveryIssueSchema>;

/**
 * Report delivery issue and trigger resolution process
 */
export async function reportDeliveryIssue(
  issue: ReportDeliveryIssue
): Promise<void> {
  const delivery = await prisma.delivery.findUniqueOrThrow({
    where: { id: issue.deliveryId },
  });

  // Mark delivery as having issue
  await prisma.delivery.update({
    where: { id: issue.deliveryId },
    data: {
      status: "FAILED",
    },
  });

  // TODO: Create support ticket
  // TODO: Notify customer service
  // TODO: Flag delivery partner if multiple issues
}

/**
 * Get delivery status timeline for display
 */
export async function getDeliveryTimeline(
  deliveryId: string
): Promise<
  Array<{
    status: string;
    timestamp: Date;
    title: string;
    description: string;
  }>
> {
  const delivery = await prisma.delivery.findUniqueOrThrow({
    where: { id: deliveryId },
  });

  const timeline = [];

  if (delivery.createdAt) {
    timeline.push({
      status: "PENDING",
      timestamp: delivery.createdAt,
      title: "Bestelling geplaatst",
      description: "Je order is ontvangen",
    });
  }

  if (delivery.actualPickupTime) {
    timeline.push({
      status: "PICKING",
      timestamp: delivery.actualPickupTime,
      title: "Opgehaald",
      description: "Je order is opgehaald",
    });
  }

  if (delivery.estimatedDeliveryTime) {
    timeline.push({
      status: "IN_TRANSIT",
      timestamp: delivery.estimatedDeliveryTime,
      title: "Onderweg",
      description: "Je order is onderweg",
    });
  }

  if (delivery.actualDeliveryTime) {
    timeline.push({
      status: "DELIVERED",
      timestamp: delivery.actualDeliveryTime,
      title: "Bezorgd",
      description: "Je order is bezorgd",
    });
  }

  return timeline;
}
