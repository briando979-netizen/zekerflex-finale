import type { RegionCode } from "@/lib/i18n/global/detector";
import { getRegionalConfig } from "@/lib/regions/config";

export interface TimeWindow {
  start: number;
  end: number;
  label: string;
}

export class GlobalTimeManager {
  private region: RegionCode;
  private config = getRegionalConfig(this.region);

  constructor(region: RegionCode) {
    this.region = region;
    this.config = getRegionalConfig(region);
  }

  getCurrentTime(): Date {
    return new Date();
  }

  getLocalTime(utcDate: Date): Date {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: this.config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = formatter.formatToParts(utcDate);
    const obj: Record<string, number> = {};

    parts.forEach((part) => {
      if (part.type !== "literal") {
        obj[part.type] = parseInt(part.value, 10);
      }
    });

    return new Date(
      obj.year,
      obj.month - 1,
      obj.day,
      obj.hour,
      obj.minute,
      obj.second
    );
  }

  getBusinessHours(): TimeWindow {
    return { start: 9, end: 17, label: "Business Hours" };
  }

  getPeakHours(): TimeWindow {
    return { start: 12, end: 14, label: "Peak Hours" };
  }

  isBusinessHours(date: Date = new Date()): boolean {
    const local = this.getLocalTime(date);
    const hour = local.getHours();
    const dayOfWeek = local.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    return hour >= this.getBusinessHours().start && hour < this.getBusinessHours().end;
  }

  isPeakHours(date: Date = new Date()): boolean {
    const local = this.getLocalTime(date);
    const hour = local.getHours();
    const peak = this.getPeakHours();
    return hour >= peak.start && hour < peak.end;
  }

  getOptimalTime(date: Date = new Date()): Date {
    const local = this.getLocalTime(date);

    if (this.isPeakHours(date)) {
      return new Date(local.getTime() + 2 * 60 * 60 * 1000);
    }

    if (!this.isBusinessHours(date)) {
      return new Date(local.getFullYear(), local.getMonth(), local.getDate(), 9, 0);
    }

    return date;
  }

  scheduleForBusinessHours(date: Date = new Date()): Date {
    let current = new Date(date);
    current = this.getLocalTime(current);

    while (!this.isBusinessHours(current)) {
      current.setDate(current.getDate() + 1);
      current.setHours(9, 0, 0, 0);
    }

    return current;
  }
}

export function getTimeManager(region: RegionCode): GlobalTimeManager {
  return new GlobalTimeManager(region);
}

export function formatTimeForRegion(date: Date, region: RegionCode): string {
  const manager = getTimeManager(region);
  const local = manager.getLocalTime(date);

  return new Intl.DateTimeFormat(getRegionalConfig(region).numberFormat, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: getRegionalConfig(region).timezone,
  }).format(local);
}
