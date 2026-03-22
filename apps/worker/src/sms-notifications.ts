import { encodePublicEmailActionToken } from '@brigid/beacon-shared-types';
import { config } from './config.js';
import type { DispatcheableEvent, FormattedNotification } from './notifications/types.js';

type PublicSmsSubscriptionRow = {
  id: string;
  follower: { phone: string };
};

const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

function buildVaultUrl(vaultAddress: string): string {
  return `${config.publicAppBaseUrl.replace(/\/$/, '')}/vault/${vaultAddress}`;
}

function buildUnsubscribeUrl(subscription: PublicSmsSubscriptionRow, event: DispatcheableEvent): string {
  const vaultUrl = buildVaultUrl(event.vaultAddress);
  if (!config.publicEmailLinkSecret) return vaultUrl;

  const token = encodePublicEmailActionToken({
    action: 'unsubscribe',
    subscriptionId: subscription.id,
    vaultAddress: event.vaultAddress,
    email: subscription.follower.phone,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }, config.publicEmailLinkSecret);

  return `${vaultUrl}?unsubscribeSmsToken=${encodeURIComponent(token)}`;
}

function buildSmsContent(params: {
  event: DispatcheableEvent;
  formatted: FormattedNotification;
  unsubscribeUrl: string;
}): string {
  const shortAddr = `${params.event.vaultAddress.slice(0, 6)}...${params.event.vaultAddress.slice(-4)}`;
  return `Beacon: ${params.formatted.title} — vault ${shortAddr}. Stop alerts: ${params.unsubscribeUrl}`;
}

export async function sendPublicEventSms(
  subscription: PublicSmsSubscriptionRow,
  event: DispatcheableEvent,
  formatted: FormattedNotification,
): Promise<{ providerMessageId: string | null }> {
  if (!config.brevoApiKey) {
    throw new Error('Brevo SMS delivery is not configured for the Beacon worker.');
  }

  const unsubscribeUrl = buildUnsubscribeUrl(subscription, event);
  const content = buildSmsContent({ event, formatted, unsubscribeUrl });

  const response = await fetch(BREVO_SMS_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': config.brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: config.smsSenderName,
      recipient: subscription.follower.phone,
      content,
      type: 'transactional',
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo SMS API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as { messageId?: number };
  return {
    providerMessageId: data.messageId != null ? String(data.messageId) : null,
  };
}
