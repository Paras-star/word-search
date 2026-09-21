# Threat Model

## Project Overview

Word Hunt is an offline-first mobile word-search game built with Expo/React Native (TypeScript). Gameplay, scoring, progression, coins, hints, and the reward boundary are entirely client-side and persisted locally via AsyncStorage. The repository is a pnpm monorepo containing:

- `artifacts/word-hunt/` — the Expo mobile app (client-side game logic, deterministic puzzle generation, local persistence, audio/ad/reward boundaries) and a dependency-free static file server (`server/serve.js`) used to serve Expo web builds.
- `artifacts/api-server/` — a minimal Express 5 API server exposing only `/api/health` and `/api/healthz`. No database access, no user data, no authentication surface.
- `artifacts/mockup-sandbox/` — a Vite design/Canvas sandbox (preview `/__mockup`); development-only.

## Assets

- **Local game state** — coins, completed levels, progression stored in AsyncStorage on the device. Compromise is limited to the local device owner; no server-side value.
- **Application source and build artifacts** — served statically. No secrets are embedded.
- There is **no** server-side user data, no credentials store, no payment data, and no database in this project.

## Trust Boundaries

- **Browser/mobile client to static server (`serve.js`)** — serves files from `static-build/`. The only untrusted input is the request path and the `expo-platform` header.
- **Client to API server (`/api`)** — the API exposes only health checks and reads no request-controlled input.
- **Internal/production boundary** — `artifacts/mockup-sandbox` and `artifacts/word-hunt/scripts/build.js` are dev/build-time only and must not be treated as production entry points.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/app.ts` + `routes/*` (health only); `artifacts/word-hunt/server/serve.js` (static serving).
- Highest-risk code (reviewed): `serve.js` path handling (`serveStaticFile`, `serveManifest`).
- Public surfaces: `/api/health`, `/api/healthz`, static assets. No authenticated or admin surface exists.
- Dev-only (ignore unless proven reachable): `artifacts/mockup-sandbox/**`, `artifacts/word-hunt/scripts/build.js` (build-time `fetch` to `localhost:8081`).
- Public non-secret identifiers: AdMob app/unit IDs in `artifacts/word-hunt/services/ads.ts` are intentionally client-embedded, not secrets.

## Threat Categories

### Information Disclosure / Path Traversal

`serve.js` builds file paths from the request path. Reviewed and considered safe: `serveStaticFile` normalizes the path, strips leading `../`, and enforces `filePath.startsWith(STATIC_ROOT)`, returning 403 on escape attempts. `serveManifest` only accepts `platform` values constrained to an `ios`/`android` allowlist before path construction. Static SAST flags on lines 77 and 121 are false positives given these guards.

Guarantee: any future file-serving code must keep the normalize + strip + boundary-check pattern, and any header/param used in a filesystem path must be validated against an allowlist.

### Tampering

Game state (coins, progression) is client-side and locally modifiable by the device owner. This is acceptable because there is no server-authoritative economy and no cross-user impact. If a server-side economy, purchases, or leaderboards are introduced, all state changes must be validated and authorized server-side.

### Spoofing / Elevation of Privilege

Not currently applicable — there is no authentication, no user accounts, and no privileged operations. Introducing any authenticated or admin functionality would require server-side authorization on every sensitive endpoint and object.
