import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OwnerSettings } from '../src/components/OwnerSettings';

test('OwnerSettings renders claim and subscription controls', () => {
  const html = renderToStaticMarkup(
    React.createElement(OwnerSettings, {
      vaultAddress: '0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883',
      indexedOwnerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }),
  );

  assert.match(html, /Owner Settings/);
  assert.match(html, /Claim this vault/);
  assert.match(html, /Notification destination/);
  assert.match(html, /Discord Webhook/);
  assert.match(html, /Telegram/);
  assert.match(html, /Active subscriptions/);
});
