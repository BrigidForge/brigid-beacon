import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationsTab } from '../src/components/NotificationsTab';

test('NotificationsTab renders Beacon notification setup guidance and owner settings', () => {
  const html = renderToStaticMarkup(
    React.createElement(NotificationsTab, {
      vaultAddress: '0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883',
      indexedOwnerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    }),
  );

  assert.match(html, /Beacon Notifications/);
  assert.match(html, /Destinations and subscriptions/);
  assert.match(html, /Owner Settings/);
  assert.match(html, /Telegram/);
});
