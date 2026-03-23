import type {
  DeploymentProof,
  VaultEventsResponse,
  VaultMetadata,
  VaultStatus,
} from '@brigid/beacon-shared-types';

const API_BASE =
  (typeof import.meta !== 'undefined' &&
  typeof import.meta.env === 'object' &&
  import.meta.env &&
  'VITE_API_BASE_URL' in import.meta.env
    ? import.meta.env.VITE_API_BASE_URL
    : '') ?? '';

function resolveRequestUrl(path: string): string {
  if (API_BASE) {
    const trimmedBase = API_BASE.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const dedupedPath =
      trimmedBase.endsWith('/api') && normalizedPath.startsWith('/api/')
        ? normalizedPath.slice('/api'.length)
        : normalizedPath;
    return `${trimmedBase}${dedupedPath}`;
  }

  if (typeof window !== 'undefined' && window.location.hostname === 'www.beacon.brigidforge.com') {
    return `https://beacon.brigidforge.com${path}`;
  }

  return path;
}

function describeNetworkFailure(url: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  if (typeof window !== 'undefined' && window.location.hostname === 'www.beacon.brigidforge.com') {
    return new Error(
      `The operator API could not be reached from www.beacon.brigidforge.com. Use https://beacon.brigidforge.com instead, or update the deployment so /api is available on the current host.\n\nRequest: ${url}\nDetail: ${detail}`,
    );
  }

  return new Error(`Network request failed for ${url}.\n\nDetail: ${detail}`);
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

async function getJson<T>(path: string, headers?: HeadersInit): Promise<T> {
  const url = resolveRequestUrl(path);
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw describeNetworkFailure(url, error);
  }
  return readJsonOrThrow<T>(response);
}

async function sendJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers: HeadersInit =
    init.body == null
      ? { ...(init.headers ?? {}) }
      : {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        };

  const url = resolveRequestUrl(path);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (error) {
    throw describeNetworkFailure(url, error);
  }
  return readJsonOrThrow<T>(response);
}

export type ClaimNonceResponse = {
  vaultAddress: string;
  ownerAddress: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  message: string;
};

export type ClaimStatusResponse = {
  vaultAddress: string;
  ownerAddress: string;
  claimed: boolean;
  claimedAt: string | null;
  lastVerifiedAt: string | null;
};

export type OwnerSessionResponse = {
  ownerAddress: string;
  expiresAt: string;
  lastSeenAt: string;
};

export type NotificationDestinationRecord = {
  id: string;
  ownerAddress?: string;
  kind: string;
  label: string;
  createdAt: string;
  disabledAt: string | null;
  config: Record<string, unknown>;
};

export type DestinationListResponse = {
  ownerAddress: string;
  destinations: NotificationDestinationRecord[];
};

export type TelegramConnectResponse = {
  ownerAddress: string;
  botUsername: string;
  label: string;
  expiresAt: string;
  startToken: string;
  deepLinkUrl: string;
};

export type WithdrawalPurposeResponse = {
  vaultAddress: string;
  purposeHash: string;
  purposeText: string;
  updatedAt: string;
};

export type NotificationSubscriptionRecord = {
  id: string;
  vaultAddress: string;
  destinationId: string;
  eventKinds: string[];
  createdAt: string;
  disabledAt: string | null;
  destination?: {
    id: string;
    kind: string;
    label: string;
    config: Record<string, unknown>;
  };
};

export type SubscriptionListResponse = {
  ownerAddress: string;
  subscriptions: NotificationSubscriptionRecord[];
};

export type DeliveryListResponse = {
  ownerAddress: string;
  deliveries: Array<{
    id: string;
    status: string;
    vaultAddress: string;
    beaconEventId: string;
    eventKind: string;
    destination: {
      id: string;
      kind: string;
      label: string;
    };
    attemptCount: number;
    lastAttemptAt: string | null;
    deliveredAt: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
};

export type OwnerPortfolioResponse = {
  ownerAddress: string;
  vaults: Array<{
    metadata: VaultMetadata;
    status: VaultStatus;
    claim: {
      claimed: boolean;
      claimedAt: string | null;
    };
    activeSubscriptionCount: number;
    recentDeliveryFailures: number;
    lastDeliveryAt: string | null;
  }>;
};

export type OperatorHealthResponse = {
  chainId: number;
  factoryAddress: string;
  chainHeadBlock: number;
  indexer: {
    stateId: string;
    stateIdConfigured: string;
    lastIndexedBlock: number;
    lastIndexedBlockHash: string | null;
    lastIndexedAt: string | null;
    lastIndexerRunAt: string | null;
    lastDispatcherRunAt: string | null;
    discoveryMode: string | null;
    lagBlocks: number;
    lagSeconds: number | null;
    isStale: boolean;
    staleThresholdMs: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
  };
  stats: {
    vaultCount: number;
    beaconEventCount: number;
    activeSubscriptionCount: number;
    pendingDeliveryCount: number;
    failedDeliveryCount: number;
  };
};

export type OperatorOwnedVaultsResponse = {
  ownerAddress: string;
  vaults: Array<{
    metadata: VaultMetadata;
    status: VaultStatus;
  }>;
};

export type AnalyticsOverviewResponse = {
  vaultCount: number;
  tokenCount: number;
  ownerCount: number;
  deployerCount: number;
  beaconEventCount: number;
};

export type TokenAnalyticsSummary = {
  tokenAddress: string;
  vaultCount: number;
  ownerCount: number;
  deployerCount: number;
  totalAllocation: string;
  protectedOutstandingBalance: string;
  excessBalance: string;
};

export type TokenAnalyticsListResponse = {
  tokens: TokenAnalyticsSummary[];
};

export type TokenAnalyticsDetailResponse = TokenAnalyticsSummary & {
  vaults: Array<{
    metadata: VaultMetadata;
    status: VaultStatus;
    deployer: string;
  }>;
};

export type PublicEmailSubscriptionResponse = {
  status: 'confirmed' | 'pending_confirmation';
  vaultAddress: string;
  email: string;
  eventKinds: string[];
  expiresAt: string | null;
  deliveryMode: 'preview' | 'ses' | 'confirmed';
  message: string;
  previewConfirmToken: string;
  previewConfirmUrl: string | null;
  previewUnsubscribeToken: string;
  previewUnsubscribeUrl: string | null;
};

export type PublicEmailConfirmationResponse = {
  confirmed: boolean;
  email: string;
  vaultAddress: string;
  confirmedAt: string;
  eventKinds: string[];
};

export type PublicEmailUnsubscribeResponse = {
  unsubscribed: boolean;
  email: string;
  vaultAddress: string;
  unsubscribedAt: string;
};

export type PublicEmailManageLinkResponse = {
  sent: boolean;
  email: string;
  vaultAddress: string;
  expiresAt: string;
  deliveryMode: 'preview' | 'brevo';
  previewManageToken: string;
  previewManageUrl: string | null;
  message: string;
};

export type PublicEmailSubscriptionStatusResponse = {
  vaultAddress: string;
  email: string;
  subscribed: boolean;
  confirmed: boolean;
  disabled: boolean;
  eventKinds: string[];
  confirmedAt?: string | null;
  disabledAt?: string | null;
};

export async function fetchVaultBundle(address: string): Promise<{
  metadata: VaultMetadata;
  status: VaultStatus;
  events: VaultEventsResponse['events'];
  purposeTexts: VaultEventsResponse['purposeTexts'];
  proof: DeploymentProof;
}> {
  const [metadata, status, eventsResponse, proof] = await Promise.all([
    getJson<VaultMetadata>(`/api/v1/vaults/${address}`),
    getJson<VaultStatus>(`/api/v1/vaults/${address}/status`),
    getJson<VaultEventsResponse>(`/api/v1/vaults/${address}/events?limit=50`),
    getJson<DeploymentProof>(`/api/v1/vaults/${address}/proof`),
  ]);

  return {
    metadata,
    status,
    events: eventsResponse.events,
    purposeTexts: eventsResponse.purposeTexts,
    proof,
  };
}

export async function fetchOperatorHealth(): Promise<OperatorHealthResponse> {
  return getJson<OperatorHealthResponse>('/api/v1/operator/health');
}

export async function requestClaimNonce(vaultAddress: string, ownerAddress: string): Promise<ClaimNonceResponse> {
  return sendJson<ClaimNonceResponse>('/api/v1/owner/claims/nonce', {
    method: 'POST',
    body: JSON.stringify({ vaultAddress, ownerAddress }),
  });
}

export async function verifyClaim(
  vaultAddress: string,
  ownerAddress: string,
  nonce: string,
  signature: string,
): Promise<{ claimed: boolean; claimedAt: string; sessionToken: string; sessionExpiresAt: string }> {
  return sendJson('/api/v1/owner/claims/verify', {
    method: 'POST',
    body: JSON.stringify({ vaultAddress, ownerAddress, nonce, signature }),
  });
}

function authHeaders(sessionToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${sessionToken}`,
  };
}

export function getStoredOwnerSession(): { sessionToken: string; ownerAddress: string; expiresAt: string } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const raw = window.localStorage.getItem('beacon_owner_session');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { sessionToken: string; ownerAddress: string; expiresAt: string };
  } catch {
    return null;
  }
}

export function storeOwnerSession(session: { sessionToken: string; ownerAddress: string; expiresAt: string }) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem('beacon_owner_session', JSON.stringify(session));
}

export function clearStoredOwnerSession() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem('beacon_owner_session');
}

export async function fetchOwnerSession(sessionToken: string): Promise<OwnerSessionResponse> {
  return getJson<OwnerSessionResponse>('/api/v1/owner/session', authHeaders(sessionToken));
}

export async function revokeOwnerSession(sessionToken: string): Promise<{ revoked: boolean; revokedAt: string }> {
  const response = await fetch(`${API_BASE}/api/v1/owner/session`, {
    method: 'DELETE',
    headers: authHeaders(sessionToken),
  });
  return readJsonOrThrow(response);
}

export async function fetchClaimStatus(vaultAddress: string, sessionToken: string): Promise<ClaimStatusResponse> {
  return getJson<ClaimStatusResponse>(`/api/v1/owner/claims/${vaultAddress}`, {
    ...authHeaders(sessionToken),
  });
}

export async function fetchDestinations(sessionToken: string): Promise<DestinationListResponse> {
  return getJson<DestinationListResponse>('/api/v1/owner/destinations', authHeaders(sessionToken));
}

export async function createDestination(input: {
  sessionToken: string;
  ownerAddress: string;
  kind: 'webhook' | 'discord_webhook' | 'telegram';
  label: string;
  config: Record<string, unknown>;
}): Promise<NotificationDestinationRecord> {
  return sendJson<NotificationDestinationRecord>('/api/v1/owner/destinations', {
    method: 'POST',
    headers: authHeaders(input.sessionToken),
    body: JSON.stringify(input),
  });
}

export async function disableDestination(sessionToken: string, destinationId: string): Promise<{ disabled: boolean; disabledAt: string }> {
  return sendJson(`/api/v1/owner/destinations/${destinationId}`, {
    method: 'DELETE',
    headers: authHeaders(sessionToken),
  });
}

export async function createTelegramConnectLink(
  sessionToken: string,
  label: string,
): Promise<TelegramConnectResponse> {
  return sendJson<TelegramConnectResponse>('/api/v1/owner/destinations/telegram/connect', {
    method: 'POST',
    headers: authHeaders(sessionToken),
    body: JSON.stringify({ label }),
  });
}

export async function saveWithdrawalPurpose(input: {
  sessionToken: string;
  vaultAddress: string;
  purposeHash: string;
  purposeText: string;
}): Promise<WithdrawalPurposeResponse> {
  return sendJson<WithdrawalPurposeResponse>(`/api/v1/owner/vaults/${input.vaultAddress}/purposes`, {
    method: 'POST',
    headers: authHeaders(input.sessionToken),
    body: JSON.stringify({
      purposeHash: input.purposeHash,
      purposeText: input.purposeText,
    }),
  });
}

export async function fetchSubscriptions(sessionToken: string, vaultAddress: string): Promise<SubscriptionListResponse> {
  return getJson<SubscriptionListResponse>(`/api/v1/owner/subscriptions?vaultAddress=${vaultAddress}`, authHeaders(sessionToken));
}

export async function createSubscription(input: {
  sessionToken: string;
  vaultAddress: string;
  ownerAddress: string;
  destinationId: string;
  eventKinds: string[];
}): Promise<NotificationSubscriptionRecord> {
  return sendJson<NotificationSubscriptionRecord>('/api/v1/owner/subscriptions', {
    method: 'POST',
    headers: authHeaders(input.sessionToken),
    body: JSON.stringify(input),
  });
}

export async function disableSubscription(sessionToken: string, subscriptionId: string): Promise<{ disabled: boolean; disabledAt: string }> {
  return sendJson(`/api/v1/owner/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: authHeaders(sessionToken),
  });
}

export async function fetchDeliveries(sessionToken: string, vaultAddress: string): Promise<DeliveryListResponse> {
  return getJson<DeliveryListResponse>(`/api/v1/owner/deliveries?vaultAddress=${vaultAddress}`, authHeaders(sessionToken));
}

export async function fetchOwnerPortfolio(sessionToken: string): Promise<OwnerPortfolioResponse> {
  return getJson<OwnerPortfolioResponse>('/api/v1/owner/portfolio', authHeaders(sessionToken));
}

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverviewResponse> {
  return getJson<AnalyticsOverviewResponse>('/api/v1/analytics/overview');
}

export async function fetchOperatorOwnedVaults(ownerAddress: string): Promise<OperatorOwnedVaultsResponse> {
  const params = new URLSearchParams({ ownerAddress });
  return getJson<OperatorOwnedVaultsResponse>(`/api/v1/operator/vaults?${params.toString()}`);
}

export async function fetchTokenAnalyticsList(): Promise<TokenAnalyticsListResponse> {
  return getJson<TokenAnalyticsListResponse>('/api/v1/analytics/tokens');
}

export async function fetchTokenAnalyticsDetail(tokenAddress: string): Promise<TokenAnalyticsDetailResponse> {
  return getJson<TokenAnalyticsDetailResponse>(`/api/v1/analytics/tokens/${tokenAddress}`);
}

export async function createPublicEmailSubscription(input: {
  vaultAddress: string;
  email: string;
  eventKinds: string[];
}): Promise<PublicEmailSubscriptionResponse> {
  return sendJson<PublicEmailSubscriptionResponse>('/api/v1/public/email-subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function confirmPublicEmailSubscription(token: string): Promise<PublicEmailConfirmationResponse> {
  return sendJson<PublicEmailConfirmationResponse>('/api/v1/public/email-subscriptions/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function unsubscribePublicEmailSubscription(token: string): Promise<PublicEmailUnsubscribeResponse> {
  return sendJson<PublicEmailUnsubscribeResponse>('/api/v1/public/email-subscriptions/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function requestPublicEmailManageLink(
  vaultAddress: string,
  email: string,
): Promise<PublicEmailManageLinkResponse> {
  return sendJson<PublicEmailManageLinkResponse>('/api/v1/public/email-subscriptions/manage-link', {
    method: 'POST',
    body: JSON.stringify({ vaultAddress, email }),
  });
}

export async function fetchPublicEmailSubscriptionStatus(
  vaultAddress: string,
  email: string,
): Promise<PublicEmailSubscriptionStatusResponse> {
  const params = new URLSearchParams({
    vaultAddress,
    email,
  });
  return getJson<PublicEmailSubscriptionStatusResponse>(`/api/v1/public/email-subscriptions/status?${params.toString()}`);
}

export async function fetchManagedPublicEmailSubscriptionStatus(
  token: string,
): Promise<PublicEmailSubscriptionStatusResponse> {
  const params = new URLSearchParams({ token });
  return getJson<PublicEmailSubscriptionStatusResponse>(`/api/v1/public/email-subscriptions/manage?${params.toString()}`);
}
