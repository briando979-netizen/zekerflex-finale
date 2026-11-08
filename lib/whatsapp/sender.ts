import { AppError } from '@/lib/errors';

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'image' | 'video' | 'document' | 'template';
  content: string | Buffer;
  mediaUrl?: string;
  caption?: string;
  fileName?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
}

export interface WhatsAppMediaUpload {
  phoneNumberId: string;
  mediaPath: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
}

export interface SendResult {
  messageId: string;
  status: 'sent' | 'pending' | 'failed';
  timestamp: Date;
  error?: string;
}

export class WhatsAppHDMediaSender {
  private baseUrl = 'https://graph.instagram.com/v18.0';
  private accessToken: string;
  private phoneNumberId: string;

  constructor(accessToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
  }

  async sendMessage(message: WhatsAppMessage): Promise<SendResult> {
    try {
      const payload = this.buildPayload(message);

      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to send message');
      }

      const data = await response.json();

      return {
        messageId: data.messages?.[0]?.id || 'unknown',
        status: 'sent',
        timestamp: new Date(),
      };
    } catch (err) {
      return {
        messageId: '',
        status: 'failed',
        timestamp: new Date(),
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  async sendBulkMessages(messages: WhatsAppMessage[]): Promise<SendResult[]> {
    const results: SendResult[] = [];

    for (const message of messages) {
      const result = await this.sendMessage(message);
      results.push(result);
      // Rate limiting - 60 messages per second
      await new Promise((resolve) => setTimeout(resolve, 16.67));
    }

    return results;
  }

  async uploadMedia(buffer: Buffer, mediaType: string, fileName: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: `${mediaType}/*` }), fileName);
    formData.append('type', this.getMimeType(mediaType, fileName));

    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body: formData as any,
      });

      if (!response.ok) {
        throw new Error('Failed to upload media');
      }

      const data = await response.json();
      return data.id;
    } catch (err) {
      throw AppError.internal(`Media upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  async sendHDImage(
    phoneNumber: string,
    imageBuffer: Buffer,
    caption?: string
  ): Promise<SendResult> {
    const mediaId = await this.uploadMedia(imageBuffer, 'image', `image-${Date.now()}.jpg`);

    return this.sendMessage({
      to: phoneNumber,
      type: 'image',
      content: '',
      mediaUrl: mediaId,
      caption,
    });
  }

  async sendHDVideo(
    phoneNumber: string,
    videoBuffer: Buffer,
    caption?: string
  ): Promise<SendResult> {
    const mediaId = await this.uploadMedia(videoBuffer, 'video', `video-${Date.now()}.mp4`);

    return this.sendMessage({
      to: phoneNumber,
      type: 'video',
      content: '',
      mediaUrl: mediaId,
      caption,
    });
  }

  async sendTemplate(
    phoneNumber: string,
    templateName: string,
    params: Record<string, string>
  ): Promise<SendResult> {
    return this.sendMessage({
      to: phoneNumber,
      type: 'template',
      content: '',
      templateName,
      templateParams: params,
    });
  }

  private buildPayload(message: WhatsAppMessage): Record<string, any> {
    const basePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.to,
    };

    switch (message.type) {
      case 'text':
        return {
          ...basePayload,
          type: 'text',
          text: { preview_url: true, body: message.content },
        };

      case 'image':
        return {
          ...basePayload,
          type: 'image',
          image: {
            link: message.mediaUrl,
          },
          caption: message.caption,
        };

      case 'video':
        return {
          ...basePayload,
          type: 'video',
          video: {
            link: message.mediaUrl,
          },
          caption: message.caption,
        };

      case 'document':
        return {
          ...basePayload,
          type: 'document',
          document: {
            link: message.mediaUrl,
            filename: message.fileName,
          },
        };

      case 'template':
        return {
          ...basePayload,
          type: 'template',
          template: {
            name: message.templateName,
            language: {
              code: 'nl',
            },
            components: [
              {
                type: 'body',
                parameters: Object.values(message.templateParams || {}).map((v) => ({ type: 'text', text: v })),
              },
            ],
          },
        };

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  private getMimeType(mediaType: string, fileName: string): string {
    const mimeTypes: Record<string, string> = {
      'image': 'image/jpeg',
      'video': 'video/mp4',
      'audio': 'audio/mpeg',
      'document': 'application/pdf',
    };

    if (fileName.endsWith('.webp')) return 'image/webp';
    if (fileName.endsWith('.avif')) return 'image/avif';
    if (fileName.endsWith('.png')) return 'image/png';

    return mimeTypes[mediaType] || 'application/octet-stream';
  }
}

export async function retryWithBackoff(
  fn: () => Promise<SendResult>,
  maxRetries: number = 3
): Promise<SendResult> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      if (result.status === 'sent') return result;
      lastError = new Error(result.error || 'Failed to send');
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (i < maxRetries - 1) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }

  return {
    messageId: '',
    status: 'failed',
    timestamp: new Date(),
    error: lastError?.message || 'Max retries exceeded',
  };
}
