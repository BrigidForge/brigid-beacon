# Beacon notification providers

Modular notification layer. Each provider implements `NotificationProvider` and is registered in `getProviders()`.

## Adding a new provider (e.g. Twitter/X, email)

1. **Create a new file** (e.g. `twitter.ts` or `email.ts`).
2. **Implement the interface:**

   ```ts
   import type { NotificationProvider } from './types.js';

   export function createTwitterProvider(): NotificationProvider | null {
     const token = process.env.TWITTER_BEARER_TOKEN;
     if (!token) return null;
     return {
       name: 'twitter',
       async send(event, formatted) {
         // POST to Twitter API using event + formatted.title, .body, .shortSummary, etc.
       },
     };
   }
   ```

3. **Add env vars** in `config.ts` (optional string) and `.env.example`.
4. **Register** in `index.ts`: `getProviders()` – push `createTwitterProvider()` (if not null) into the returned array.

No changes to the dispatcher are required; it iterates over whatever providers `getProviders()` returns.
