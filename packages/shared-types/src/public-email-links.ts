import { createHmac } from 'node:crypto';

export type PublicEmailAction = 'manage' | 'unsubscribe';

export type PublicEmailActionPayload = {
  action: PublicEmailAction;
  subscriptionId: string;
  vaultAddress: string;
  email: string;
  expiresAt: string;
};

export function encodePublicEmailActionToken(
  payload: PublicEmailActionPayload,
  secret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmacSha256Base64Url(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function decodePublicEmailActionToken(
  token: string,
  secret: string,
): PublicEmailActionPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmacSha256Base64Url(secret, encodedPayload);
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<PublicEmailActionPayload>;
    if (
      (payload.action !== 'manage' && payload.action !== 'unsubscribe') ||
      typeof payload.subscriptionId !== 'string' ||
      typeof payload.vaultAddress !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.expiresAt !== 'string'
    ) {
      return null;
    }
    if (Date.parse(payload.expiresAt) <= Date.now()) {
      return null;
    }
    return payload as PublicEmailActionPayload;
  } catch {
    return null;
  }
}

function createHmacSha256Base64Url(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
