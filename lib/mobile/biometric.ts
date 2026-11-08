import { z } from 'zod';

interface BiometricCredential {
  id: string;
  type: 'fingerprint' | 'face' | 'iris';
  enrolled: boolean;
  verified: number;
  failureCount: number;
}

interface AuthenticationResult {
  success: boolean;
  method: 'fingerprint' | 'face' | 'iris' | 'password';
  timestamp: number;
  confidence: number;
}

const biometricSchema = z.object({
  id: z.string(),
  type: z.enum(['fingerprint', 'face', 'iris']),
  enrolled: z.boolean(),
  verified: z.number(),
  failureCount: z.number(),
});

export type BiometricData = z.infer<typeof biometricSchema>;

export async function requestBiometricPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const permission = await navigator.permissions.query({ name: 'fingerprint' as PermissionName });
    return permission.state === 'granted';
  } catch (err) {
    return false;
  }
}

export async function checkBiometricAvailability(): Promise<string[]> {
  if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
    return [];
  }

  const available: string[] = [];

  try {
    if (await (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()) {
      available.push('fingerprint');
    }
  } catch (err) {
    // Continue
  }

  return available;
}

export async function authenticateWithBiometric(type: 'fingerprint' | 'face' | 'iris'): Promise<AuthenticationResult | null> {
  if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
    return null;
  }

  try {
    const credential = await (navigator.credentials as any)?.get({
      publicKey: {
        challenge: new Uint8Array(32),
        timeout: 30000,
        userVerification: 'preferred',
      },
    });

    if (!credential) {
      return null;
    }

    return {
      success: true,
      method: type,
      timestamp: Date.now(),
      confidence: 0.95,
    };
  } catch (err) {
    console.error('Biometric authentication failed:', err);
    return null;
  }
}

export async function enrollBiometric(type: 'fingerprint' | 'face' | 'iris'): Promise<BiometricCredential | null> {
  try {
    const response = await fetch('/api/mobile/biometric/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Failed to enroll biometric:', err);
    return null;
  }
}

export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const result = await authenticateWithBiometric('fingerprint');
    return result?.success ?? false;
  } catch (err) {
    console.error('Failed to verify biometric:', err);
    return false;
  }
}

export async function removeBiometric(credentialId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/mobile/biometric/${credentialId}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to remove biometric:', err);
    return false;
  }
}

export async function getBiometricCredentials(): Promise<BiometricCredential[]> {
  try {
    const response = await fetch('/api/mobile/biometric/credentials');
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch biometric credentials:', err);
    return [];
  }
}
