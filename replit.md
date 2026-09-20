# Word Hunt

An offline-first mobile word-search game with category progression, two game modes, hints, scoring, coins, and a replaceable reward boundary.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- `pnpm --filter @workspace/word-hunt run dev` — run the Expo mobile app

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/word-hunt/app/` — Expo Router screens for the home, category, mode, game, reward boundary, and results flow
- `artifacts/word-hunt/game/` — deterministic puzzle generation, line selection, scoring, and progression rules
- `artifacts/word-hunt/data/` — the ordered category catalog and local bonus-word dictionary
- `artifacts/word-hunt/services/` — AsyncStorage persistence, reward gateway, audio and ad boundaries
- `artifacts/word-hunt/context/GameProvider.tsx` — hydrated local coin/progression state
- `artifacts/api-server/src/routes/health.ts` — minimal `/api/health` endpoint

## Architecture decisions

- Gameplay is entirely client-side and does not depend on the API server or network access.
- The puzzle generator uses a seeded PRNG so puzzle creation is deterministic and independently testable.
- Progress is stored centrally through AsyncStorage; malformed values fall back safely to 300 coins and no completed levels.
- Puzzle completion calls `RewardGateway` before navigating to the intentionally generic reward placeholder; no reward records or dumpling-specific concepts exist in Phase 1.
- The current Expo-compatible build keeps audio and ad integrations non-blocking and platform-safe so unavailable native services never stop gameplay.

## Product

Players choose from 15 ordered categories, select Classic or two-minute Time Mode, find target words in all eight directions, earn bonus-word points, use three hints, complete levels for coins, and unlock the next category locally.

## User preferences

The user requested a complete Word Hunt Phase 1 implementation without the future Mystery Dumpling reward system.

## Gotchas

- Use `pnpm --filter @workspace/word-hunt run typecheck` for the mobile app; use `pnpm dlx expo-doctor@latest` for Expo dependency validation.
- Do not add dumpling-specific models, assets, rarity rules, or persistence until a later reward phase.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
