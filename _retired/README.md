# _retired/

This directory contains **retired and superseded code** that is no longer part of the active application.

These directories are preserved for historical reference only.

## DO NOT use, modify, or reference any code in this directory.

| Directory | Was | Superseded by |
|---|---|---|
| `operator-panel-old/` | Standalone operator panel app | `apps/vault-ui` (React Router `/operator`) |
| `public-panel-old/` | Standalone public viewer app | `apps/vault-ui` (React Router `/view`) |
| `brigid-vault-ui-old/` | Original HTML prototype UI | `apps/vault-ui` |
| `public-panel/` | Standalone public panel skeleton | `apps/vault-ui` (React Router `/view`) |

## Active UI

The **only** active frontend is `apps/vault-ui` — a unified React+Vite+Tailwind SPA.

- Public viewer: `/view` and `/view/:vault`
- Operator panel: `/operator` and `/operator/:vault`

See `CLAUDE.md` at the repo root for full context.
