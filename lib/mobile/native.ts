// Native device features access (via Capacitor)
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Contacts, Contact } from '@capacitor/contacts';
import { Calendar } from '@capacitor/calendar';

export class NativeFeatures {
  static isNative() {
    return Capacitor.isNativePlatform();
  }

  static getPlatform() {
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  }

  // High-accuracy geolocation
  static async getLocation(options?: {
    timeout?: number;
    enableHighAccuracy?: boolean;
  }) {
    try {
      const coords = await Geolocation.getCurrentPosition({
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
        maximumAge: 0,
      });
      return {
        latitude: coords.coords.latitude,
        longitude: coords.coords.longitude,
        accuracy: coords.coords.accuracy,
        altitude: coords.coords.altitude,
        heading: coords.coords.heading,
        speed: coords.coords.speed,
        timestamp: coords.timestamp,
      };
    } catch (e) {
      throw new Error(`Geolocation failed: ${String(e)}`);
    }
  }

  // Watch location in real-time
  static watchLocation(callback: (location: any) => void) {
    return Geolocation.watchPosition({}, (position) => {
      if (position) {
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      }
    });
  }

  // Camera capture with multiple shots
  static async takePhoto(options?: {
    quality?: number;
    source?: 'camera' | 'photos';
  }) {
    try {
      const image = await Camera.getPhoto({
        quality: options?.quality ?? 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: options?.source === 'photos' ? CameraSource.Photos : CameraSource.Camera,
        promptLabelPicture: 'Foto selecteren',
        promptLabelCamera: 'Camera gebruiken',
        correctOrientation: true,
      });

      return {
        data: image.base64String,
        mimeType: image.format,
        width: image.width,
        height: image.height,
      };
    } catch (e) {
      throw new Error(`Camera failed: ${String(e)}`);
    }
  }

  static async recordVideo() {
    try {
      const video = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
      });
      return {
        uri: video.path,
        mimeType: video.format,
      };
    } catch (e) {
      throw new Error(`Video recording failed: ${String(e)}`);
    }
  }

  // Contact access
  static async getContacts() {
    try {
      const result = await Contacts.getContacts();
      return result.contacts;
    } catch (e) {
      throw new Error(`Contact access failed: ${String(e)}`);
    }
  }

  static async searchContact(query: string) {
    try {
      const result = await Contacts.getContacts({
        projection: {
          name: true,
          phones: true,
          emails: true,
        },
      });
      return result.contacts.filter(
        (c) =>
          c.name?.display?.toLowerCase().includes(query.toLowerCase()) ||
          c.phones?.some((p) => p.number?.includes(query))
      );
    } catch (e) {
      return [];
    }
  }

  // Calendar integration
  static async createEvent(event: {
    title: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    location?: string;
  }) {
    try {
      if (!this.isNative()) return null;

      const result = await Calendar.createEvent({
        title: event.title,
        description: event.description,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        location: event.location,
      });

      return result;
    } catch (e) {
      console.error('Calendar event creation failed:', e);
      return null;
    }
  }

  // NFC/QR scanning (via plugins)
  static async scanQR() {
    try {
      // Requires: npm install @capacitor-community/barcode-scanner
      const { BarcodeScanner } = await import('@capacitor-community/barcode-scanner');
      const result = await BarcodeScanner.startScan();
      return result.hasContent ? result.content : null;
    } catch (e) {
      throw new Error(`QR scan failed: ${String(e)}`);
    }
  }

  // Vibration feedback
  static async vibrate(pattern: number | number[] = 50) {
    try {
      const { HapticFeedback } = await import('@capacitor/haptics');
      if (Array.isArray(pattern)) {
        for (const duration of pattern) {
          await HapticFeedback.vibrate({ duration });
          await new Promise((r) => setTimeout(r, duration));
        }
      } else {
        await HapticFeedback.vibrate({ duration: pattern });
      }
    } catch (e) {
      console.error('Vibration failed:', e);
    }
  }

  static async heavyHaptic() {
    try {
      const { HapticFeedback } = await import('@capacitor/haptics');
      await HapticFeedback.impact({ style: 'Heavy' });
    } catch {
      // Fallback
    }
  }

  static async lightHaptic() {
    try {
      const { HapticFeedback } = await import('@capacitor/haptics');
      await HapticFeedback.impact({ style: 'Light' });
    } catch {
      // Fallback
    }
  }

  // Biometric auth (Face ID, Touch ID, etc.)
  static async isBiometricAvailable() {
    try {
      const { BiometricAuth } = await import('@capacitor-community/biometric-auth');
      const result = await BiometricAuth.isAvailable();
      return result.isAvailable;
    } catch {
      return false;
    }
  }

  static async authenticateWithBiometric(reason: string) {
    try {
      const { BiometricAuth } = await import('@capacitor-community/biometric-auth');
      const result = await BiometricAuth.authenticate({
        reason,
        title: 'ZekerFlex',
      });
      return result.success;
    } catch {
      return false;
    }
  }

  // Secure storage
  static async secureSet(key: string, value: string) {
    try {
      const { SecureStoragePlugin } = await import('@capacitor-community/secure-storage-plugin');
      await SecureStoragePlugin.set({ key, value });
    } catch (e) {
      console.error('Secure storage set failed:', e);
    }
  }

  static async secureGet(key: string): Promise<string | null> {
    try {
      const { SecureStoragePlugin } = await import('@capacitor-community/secure-storage-plugin');
      const result = await SecureStoragePlugin.get({ key });
      return result.value;
    } catch {
      return null;
    }
  }

  // Share functionality
  static async share(data: {
    title?: string;
    text: string;
    url?: string;
  }) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: data.title,
        text: data.text,
        url: data.url,
        dialogTitle: 'Delen',
      });
    } catch (e) {
      console.error('Share failed:', e);
    }
  }
}

// Platform-specific utilities
export const mobileUtils = {
  isMobile: () => {
    if (typeof window === 'undefined') return false;
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      navigator.userAgent.toLowerCase()
    );
  },

  isIOS: () => {
    if (typeof window === 'undefined') return false;
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  },

  isAndroid: () => {
    if (typeof window === 'undefined') return false;
    return /android/.test(navigator.userAgent.toLowerCase());
  },

  getViewportWidth: () => window.innerWidth,
  getViewportHeight: () => window.innerHeight,

  getSafeArea: () => {
    const env = (key: string) => {
      const value = getCSSVariableValue(`safe-area-inset-${key}`);
      return parseInt(value) || 0;
    };
    return {
      top: env('top'),
      right: env('right'),
      bottom: env('bottom'),
      left: env('left'),
    };
  },
};

function getCSSVariableValue(varName: string): string {
  if (typeof window === 'undefined') return '0px';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
