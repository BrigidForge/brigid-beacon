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
const EMAIL_LOGO_VERSION = '20260322-crop';

function buildVaultUrl(vaultAddress: string): string {
  return `${config.publicAppBaseUrl.replace(/\/$/, '')}/vault/${vaultAddress}`;
}

function buildEmailLogoUrl(): string | null {
  return config.publicAppBaseUrl
    ? `${config.publicAppBaseUrl.replace(/\/$/, '')}/media/logo-transparent.png?v=${EMAIL_LOGO_VERSION}`
    : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildBrandedEmailHtml(params: {
  title: string;
  intro: string;
  bodyHtml: string;
  primaryAction?: { label: string; href: string | null };
  secondaryAction?: { label: string; href: string | null };
  footer?: string;
}) {
  const logoUrl = buildEmailLogoUrl();
  const button = (action: { label: string; href: string | null } | undefined, palette: 'gold' | 'slate') => {
    if (!action?.href) return '';
    const styles =
      palette === 'gold'
        ? 'background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #111827;'
        : 'background: rgba(255,255,255,0.06); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.12);';
    return `<a href="${action.href}" style="display: inline-block; margin-right: 12px; margin-bottom: 12px; padding: 12px 18px; border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 700; ${styles}">${escapeHtml(action.label)}</a>`;
  };

  return `
    <div style="margin: 0; padding: 32px 18px; background: #ffffff; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="max-width: 640px; margin: 0 auto;">
        <div style="margin-bottom: 20px; text-align: center;">
          ${logoUrl ? `<img src="${logoUrl}" alt="Brigid Beacon" style="max-width: 480px; width: 100%; height: auto; margin: 0 auto; display: block;" />` : ''}
        </div>
        <div style="border: 1px solid rgba(255,255,255,0.08); border-radius: 28px; overflow: hidden; background: linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%); box-shadow: 0 24px 80px rgba(15,23,42,0.45);">
          <div style="padding: 28px 28px 22px; background: radial-gradient(circle at top left, rgba(251,191,36,0.18), transparent 28%), radial-gradient(circle at 80% 20%, rgba(56,189,248,0.14), transparent 22%);">
            <p style="margin: 0 0 12px; color: rgba(251,191,36,0.82); font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;">Vault Alert</p>
            <h1 style="margin: 0; color: #ffffff; font-size: 28px; line-height: 1.2;">${escapeHtml(params.title)}</h1>
            <p style="margin: 14px 0 0; color: #cbd5e1; font-size: 15px; line-height: 1.7;">${escapeHtml(params.intro)}</p>
          </div>
          <div style="padding: 0 28px 28px;">
            <div style="margin: 0 0 22px; color: #cbd5e1; font-size: 14px; line-height: 1.75;">${params.bodyHtml}</div>
            <div style="margin: 0 0 10px;">
              ${button(params.primaryAction, 'gold')}
              ${button(params.secondaryAction, 'slate')}
            </div>
            ${params.footer ? `<p style="margin: 18px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.7;">${escapeHtml(params.footer)}</p>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
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

  return {
    text: [
      params.formatted.title,
      '',
      params.formatted.body,
      '',
      `Vault page: ${vaultUrl}`,
      manageUrl ? `Manage alerts: ${manageUrl}` : '',
      unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : '',
    ].join('\n'),
    html: buildBrandedEmailHtml({
      title: params.formatted.title,
      intro: 'A Brigid Beacon vault event matched your public email alert subscription.',
      bodyHtml: `<p style="margin: 0 0 16px;">${escapeHtml(params.formatted.body).replace(/\n/g, '<br/>')}</p><p style="margin: 0; color: #94a3b8; font-size: 13px;">Vault page: <a href="${vaultUrl}" style="color: #7dd3fc; text-decoration: none;">${escapeHtml(vaultUrl)}</a></p>`,
      primaryAction: { label: 'Open vault page', href: vaultUrl },
      secondaryAction: manageUrl ? { label: 'Manage email alerts', href: manageUrl } : unsubscribeUrl ? { label: 'Unsubscribe', href: unsubscribeUrl } : undefined,
      footer: 'You are receiving this because you subscribed to public email alerts for this vault.',
    }),
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
