import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { OperatorSessionProvider } from '../src/components/OperatorSessionProvider';
import HomePage from '../src/pages/HomePage';

test('Operator HomePage explains wallet-gated operator access', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      undefined,
      React.createElement(
        OperatorSessionProvider,
        undefined,
        React.createElement(HomePage),
      ),
    ),
  );

  assert.match(html, /Operator Panel/);
  assert.match(html, /Vault controls for operators only/);
  assert.match(html, /Connect Wallet/);
  assert.match(html, /Visit the Vault Public Viewer/);
});
