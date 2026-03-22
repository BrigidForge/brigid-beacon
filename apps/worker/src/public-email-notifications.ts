import { encodePublicEmailActionToken } from '@brigid/beacon-shared-types';
import { config } from './config.js';
import type { DispatcheableEvent, FormattedNotification } from './notifications/types.js';

type PublicSubscriptionRow = {
  id: string;
  follower: {
    email: string;
  };
  unsubscribeTokenHash: string;
};

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SENDER_NAME = 'BRIGID BEACON NOTIFICATIONS';

function buildVaultUrl(vaultAddress: string): string {
  return `${config.publicAppBaseUrl.replace(/\/$/, '')}/vault/${vaultAddress}`;
}

function buildSubscriptionActionUrl(params: {
  action: 'manage' | 'unsubscribe';
  subscription: PublicSubscriptionRow;
  event: DispatcheableEvent;
}): string | null {
  if (!config.publicEmailLinkSecret) {
    return buildVaultUrl(params.event.vaultAddress);
  }

  const token = encodePublicEmailActionToken({
    action: params.action,
    subscriptionId: params.subscription.id,
    vaultAddress: params.event.vaultAddress,
    email: params.subscription.follower.email,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }, config.publicEmailLinkSecret);

  const paramName = params.action === 'manage' ? 'manageEmailToken' : 'unsubscribeEmailToken';
  return `${buildVaultUrl(params.event.vaultAddress)}?${paramName}=${encodeURIComponent(token)}`;
}

function buildEventEmailBody(params: {
  event: DispatcheableEvent;
  formatted: FormattedNotification;
  subscription: PublicSubscriptionRow;
}) {
  const vaultUrl = buildVaultUrl(params.event.vaultAddress);
  const manageUrl = buildSubscriptionActionUrl({
    action: 'manage',
    subscription: params.subscription,
    event: params.event,
  });
  const unsubscribeUrl = buildSubscriptionActionUrl({
    action: 'unsubscribe',
    subscription: params.subscription,
    event: params.event,
  });
  const unsubscribeNote = `Manage or unsubscribe from public alerts in Beacon for ${params.subscription.follower.email}.`;

  return {
    text: [
      params.formatted.title,
      '',
      params.formatted.body,
      '',
      `Vault page: ${vaultUrl}`,
      manageUrl ? `Manage alerts: ${manageUrl}` : '',
      unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : '',
      unsubscribeNote,
    ].join('\n'),
    html: [
      `<p><strong>${params.formatted.title}</strong></p>`,
      `<p>${params.formatted.body.replace(/\n/g, '<br/>')}</p>`,
      `<p><a href="${vaultUrl}">Open vault page</a></p>`,
      manageUrl ? `<p><a href="${manageUrl}">Manage email alerts</a></p>` : '',
      unsubscribeUrl ? `<p><a href="${unsubscribeUrl}">Unsubscribe from these alerts</a></p>` : '',
      `<p>${unsubscribeNote}</p>`,
    ].join(''),
  };
}

export async function sendPublicEventEmail(
  subscription: PublicSubscriptionRow,
  event: DispatcheableEvent,
  formatted: FormattedNotification,
): Promise<{ providerMessageId: string | null }> {
  if (!config.brevoApiKey || !config.sesFromEmail) {
    throw new Error('Brevo public email delivery is not configured for the Beacon worker.');
  }

  const body = buildEventEmailBody({ event, formatted, subscription });

  const response = await fetch(BREVO_SEND_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': config.brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: config.sesFromEmail },
      to: [{ email: subscription.follower.email }],
      subject: `Brigid Beacon: ${formatted.title}`,
      textContent: body.text,
      htmlContent: body.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as { messageId?: string };
  return {
    providerMessageId: data.messageId ?? null,
  };
}
