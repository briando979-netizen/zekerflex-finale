import crypto from "crypto";

/**
 * Generate a test webhook payload for testing
 */
export function generateTestPayload(eventType: string) {
  return {
    id: `evt_${Date.now()}`,
    type: eventType,
    version: 1,
    createdAt: new Date().toISOString(),
    data: {
      id: `obj_${Math.random().toString(36).slice(7)}`,
      created: Date.now(),
      example: "test data",
    },
  };
}

/**
 * Verify webhook signature (for webhook receivers to validate)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const [algorithm, hash] = signature.split("=");

  if (algorithm !== "sha256") return false;

  const computed = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computed));
}

/**
 * Get webhook event examples
 */
export const WEBHOOK_EXAMPLES = {
  "user.created": {
    description: "User account created",
    payload: {
      id: "evt_123456",
      type: "user.created",
      version: 1,
      createdAt: "2024-01-15T10:30:00Z",
      data: {
        userId: "user_abc123",
        email: "user@example.com",
        role: "FREELANCER",
      },
    },
  },
  "invoice.created": {
    description: "Invoice created",
    payload: {
      id: "evt_123457",
      type: "invoice.created",
      version: 1,
      createdAt: "2024-01-15T10:30:00Z",
      data: {
        invoiceId: "inv_123",
        amount: 10000,
        currency: "EUR",
        status: "DRAFT",
      },
    },
  },
  "shift.accepted": {
    description: "Worker accepted a shift",
    payload: {
      id: "evt_123458",
      type: "shift.accepted",
      version: 1,
      createdAt: "2024-01-15T10:30:00Z",
      data: {
        shiftId: "shift_456",
        workerId: "user_abc123",
        acceptedAt: "2024-01-15T10:30:00Z",
      },
    },
  },
};

/**
 * Generate SDK code examples
 */
export const SDK_EXAMPLES = {
  javascript: `
import crypto from 'crypto';

// Verify webhook signature
function verifyWebhook(payload, signature, secret) {
  const [algorithm, hash] = signature.split('=');
  const computed = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return hash === computed;
}

// Handle webhook
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.rawBody;

  if (!verifyWebhook(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  console.log('Webhook received:', event.type);
  res.json({ success: true });
});
`,

  python: `
import hmac
import hashlib
import json

def verify_webhook(payload, signature, secret):
    algorithm, hash_value = signature.split('=')
    computed = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return hash_value == computed

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Webhook-Signature')
    payload = request.get_data(as_text=True)

    if not verify_webhook(payload, signature, os.getenv('WEBHOOK_SECRET')):
        return {'error': 'Invalid signature'}, 401

    event = request.json
    print(f"Webhook received: {event['type']}")
    return {'success': True}
`,

  curl: `
curl -X POST https://your-endpoint.com/webhook \\
  -H 'Content-Type: application/json' \\
  -H 'X-Webhook-ID: evt_123456' \\
  -H 'X-Webhook-Timestamp: 1234567890' \\
  -H 'X-Webhook-Signature: sha256=abc123def456' \\
  -d '{
    "type": "user.created",
    "data": { "id": "user_123", "email": "test@example.com" }
  }'
`,
};

/**
 * Get Postman collection template
 */
export function getPostmanCollection() {
  return {
    info: {
      name: "ZekerFlex Webhooks",
      description: "ZekerFlex webhook events",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      {
        name: "Test Webhook Endpoint",
        request: {
          method: "POST",
          header: [
            { key: "Content-Type", value: "application/json" },
            { key: "X-Webhook-Signature", value: "sha256={{signature}}" },
          ],
          body: {
            mode: "raw",
            raw: JSON.stringify(generateTestPayload("user.created"), null, 2),
          },
          url: {
            raw: "{{webhook_url}}",
            host: ["{{webhook_url}}"],
          },
        },
      },
    ],
  };
}
