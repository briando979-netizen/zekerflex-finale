/**
 * Webhook Documentation
 */

export const WEBHOOK_DOCS = {
  overview: `
# ZekerFlex Webhooks

Webhooks allow your application to receive real-time notifications when events occur in ZekerFlex.

## How it works

1. Register a webhook endpoint with ZekerFlex
2. Subscribe to specific event types
3. ZekerFlex sends POST requests to your endpoint when events occur
4. Your endpoint acknowledges receipt with a 2xx status code
5. Failed deliveries are retried up to 5 times

## Event types

- \`user.created\` - New user registered
- \`user.updated\` - User profile updated
- \`invoice.created\` - Invoice created
- \`invoice.paid\` - Invoice paid
- \`shift.created\` - New shift posted
- \`shift.accepted\` - Worker accepted shift
- \`shift.cancelled\` - Shift cancelled
- \`payment.completed\` - Payment processed
- \`contract.signed\` - Contract signed
- \`app.installed\` - App installed by user
- \`app.uninstalled\` - App uninstalled

## Webhook payload

\`\`\`json
{
  "id": "evt_123456789",
  "type": "user.created",
  "version": 1,
  "createdAt": "2024-01-15T10:30:00Z",
  "tenantId": "tenant_abc",
  "data": {
    "userId": "user_xyz",
    "email": "user@example.com",
    "role": "FREELANCER"
  }
}
\`\`\`

## Headers

- \`X-Webhook-ID\` - Unique event ID (use for deduplication)
- \`X-Webhook-Timestamp\` - Unix timestamp
- \`X-Webhook-Signature\` - HMAC SHA256 signature (if secret configured)
- \`Content-Type\` - Always \`application/json\`

## Retry policy

Automatic retries at: 1s, 5s, 30s, 5min, 1hour

Failed deliveries after all retries are logged but not retried further.

## Best practices

1. **Idempotency**: Use \`X-Webhook-ID\` to prevent duplicate processing
2. **Signature verification**: Always verify the signature if you configured a secret
3. **Timeouts**: Respond within 30 seconds
4. **Error handling**: Return 2xx for success, any other code triggers retry
5. **Logging**: Log all webhook events for debugging
`,

  verification: `
# Verifying Webhook Signatures

If you configured a secret when creating the webhook, ZekerFlex will include a signature header.

## Signature format

\`\`\`
X-Webhook-Signature: sha256=<hex-encoded-hmac>
\`\`\`

## Verification steps

1. Extract the signature from the header
2. Create HMAC-SHA256 hash of the request body using your secret
3. Compare the computed hash with the signature value
4. Use constant-time comparison to prevent timing attacks

## Example (Node.js)

\`\`\`javascript
const crypto = require('crypto');

function verifySignature(body, signature, secret) {
  const [algorithm, hash] = signature.split('=');
  const computed = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(computed)
  );
}
\`\`\`
`,

  testing: `
# Testing Your Webhook

Use the ZekerFlex testing console to validate your webhook endpoint before going live.

## Via API

POST /api/webhooks/test
Content-Type: application/json

{
  "url": "https://your-endpoint.com/webhook",
  "eventType": "user.created",
  "secret": "your-secret-if-configured"
}

Response includes:
- statusCode: HTTP response code
- responseBody: Your endpoint's response
- timestamp: When test was sent

## Via Dashboard

1. Go to Settings → Webhooks
2. Click "Test" on your webhook
3. Choose event type to test
4. View results immediately
`,
};

export const WEBHOOK_ERRORS = {
  "invalid_signature": "Signature verification failed. Check your secret.",
  "timeout": "Your endpoint took too long to respond (>30s)",
  "connection_refused": "Could not connect to your endpoint",
  "certificate_verify_failed": "SSL certificate validation failed",
  "http_5xx": "Your endpoint returned a 5xx error",
  "unknown_host": "Could not resolve your endpoint domain",
};
