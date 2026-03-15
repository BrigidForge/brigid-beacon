/**
 * Notification providers – modular and extensible.
 * Add new providers (e.g. Twitter/X, email) by implementing NotificationProvider
 * and registering in getProviders().
 */

import type { NotificationProvider } from './types.js';
import { createTelegramProvider } from './telegram.js';
import { createDiscordProvider } from './discord.js';
import { createWebhookProvider } from './webhook.js';

export type { DispatcheableEvent, FormattedNotification, NotificationProvider } from './types.js';
export { formatNotification } from './format.js';

export function getProviders(): NotificationProvider[] {
  const providers: (NotificationProvider | null)[] = [
    createTelegramProvider(),
    createDiscordProvider(),
    createWebhookProvider(),
  ];
  return providers.filter((p): p is NotificationProvider => p != null);
}
