import { z } from "zod";

const smsResult = z.object({
  messageId: z.string(),
  status: z.enum(["SENT", "FAILED", "QUEUED"]),
  cost: z.number().optional(),
  error: z.string().optional(),
});

export type SMSResult = z.infer<typeof smsResult>;

interface SMSProvider {
  send(to: string, message: string): Promise<SMSResult>;
  getBalance(): Promise<number>;
  getName(): string;
}

class TwilioProvider implements SMSProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async send(to: string, message: string): Promise<SMSResult> {
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: this.fromNumber,
          To: to,
          Body: message,
        }).toString(),
      });

      const data = (await response.json()) as any;

      if (response.ok) {
        return { messageId: data.sid, status: "SENT", cost: 0.01 };
      } else {
        return { messageId: "", status: "FAILED", error: data.message };
      }
    } catch (error) {
      return { messageId: "", status: "FAILED", error: String(error) };
    }
  }

  async getBalance(): Promise<number> {
    return 0;
  }

  getName(): string {
    return "Twilio";
  }
}

class SNSProvider implements SMSProvider {
  private region: string;
  private accessKey: string;
  private secretKey: string;

  constructor(region: string, accessKey: string, secretKey: string) {
    this.region = region;
    this.accessKey = accessKey;
    this.secretKey = secretKey;
  }

  async send(to: string, message: string): Promise<SMSResult> {
    try {
      const response = await fetch(`https://sns.${this.region}.amazonaws.com/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          Action: "Publish",
          PhoneNumber: to,
          Message: message,
          Version: "2010-03-31",
        }).toString(),
      });

      if (response.ok) {
        const text = await response.text();
        const messageId = text.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1] || "";
        return { messageId, status: "SENT", cost: 0.00645 };
      } else {
        return { messageId: "", status: "FAILED", error: "AWS SNS error" };
      }
    } catch (error) {
      return { messageId: "", status: "FAILED", error: String(error) };
    }
  }

  async getBalance(): Promise<number> {
    return 0;
  }

  getName(): string {
    return "AWS SNS";
  }
}

class NexmoProvider implements SMSProvider {
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async send(to: string, message: string): Promise<SMSResult> {
    try {
      const response = await fetch("https://rest.nexmo.com/sms/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          api_secret: this.apiSecret,
          to,
          from: "ZekerFlex",
          text: message,
        }),
      });

      const data = (await response.json()) as any;

      if (data.messages?.[0]?.status === "0") {
        return { messageId: data.messages[0]["message-id"], status: "SENT", cost: 0.04 };
      } else {
        return { messageId: "", status: "FAILED", error: data.messages?.[0]?.["error-text"] };
      }
    } catch (error) {
      return { messageId: "", status: "FAILED", error: String(error) };
    }
  }

  async getBalance(): Promise<number> {
    return 0;
  }

  getName(): string {
    return "Nexmo";
  }
}

export class ProviderRouter {
  private providers: Map<string, SMSProvider> = new Map();
  private primaryProvider: string;
  private fallbackProvider?: string;

  addProvider(name: string, provider: SMSProvider) {
    this.providers.set(name, provider);
    if (!this.primaryProvider) this.primaryProvider = name;
  }

  setPrimary(name: string) {
    this.primaryProvider = name;
  }

  setFallback(name: string) {
    this.fallbackProvider = name;
  }

  async send(to: string, message: string): Promise<SMSResult> {
    const primary = this.providers.get(this.primaryProvider);
    if (!primary) throw new Error("No primary provider configured");

    const result = await primary.send(to, message);

    if (result.status === "FAILED" && this.fallbackProvider) {
      const fallback = this.providers.get(this.fallbackProvider);
      if (fallback) return fallback.send(to, message);
    }

    return result;
  }

  async getBalance(): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};
    for (const [name, provider] of this.providers) {
      balances[name] = await provider.getBalance();
    }
    return balances;
  }
}

export { TwilioProvider, SNSProvider, NexmoProvider };
