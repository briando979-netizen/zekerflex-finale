import type { RegionCode } from "@/lib/i18n/global/detector";
import { getRegionalConfig } from "./config";

export class RegionalFormatter {
  private region: RegionCode;
  private config = getRegionalConfig(this.region);

  constructor(region: RegionCode) {
    this.region = region;
    this.config = getRegionalConfig(region);
  }

  formatCurrency(amount: number, currencyCode?: string): string {
    const currency = currencyCode || this.config.currency;
    return new Intl.NumberFormat(this.config.numberFormat, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  formatNumber(value: number, digits = 2): string {
    return new Intl.NumberFormat(this.config.numberFormat, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat(this.config.numberFormat, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  formatTime(date: Date | string, includeSeconds = false): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat(this.config.numberFormat, {
      hour: "2-digit",
      minute: "2-digit",
      second: includeSeconds ? "2-digit" : undefined,
      hour12: this.config.numberFormat.includes("US"),
    }).format(d);
  }

  formatDateTime(date: Date | string): string {
    return `${this.formatDate(date)} ${this.formatTime(date)}`;
  }

  formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (this.region === "US" || this.region === "CA") {
      return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return `${this.config.phonePrefix} ${digits}`;
  }

  addTax(amount: number): number {
    const taxRate = this.config.vat / 100;
    return amount * (1 + taxRate);
  }

  removeTax(amount: number): number {
    const taxRate = this.config.vat / 100;
    return amount / (1 + taxRate);
  }

  getTaxAmount(amount: number): number {
    return this.addTax(amount) - amount;
  }
}

export function getFormatter(region: RegionCode): RegionalFormatter {
  return new RegionalFormatter(region);
}
