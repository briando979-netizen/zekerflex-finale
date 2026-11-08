/**
 * Biometric Authentication Subsystem
 *
 * WebAuthn/FIDO2 support for Face ID, Touch ID, Windows Hello, security keys.
 * Fallback to PIN-based auth. Server-side credential management and verification.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ===== Type Definitions =====

export interface BiometricRegistrationOptions {
  challenge: ArrayBuffer;
  rp: PublicKeyCredentialRpEntity;
  user: PublicKeyCredentialUserEntity;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout: number;
  attestation: "none" | "indirect" | "direct";
  authenticatorSelection: AuthenticatorSelectionCriteria;
}

export interface BiometricAuthenticationOptions {
  challenge: ArrayBuffer;
  timeout: number;
  userVerification: "required" | "preferred" | "discouraged";
  allowCredentials: PublicKeyCredentialDescriptor[];
}

// ===== Availability Check =====

/**
 * Check if WebAuthn is available in this browser
 */
export function isBiometricAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "credentials" in navigator &&
    "create" in navigator.credentials &&
    "get" in navigator.credentials
  );
}

/**
 * Check if platform authenticator (Face ID, Touch ID) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isBiometricAvailable()) return false;

  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
    return available ?? false;
  } catch {
    return false;
  }
}

// ===== Registration =====

/**
 * Generate registration options for WebAuthn enrollment
 */
export async function generateRegistrationOptions(
  userId: string,
  email: string,
  userName: string,
): Promise<BiometricRegistrationOptions> {
  const challenge = generateChallenge();

  return {
    challenge,
    rp: {
      name: "ZekerFlex",
      id: typeof window !== "undefined" ? window.location.hostname : "zekerflex.nl",
    },
    user: {
      id: new TextEncoder().encode(userId),
      name: email,
      displayName: userName,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    timeout: 60000,
    attestation: "direct",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "preferred",
    },
  };
}

/**
 * Store biometric credential after successful registration
 */
export async function storeBiometricCredential(
  userId: string,
  credentialId: string,
  publicKey: string,
  type: string,
  nickname?: string,
): Promise<void> {
  try {
    // Get transports from credential if available
    const transports: string[] = [];

    await prisma.biometricKey.create({
      data: {
        userId,
        credentialId,
        publicKey,
        type,
        algorithm: "ES256",
        transports,
        nickname: nickname || undefined,
        verified: true,
      },
    });

    logger.info("Biometric credential stored", {
      userId,
      credentialId: credentialId.substring(0, 20) + "...",
      type,
    });
  } catch (error) {
    logger.error("Failed to store biometric credential", {
      error: (error as Error).message,
      userId,
    });
    throw error;
  }
}

// ===== Authentication =====

/**
 * Generate authentication options for biometric login
 */
export async function generateAuthenticationOptions(
  userId: string,
): Promise<BiometricAuthenticationOptions> {
  const credentials = await prisma.biometricKey.findMany({
    where: { userId, verified: true },
    select: { credentialId: true },
  });

  const challenge = generateChallenge();

  return {
    challenge,
    timeout: 60000,
    userVerification: "preferred",
    allowCredentials: credentials.map((c) => ({
      type: "public-key",
      id: Buffer.from(c.credentialId, "base64"),
      transports: ["internal"],
    })),
  };
}

/**
 * Verify biometric authentication response
 */
export async function verifyBiometricAuth(
  userId: string,
  credentialId: string,
): Promise<boolean> {
  try {
    const credential = await prisma.biometricKey.findUnique({
      where: { userId_credentialId: { userId, credentialId } },
    });

    if (!credential) {
      logger.warn("Credential not found", { userId, credentialId });
      return false;
    }

    // Update last used time and counter
    await prisma.biometricKey.update({
      where: { id: credential.id },
      data: {
        lastUsedAt: new Date(),
        counter: credential.counter + 1,
      },
    });

    return true;
  } catch (error) {
    logger.error("Biometric verification failed", {
      error: (error as Error).message,
      userId,
    });
    return false;
  }
}

// ===== PIN Fallback =====

/**
 * Check if user has PIN set up
 */
export async function hasPinSetup(userId: string): Promise<boolean> {
  try {
    const pin = await prisma.biometricPin.findUnique({ where: { userId } });
    return !!pin && !pin.lockedUntil || pin.lockedUntil < new Date();
  } catch {
    return false;
  }
}

/**
 * Set or update PIN
 */
export async function setPinCode(userId: string, pinHash: string): Promise<void> {
  try {
    await prisma.biometricPin.upsert({
      where: { userId },
      create: { userId, pinHash },
      update: {
        pinHash,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    logger.info("PIN set", { userId });
  } catch (error) {
    logger.error("Failed to set PIN", {
      error: (error as Error).message,
      userId,
    });
    throw error;
  }
}

/**
 * Verify PIN attempt
 */
export async function verifyPinAttempt(
  userId: string,
  pinHash: string,
): Promise<{
  success: boolean;
  locked: boolean;
  remainingAttempts: number;
}> {
  try {
    const pin = await prisma.biometricPin.findUnique({ where: { userId } });

    if (!pin) {
      return { success: false, locked: false, remainingAttempts: 0 };
    }

    // Check if account is locked
    if (pin.lockedUntil && pin.lockedUntil > new Date()) {
      return { success: false, locked: true, remainingAttempts: 0 };
    }

    const success = pin.pinHash === pinHash;

    if (!success) {
      const failedAttempts = pin.failedAttempts + 1;
      const locked = failedAttempts >= 5;

      await prisma.biometricPin.update({
        where: { userId },
        data: {
          failedAttempts: failedAttempts,
          lockedUntil: locked ? new Date(Date.now() + 30 * 60 * 1000) : null, // 30 min lock
        },
      });

      return {
        success: false,
        locked,
        remainingAttempts: Math.max(0, 5 - failedAttempts),
      };
    }

    // Reset on success
    await prisma.biometricPin.update({
      where: { userId },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    logger.info("PIN verified successfully", { userId });

    return { success: true, locked: false, remainingAttempts: 5 };
  } catch (error) {
    logger.error("PIN verification failed", {
      error: (error as Error).message,
      userId,
    });
    return { success: false, locked: false, remainingAttempts: 0 };
  }
}

// ===== Credential Management =====

/**
 * List user's registered credentials
 */
export async function listCredentials(userId: string) {
  try {
    return await prisma.biometricKey.findMany({
      where: { userId, verified: true },
      select: {
        id: true,
        type: true,
        nickname: true,
        enrolledAt: true,
        lastUsedAt: true,
      },
    });
  } catch (error) {
    logger.warn("Failed to list credentials", {
      error: (error as Error).message,
      userId,
    });
    return [];
  }
}

/**
 * Delete a specific credential
 */
export async function deleteCredential(userId: string, credentialId: string): Promise<void> {
  try {
    await prisma.biometricKey.deleteMany({
      where: { userId, id: credentialId },
    });

    logger.info("Credential deleted", { userId, credentialId });
  } catch (error) {
    logger.error("Failed to delete credential", {
      error: (error as Error).message,
      userId,
    });
    throw error;
  }
}

/**
 * Update credential nickname
 */
export async function updateCredentialNickname(
  userId: string,
  credentialId: string,
  nickname: string,
): Promise<void> {
  try {
    await prisma.biometricKey.updateMany({
      where: { userId, id: credentialId },
      data: { nickname },
    });
  } catch (error) {
    logger.error("Failed to update nickname", {
      error: (error as Error).message,
      userId,
    });
    throw error;
  }
}

// ===== Utilities =====

function generateChallenge(): ArrayBuffer {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge.buffer;
}

/**
 * Convert credential response to JSON for transmission
 */
export function credentialResponseToJSON(
  credential: PublicKeyCredential,
): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse;

  return {
    id: credential.id,
    type: credential.type,
    response: {
      attestationObject: arrayBufferToBase64(response.attestationObject),
      clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
    },
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export interface BiometricStatus {
  available: boolean;
  platformAvailable: boolean;
  enrolled: number;
  pinSet: boolean;
}

/**
 * Get complete biometric status for user
 */
export async function getBiometricStatus(userId: string): Promise<BiometricStatus> {
  const [platformAvailable, credentials, pin] = await Promise.all([
    isPlatformAuthenticatorAvailable(),
    prisma.biometricKey.count({
      where: { userId, verified: true },
    }),
    prisma.biometricPin.findUnique({
      where: { userId },
    }),
  ]);

  return {
    available: isBiometricAvailable(),
    platformAvailable,
    enrolled: credentials,
    pinSet: !!pin && (!pin.lockedUntil || pin.lockedUntil < new Date()),
  };
}
