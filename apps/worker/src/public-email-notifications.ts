import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
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

let sesClientSingleton: SESv2Client | null | undefined;

function getSesClient(): SESv2Client | null {
  if (sesClientSingleton !== undefined) {
    return sesClientSingleton;
  }

  if (!config.sesFromEmail) {
    sesClientSingleton = null;
    return sesClientSingleton;
  }

  sesClientSingleton = new SESv2Client({ region: config.awsRegion });
  return sesClientSingleton;
}

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
  const sesClient = getSesClient();
  if (!sesClient || !config.sesFromEmail) {
    throw new Error('SES public email delivery is not configured for the Beacon worker.');
  }

  const body = buildEventEmailBody({ event, formatted, subscription });
  const response = await sesClient.send(new SendEmailCommand({
    FromEmailAddress: config.sesFromEmail,
    Destination: {
      ToAddresses: [subscription.follower.email],
    },
    Content: {
      Simple: {
        Subject: {
          Data: `Brigid Beacon: ${formatted.title}`,
        },
        Body: {
          Text: {
            Data: body.text,
          },
          Html: {
            Data: body.html,
          },
        },
      },
    },
  }));

  return {
    providerMessageId: response.MessageId ?? null,
  };
}
