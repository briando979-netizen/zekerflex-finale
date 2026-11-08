// Deep linking for iOS (Universal Links) & Android (App Links)
import { App } from '@capacitor/app';

export interface DeepLinkTarget {
  path: string;
  params: Record<string, string>;
}

export class DeepLinkManager {
  private static listeners: ((target: DeepLinkTarget) => void)[] = [];

  static async initialize() {
    if (!this.isNative()) return;

    // Handle deeplinks from native
    App.addListener('appUrlOpen', async (data) => {
      const target = this.parseDeepLink(data.url);
      if (target) {
        this.emit(target);
      }
    });

    // Handle app launch from deeplink
    const url = await App.getLaunchUrl();
    if (url?.startsWith('zekerflex://')) {
      const target = this.parseDeepLink(url);
      if (target) {
        this.emit(target);
      }
    }
  }

  static isNative(): boolean {
    try {
      return require('@capacitor/app').App !== undefined;
    } catch {
      return false;
    }
  }

  static parseDeepLink(url: string): DeepLinkTarget | null {
    try {
      const parsed = new URL(url);

      // Handle native scheme: zekerflex://path?param=value
      if (parsed.protocol === 'zekerflex:') {
        const path = parsed.hostname + parsed.pathname;
        const params: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        return { path, params };
      }

      // Handle web link with referrer: https://zekerflex.com/path?utm_source=...
      if (
        parsed.hostname === 'zekerflex.com' ||
        parsed.hostname === 'www.zekerflex.com' ||
        parsed.hostname === 'app.zekerflex.com'
      ) {
        const path = parsed.pathname;
        const params: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        return { path, params };
      }

      return null;
    } catch {
      return null;
    }
  }

  static subscribe(callback: (target: DeepLinkTarget) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private static emit(target: DeepLinkTarget) {
    this.listeners.forEach((listener) => listener(target));
  }

  // Generate trackable deeplinks
  static generateDeepLink(options: {
    path: string;
    params?: Record<string, string>;
    campaign?: {
      source: string;
      medium: string;
      name: string;
    };
  }): string {
    const params = new URLSearchParams({
      ...options.params,
      ...(options.campaign && {
        utm_source: options.campaign.source,
        utm_medium: options.campaign.medium,
        utm_campaign: options.campaign.name,
      }),
    });

    return `https://app.zekerflex.com${options.path}?${params.toString()}`;
  }

  // iOS Universal Links (via apple-app-site-association)
  static getUniversalLinkConfig() {
    return {
      applinks: {
        apps: [],
        details: [
          {
            appID: 'TEAM_ID.com.zekerflex.app',
            paths: ['/*'],
          },
        ],
      },
      appclips: {
        apps: [],
        details: [
          {
            appID: 'TEAM_ID.BUNDLE_ID.Clip',
            paths: ['/launch/*'],
          },
        ],
      },
    };
  }

  // Android App Links (via assetlinks.json)
  static getAppLinksConfig() {
    return {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.zekerflex.app',
        sha256_cert_fingerprints: [
          'YOUR_CERT_FINGERPRINT_HERE', // Generate via: keytool -list -v -keystore keystore.jks
        ],
      },
    };
  }
}

// Analytics for deep link tracking
export class DeepLinkAnalytics {
  static track(target: DeepLinkTarget, source: 'push' | 'link' | 'qr') {
    if (typeof window === 'undefined') return;

    const event = {
      event: 'deep_link_opened',
      path: target.path,
      source,
      params: target.params,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      referrer: target.params.utm_source || 'direct',
    };

    // Send to analytics service
    void fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(() => {
      // Fail silently if offline
    });
  }
}

// QR code deep linking
export class QRDeepLink {
  static generateQRCodeURL(options: {
    path: string;
    params?: Record<string, string>;
    size?: number;
  }): string {
    const link = DeepLinkManager.generateDeepLink({
      path: options.path,
      params: options.params,
    });

    const size = options.size || 300;

    // Using qr-server API
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(link)}`;
  }

  static async scanAndNavigate() {
    if (!DeepLinkManager.isNative()) return;

    try {
      const code = await this.scanQRCode();
      if (code) {
        const target = DeepLinkManager.parseDeepLink(code);
        if (target) {
          DeepLinkAnalytics.track(target, 'qr');
          return target;
        }
      }
    } catch (e) {
      console.error('QR scan failed:', e);
    }
    return null;
  }

  private static async scanQRCode(): Promise<string | null> {
    try {
      const { BarcodeScanner } = await import('@capacitor-community/barcode-scanner');
      const result = await BarcodeScanner.startScan();
      return result.hasContent ? result.content : null;
    } catch {
      return null;
    }
  }
}

// URL scheme registration
export const URL_SCHEMES = {
  // Native scheme
  NATIVE: 'zekerflex://',

  // Web domain
  WEB: 'https://app.zekerflex.com',

  // Paths
  SHIFT: '/shift/{id}',
  PROFILE: '/profile/{id}',
  CHAT: '/chat/{threadId}',
  PAYMENT: '/payment/{id}',
  VERIFICATION: '/verify/{token}',
  ONBOARDING: '/onboard',
  REFERRAL: '/ref/{code}',
};
