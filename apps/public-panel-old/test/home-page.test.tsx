import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../src/pages/HomePage';

test('Public HomePage keeps visitor messaging and lookup controls', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      undefined,
      React.createElement(HomePage),
    ),
  );

  assert.match(html, /Public Beacon Surface/);
  assert.match(html, /Vault activity for visitors, not operators/);
  assert.match(html, /Configured Vaults/);
  assert.match(html, /No curated vault list is configured yet/);
  assert.match(html, /Open Vault/);
});
