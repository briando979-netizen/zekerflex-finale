// Mobile app analytics with crash reporting, session tracking, performance
import { generateId } from '@/lib/id';

export interface MobileAnalyticsEvent {
  eventName: string;
  eventValue?: number;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

export interface CrashReport {
  id: string;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  timestamp: number;
  userId?: string;
  appVersion: string;
  platform: 'ios' | 'android' | 'web';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PerformanceMetrics {
  appStartTime: number;
  firstPaint: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
  memoryUsage: number;
  fps: number;
}

export class MobileAnalytics {
  private static sessionId = generateId();
  private static appStartTime = Date.now();
  private static isNative = this.checkIfNative();
  private static eventQueue: MobileAnalyticsEvent[] = [];

  private static checkIfNative(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return require('@capacitor/core').Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  }

  static async initialize() {
    // Setup crash handler
    window.addEventListener('error', (event) => {
      this.reportCrash({
        message: event.message,
        stack: event.error?.stack,
        severity: 'high',
      });
    });

    // Unhandled promise rejection
    window.addEventListener('unhandledrejection', (event) => {
      this.reportCrash({
        message: String(event.reason),
        severity: 'high',
      });
    });

    // Periodic flush
    setInterval(() => {
      this.flushEvents();
    }, 30000);
  }

  static trackEvent(event: MobileAnalyticsEvent) {
    const payload = {
      ...event,
      timestamp: event.timestamp ?? Date.now(),
      sessionId: this.sessionId,
      appStartTime: this.appStartTime,
    };

    this.eventQueue.push(payload);

    // Flush if queue gets large
    if (this.eventQueue.length >= 50) {
      this.flushEvents();
    }
  }

  static trackScreenView(screenName: string, params?: Record<string, unknown>) {
    this.trackEvent({
      eventName: 'screen_view',
      properties: {
        screen_name: screenName,
        ...params,
      },
    });
  }

  static trackUserEngagement(action: string, category: string, value?: number) {
    this.trackEvent({
      eventName: 'user_engagement',
      eventValue: value,
      properties: {
        action,
        category,
      },
    });
  }

  static trackFeatureUsage(feature: string, duration?: number) {
    this.trackEvent({
      eventName: 'feature_usage',
      eventValue: duration,
      properties: {
        feature,
      },
    });
  }

  static trackConversion(conversionType: string, value: number) {
    this.trackEvent({
      eventName: 'conversion',
      eventValue: value,
      properties: {
        conversion_type: conversionType,
      },
    });
  }

  static trackSearch(query: string, resultCount: number, duration: number) {
    this.trackEvent({
      eventName: 'search',
      properties: {
        query,
        result_count: resultCount,
        duration,
      },
    });
  }

  static trackError(error: Error, context?: Record<string, unknown>) {
    this.trackEvent({
      eventName: 'error',
      properties: {
        message: error.message,
        stack: error.stack,
        ...context,
      },
    });
  }

  static reportCrash(options: {
    message: string;
    stack?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, unknown>;
  }) {
    const crash: CrashReport = {
      id: generateId(),
      message: options.message,
      stack: options.stack,
      context: options.context ?? {},
      timestamp: Date.now(),
      appVersion: '1.0.0', // Get from package.json
      platform: this.isNative
        ? require('@capacitor/core').Capacitor.getPlatform()
        : 'web',
      severity: options.severity ?? 'high',
    };

    // Send immediately for critical crashes
    void this.sendCrash(crash);
  }

  private static async sendCrash(crash: CrashReport) {
    try {
      await fetch('/api/analytics/crashes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crash),
      });
    } catch {
      // Offline, will retry later
    }
  }

  static async flushEvents() {
    if (this.eventQueue.length === 0) return;

    const events = this.eventQueue.splice(0, 100);

    try {
      await fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events,
          sessionId: this.sessionId,
          appStartTime: this.appStartTime,
        }),
      });
    } catch (e) {
      // Re-queue on failure
      this.eventQueue.unshift(...events);
    }
  }

  static getSessionId(): string {
    return this.sessionId;
  }

  static getAppStartTime(): number {
    return this.appStartTime;
  }
}

// Performance monitoring
export class PerformanceMonitor {
  static async getMetrics(): Promise<PerformanceMetrics> {
    if (typeof window === 'undefined') {
      return {
        appStartTime: 0,
        firstPaint: 0,
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        cumulativeLayoutShift: 0,
        timeToInteractive: 0,
        memoryUsage: 0,
        fps: 0,
      };
    }

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paints = performance.getEntriesByType('paint');
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');

    let firstPaint = 0,
      firstContentfulPaint = 0;
    for (const paint of paints) {
      if (paint.name === 'first-paint') firstPaint = paint.startTime;
      if (paint.name === 'first-contentful-paint') firstContentfulPaint = paint.startTime;
    }

    const largestContentfulPaint = lcpEntries.length
      ? (lcpEntries[lcpEntries.length - 1] as any).renderTime
      : 0;

    // CLS is tracked via PerformanceObserver
    let cls = 0;
    try {
      const clsEntries = performance.getEntriesByType('layout-shift');
      for (const entry of clsEntries) {
        if (!(entry as any).hadRecentInput) {
          cls += (entry as any).value;
        }
      }
    } catch {
      // CLS not available
    }

    return {
      appStartTime: navigation?.fetchStart ?? 0,
      firstPaint,
      firstContentfulPaint,
      largestContentfulPaint,
      cumulativeLayoutShift: cls,
      timeToInteractive: navigation?.domInteractive ?? 0,
      memoryUsage: (performance as any).memory?.usedJSHeapSize ?? 0,
      fps: this.measureFPS(),
    };
  }

  private static measureFPS(): number {
    let frameCount = 0;
    let lastTime = performance.now();

    const measureFrame = () => {
      frameCount++;
      const now = performance.now();

      if (now - lastTime >= 1000) {
        return frameCount;
      }

      requestAnimationFrame(measureFrame);
    };

    return measureFrame();
  }

  static trackLongTasks(callback: (duration: number) => void) {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            callback((entry as any).duration);
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
        return () => observer.disconnect();
      } catch {
        // Long task not available
      }
    }
  }

  static trackResourceTiming() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            MobileAnalytics.trackEvent({
              eventName: 'resource_timing',
              properties: {
                name: entry.name,
                duration: entry.duration,
                size: (entry as PerformanceResourceTiming).transferSize,
              },
            });
          }
        });

        observer.observe({ entryTypes: ['resource'] });
        return () => observer.disconnect();
      } catch {
        // Resources not available
      }
    }
  }
}

// Session management
export class SessionAnalytics {
  static trackSessionStart() {
    MobileAnalytics.trackEvent({
      eventName: 'session_start',
      properties: {
        sessionId: MobileAnalytics.getSessionId(),
      },
    });
  }

  static trackSessionEnd(duration: number) {
    MobileAnalytics.trackEvent({
      eventName: 'session_end',
      eventValue: duration,
      properties: {
        sessionId: MobileAnalytics.getSessionId(),
      },
    });
  }

  static trackAppForeground() {
    MobileAnalytics.trackEvent({
      eventName: 'app_foreground',
    });
  }

  static trackAppBackground() {
    MobileAnalytics.trackEvent({
      eventName: 'app_background',
    });
  }
}
