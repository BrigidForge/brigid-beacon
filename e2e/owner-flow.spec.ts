import http from 'node:http';
import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { Wallet } from 'ethers';

const prisma = new PrismaClient();

const vaultAddress = '0x524F04724632eED237cbA3c37272e018b3A7967e';
const ownerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ownerWallet = new Wallet(ownerKey);
const ownerAddress = ownerWallet.address;
const webhookPort = 8788;
const webhookUrl = `http://127.0.0.1:${webhookPort}/hook`;

let receivedBodies: string[] = [];
let webhookServer: http.Server | null = null;

async function resetOwnerState() {
  await prisma.notificationDelivery.deleteMany({
    where: {
      subscription: {
        vaultAddress,
      },
    },
  });
  await prisma.notificationSubscription.deleteMany({
    where: {
      vaultAddress,
    },
  });
  await prisma.notificationDestination.deleteMany({
    where: {
      ownerAddress,
    },
  });
  await prisma.ownerSession.deleteMany({
    where: {
      ownerAddress,
    },
  });
  await prisma.vaultClaim.deleteMany({
    where: {
      vaultAddress,
    },
  });
  await prisma.claimNonce.deleteMany({
    where: {
      vaultAddress,
    },
  });
  await prisma.beaconEvent.updateMany({
    where: {
      vaultAddress,
    },
    data: {
      dispatchedAt: null,
    },
  });
}

test.beforeAll(async () => {
  receivedBodies = [];
  webhookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      receivedBodies.push(body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => {
    webhookServer!.listen(webhookPort, '127.0.0.1', () => resolve());
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
  await new Promise<void>((resolve, reject) => {
    if (!webhookServer) {
      resolve();
      return;
    }

    webhookServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

test.beforeEach(async ({ page }) => {
  receivedBodies = [];
  await resetOwnerState();
  await page.exposeFunction('beaconSignMessage', async (message: string) => ownerWallet.signMessage(message));
  await page.addInitScript(
    ({ injectedOwnerAddress }) => {
      const ethereum = {
        async request(args: { method: string; params?: unknown[] }) {
          if (args.method === 'eth_requestAccounts') {
            return [injectedOwnerAddress];
          }

          if (args.method === 'personal_sign') {
            const [message] = (args.params ?? []) as [string];
            return (window as typeof window & {
              beaconSignMessage: (value: string) => Promise<string>;
            }).beaconSignMessage(message);
          }

          throw new Error(`Unsupported wallet method: ${args.method}`);
        },
      };

      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        value: ethereum,
      });
    },
    { injectedOwnerAddress: ownerAddress },
  );
});

test('owner can claim a vault, subscribe a webhook, and see delivery history', async ({ page }) => {
  await page.goto(`/vault/${vaultAddress}`);

  await expect(page.getByRole('heading', { name: 'Claim and manage alerts' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByText('Session:')).toContainText('not established');

  await page.getByRole('button', { name: 'Claim this vault' }).click();
  await expect(page.getByText('Vault claim verified. You can now manage destinations and subscriptions.')).toBeVisible();
  await expect(page.getByText('Session:')).toContainText('active');

  await page.getByLabel('Label').fill('Playwright webhook');
  await page.getByLabel('Webhook URL').fill(webhookUrl);
  await page.getByRole('button', { name: 'Save destination' }).click();
  await expect(page.getByText('Webhook destination saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Save subscription' }).click();
  await expect(page.getByText('Subscription saved for this vault.')).toBeVisible();

  await expect
    .poll(() => receivedBodies.length, {
      timeout: 15_000,
      message: 'expected Beacon worker to deliver a webhook event',
    })
    .toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Claim and manage alerts' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(
    page.getByText(/Withdrawal Executed to Playwright webhook|Request Expired to Playwright webhook/),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Delivered .* attempt/)).toBeVisible();

  await page.getByRole('button', { name: 'Clear session' }).click();
  await expect(page.getByText('Owner session cleared on this device.')).toBeVisible();
});
