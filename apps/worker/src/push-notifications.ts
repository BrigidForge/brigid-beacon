import webpush from 'web-push';
import { config } from './config.js';
import type { DispatcheableEvent, FormattedNotification } from './notifications/types.js';

type PushSubscriptionJson = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

type PushSendResult = {
  providerMessageId: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePushSubscription(value: unknown): PushSubscriptionJson | null {
  if (!isObject(value) || typeof value.endpoint !== 'string' || value.endpoint.length === 0) {
    return null;
  }

  const keys = isObject(value.keys) ? value.keys : null;
  if (!keys || typeof keys.auth !== 'string' || typeof keys.p256dh !== 'string') {
    return null;
  }

  return {
    endpoint: value.endpoint,
    expirationTime: typeof value.expirationTime === 'number' ? value.expirationTime : null,
    keys: {
      auth: keys.auth,
      p256dh: keys.p256dh,
    },
  };
}

function buildPayload(event: DispatcheableEvent, formatted: FormattedNotification) {
  return JSON.stringify({
    title: 'Brigid Beacon',
    body: formatted.shortSummary,
    icon: '/media/triquetra_transparent.png',
    badge: '/media/triquetra_transparent.png',
    tag: `${event.vaultAddress}:${event.kind}`,
    url: formatted.publicViewerLink ?? `/view/${event.vaultAddress}`,
    data: {
      eventId: event.id,
      vaultAddress: event.vaultAddress,
      kind: event.kind,
      transactionHash: event.transactionHash,
      viewerUrl: formatted.publicViewerLink ?? `/view/${event.vaultAddress}`,
      transactionUrl: formatted.transactionLink,
      title: formatted.title,
      body: formatted.body,
    },
  });
}

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  if (!config.webPushVapidPublicKey || !config.webPushVapidPrivateKey) {
    throw new Error('Web Push VAPID keys are not configured for the Beacon worker.');
  }

  webpush.setVapidDetails(
    config.webPushVapidSubject,
    config.webPushVapidPublicKey,
    config.webPushVapidPrivateKey,
  );
  vapidConfigured = true;
}

export function isInvalidPushEndpointError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const statusCode = 'statusCode' in error ? (error as { statusCode?: number }).statusCode : undefined;
  return statusCode === 404 || statusCode === 410;
}

export async function sendWebPushNotification(
  subscriptionJson: unknown,
  event: DispatcheableEvent,
  formatted: FormattedNotification,
): Promise<PushSendResult> {
  ensureVapidConfigured();
  const subscription = parsePushSubscription(subscriptionJson);
  if (!subscription) {
    throw new Error('Browser push subscription payload is missing endpoint or keys.');
  }

  const response = await webpush.sendNotification(subscription, buildPayload(event, formatted), {
    TTL: 60,
    urgency: 'high',
    topic: `${event.vaultAddress}:${event.kind}`.slice(0, 32),
  });

  return {
    providerMessageId: response.headers?.location ?? response.headers?.['x-request-id'] ?? null,
  };
}
