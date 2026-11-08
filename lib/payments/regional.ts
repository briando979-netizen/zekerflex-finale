import type { RegionCode } from "@/lib/i18n/global/detector";
import { getRegionalConfig } from "@/lib/regions/config";

export type PaymentMethod =
  | "stripe"
  | "apple-pay"
  | "google-pay"
  | "paypal"
  | "bank-transfer"
  | "sepa"
  | "alipay"
  | "wechat-pay"
  | "paynow"
  | "line-pay"
  | "rakuten-pay"
  | "pix"
  | "boleto"
  | "conekta"
  | "oxxo"
  | "razorpay"
  | "mpesa"
  | "paystack"
  | "flutterwave";

export interface PaymentConfig {
  method: PaymentMethod;
  name: string;
  icon: string;
  fee: number;
  settlement: number;
  currencies: string[];
}

const PAYMENT_CONFIGS: Record<PaymentMethod, PaymentConfig> = {
  stripe: {
    method: "stripe",
    name: "Stripe",
    icon: "💳",
    fee: 0.029,
    settlement: 1,
    currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "BRL", "INR", "JPY", "SGD", "AED", "SAR", "ILS", "ZAR", "KES", "NGN"],
  },
  "apple-pay": {
    method: "apple-pay",
    name: "Apple Pay",
    icon: "🍎",
    fee: 0.015,
    settlement: 0,
    currencies: ["USD", "EUR", "GBP", "AUD", "JPY", "SGD", "AED", "ILS"],
  },
  "google-pay": {
    method: "google-pay",
    name: "Google Pay",
    icon: "🔵",
    fee: 0.015,
    settlement: 0,
    currencies: ["USD", "EUR", "GBP", "AUD", "INR", "JPY", "SGD"],
  },
  paypal: {
    method: "paypal",
    name: "PayPal",
    icon: "🅿️",
    fee: 0.034,
    settlement: 1,
    currencies: ["USD", "EUR", "GBP", "AUD", "CAD", "BRL", "INR", "JPY", "SGD", "AED", "ZAR", "KES", "NGN"],
  },
  "bank-transfer": {
    method: "bank-transfer",
    name: "Bank Transfer",
    icon: "🏦",
    fee: 0.005,
    settlement: 3,
    currencies: ["GBP", "EUR", "AUD", "CAD", "ILS"],
  },
  sepa: {
    method: "sepa",
    name: "SEPA Transfer",
    icon: "🇪🇺",
    fee: 0.003,
    settlement: 1,
    currencies: ["EUR"],
  },
  alipay: {
    method: "alipay",
    name: "Alipay",
    icon: "🐜",
    fee: 0.03,
    settlement: 1,
    currencies: ["SGD", "AED"],
  },
  "wechat-pay": {
    method: "wechat-pay",
    name: "WeChat Pay",
    icon: "💚",
    fee: 0.03,
    settlement: 1,
    currencies: ["SGD"],
  },
  paynow: {
    method: "paynow",
    name: "PayNow",
    icon: "🇸🇬",
    fee: 0.005,
    settlement: 0,
    currencies: ["SGD"],
  },
  "line-pay": {
    method: "line-pay",
    name: "LINE Pay",
    icon: "💬",
    fee: 0.025,
    settlement: 1,
    currencies: ["JPY"],
  },
  "rakuten-pay": {
    method: "rakuten-pay",
    name: "Rakuten Pay",
    icon: "🎴",
    fee: 0.025,
    settlement: 1,
    currencies: ["JPY"],
  },
  pix: {
    method: "pix",
    name: "PIX",
    icon: "🇧🇷",
    fee: 0.01,
    settlement: 0,
    currencies: ["BRL"],
  },
  boleto: {
    method: "boleto",
    name: "Boleto",
    icon: "📋",
    fee: 0.03,
    settlement: 3,
    currencies: ["BRL"],
  },
  conekta: {
    method: "conekta",
    name: "Conekta",
    icon: "🇲🇽",
    fee: 0.025,
    settlement: 1,
    currencies: ["MXN"],
  },
  oxxo: {
    method: "oxxo",
    name: "OXXO",
    icon: "🏪",
    fee: 0.04,
    settlement: 2,
    currencies: ["MXN"],
  },
  razorpay: {
    method: "razorpay",
    name: "Razorpay",
    icon: "🇮🇳",
    fee: 0.03,
    settlement: 1,
    currencies: ["INR"],
  },
  mpesa: {
    method: "mpesa",
    name: "M-Pesa",
    icon: "📱",
    fee: 0.02,
    settlement: 0,
    currencies: ["KES"],
  },
  paystack: {
    method: "paystack",
    name: "Paystack",
    icon: "✨",
    fee: 0.035,
    settlement: 1,
    currencies: ["NGN", "GHS", "ZAR"],
  },
  flutterwave: {
    method: "flutterwave",
    name: "Flutterwave",
    icon: "🌊",
    fee: 0.035,
    settlement: 1,
    currencies: ["NGN", "GHS", "ZAR", "KES"],
  },
};

export function getAvailablePayments(region: RegionCode): PaymentConfig[] {
  const config = getRegionalConfig(region);
  const methods = config.supportedPayments as PaymentMethod[];

  return methods
    .map(m => PAYMENT_CONFIGS[m])
    .filter(Boolean);
}

export function calculatePaymentFee(amount: number, method: PaymentMethod): number {
  const config = PAYMENT_CONFIGS[method];
  if (!config) return 0;
  return amount * config.fee;
}

export function calculateNetAmount(amount: number, method: PaymentMethod): number {
  return amount - calculatePaymentFee(amount, method);
}
