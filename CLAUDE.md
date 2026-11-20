# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
For people, the same map with diagrams is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What this is

openGym is a self-hosted gym and body-weight tracker. Two containers (`api` + `web`) plus a
`./data` folder the user owns: no third-party account, no telemetry. Passkey (WebAuthn) login,
installable as a PWA, and Capacitor apps for Android and iPhone (with an Apple Watch app and
widgets) that work on their own or synced to a server. License: AGPL-3.0-or-later; the exercise
media are licensed separately (NOTICE.md).

## Project layout

```
frontend/   React 19 + Vite app (src/views, src/components, src/store, src/lib, src/sheets.jsx).
            ios/ is the Capacitor shell (docs/MOBILE.md), kept but not built; it also holds the
            Apple Watch app (Watch, WatchCore, WatchWidgets) on lib/watch-sync.js, the widgets and
            the animation-pack downloader. Android, Wear OS, Garmin and Zepp are removed in this
            fork; `platform === 'android'` branches left in shared JS are dead code.
api/        Backend: server.js (plain node:http) plus small testable modules beside it.
            shared/ holds the code the frontend imports too (streaks, starter plans, plan validation).
            openapi.yaml documents every route.
web/        Multi-stage Dockerfile (builds frontend, adds catalogue/media, serves with nginx) and
            nginx.conf.template (serves the app, proxies /api).
catalogue/  The exercise database: exercises/<id>.json, i18n/, licensed 180 px media/.
mcp/        Optional MCP server: stdio (src/index.js, reads DATA_DIR or the api) and Streamable
            HTTP (src/http.js, the opt-in `mcp` container behind /mcp, scoped tokens only).
            Write tools (log_workout, routines) save through the api. docs/MCP_REMOTE.md.
scripts/    Build, CI and release helpers (scripts/README.md).
docs/       Guides indexed in docs/README.md; docs/dev/ holds feature design notes.
```

## Commands

```bash
# Local stack (api + web, prebuilt or built from source)
cp .env.example .env
docker compose up -d --build

# Frontend dev server (hot reload), proxies /api to :3000
cd frontend && npm install && npm run dev

# Tests (Node 22, the version CI and the Dockerfiles use)
cd frontend && npm test                          # vitest run, the whole suite
cd frontend && npx vitest run src/lib/progression.test.js   # one file
cd frontend && npx vitest run -t "some test name"           # one test by name
cd api && npm test                               # node --test
cd mcp && npm test

# Checks CI runs besides the suites
cd frontend && node scripts/check-locales.mjs && node scripts/check-source-strings.mjs --strict
node scripts/catalogue/build.mjs --check
node scripts/build-shared-assets.mjs --check

# Builds
cd frontend && npm run build
cd frontend && npm run build:mobile   # VITE_MOBILE build + 180 px media from catalogue/media + cap sync
```

There is no linter/formatter config and no TypeScript; match the existing style by hand.

This is a personal fork (github.com/magzhanspace/opengym, branch `main`) of
github.com/DuarteSantos8/openGym v1.4.5, remote `upstream`. FORK.md lists what was cut and what
is kept; upstream is not merged back. `.github/workflows/test.yml` runs the suites and checks on
push. The app is deployed as a PWA on gym.magjan.dev (hermes); the iOS shell is kept but not built.

## Architecture

### Frontend (`frontend/src`)

- **`store/useStore.js`**: a single Zustand store holding the client-side app state (`S`),
  persisted to `localStorage` (`gym_state_v1`) and debounce-pushed to the server when signed in
  (`pushState`, see `lib/api.js`). On the phones it is also mirrored to a file via `lib/mobile.js`
  (`nativeSave`), since WebView storage can be evicted. `store/useUI.js` holds ephemeral UI state
  (modals, active sheet, rest timer) separately from persisted data.
- **`lib/`**: pure, framework-free helpers, each paired with a same-directory `*.test.js`. The
  domain logic lives here, most importantly:
  - `progression.js`: the progression-rule engine (linear, Greyskull LP, double and triple
    progression, time-based). Rules implement a shared policy interface.
  - `onerm.js`: estimated 1RM from logged sets (several formulas).
  - `finish-workout.js`: reduces a completed session back into state (weights advance, PRs).
  - `recovery.js` / `recovery-view.js`: the fatigue and muscle-recovery model.
  - `warmup-ramp.js` (+ `warmup-snap.js`): automatic warm-ups by load, a slot's own warm-up rows,
    rounded to the active gym (plates.js dropGrid); history.js rerampWarmups keeps them aimed.
  - `session-adapt.js`: applies changes to the workout in progress (the go-lighter daily form).
  - `workout-model.js`, `supersetFlow.js`: the in-session workout state machine.
  - `sync-merge.js`: the field-by-field merge behind the 409 retry (see "Sync" below).
  - `exercises.js` / `exercises-data.js`: the exercise library (5,632 catalogue exercises plus
    user-defined ones). `exercises-data.js`, `instr/`, `exercise-names/` and `exercise-desc/` are
    generated from `catalogue/` by `scripts/catalogue/build.mjs`; never edit them by hand.
  - `api.js`: the only place that talks to the backend (`fetch` wrapper, session flows).
  - Native bridges: `mobile.js` (the `MOBILE` flag, file persistence, notifications),
    `channel.js` (APK or store build), `watch-sync.js`, `widgets.js`, `health-sync.js`,
    `anim-quality.js` / `anim-packs.js` (animation sizes in the store apps).
  - CONTRIBUTING.md is explicit: **anything that decides what you lift next, or reads a logged
    session back, is a pure helper here with a unit test beside it.**
- **Body measurements (`lib/measurements.js`, `views/Measurements.jsx`)**: one check-in per day.
  Built-in circumferences and legacy custom fields store cm and follow the profile's cm/in
  display. Custom definitions may specify `unit: 'cm' | 'in' | '%' | 'kg' | 'lb' | 'none'`; that
  display choice stays fixed when the profile switches kg/lb. Custom values store canonical cm, kg
  (to 0.001 kg so a tenth of a pound round-trips), percent (0 to 100) or a plain number. Each
  custom reading also carries its unit, preserving its meaning in backups without definitions.
  Once values exist, the unit selector permits cm/in or kg/lb conversions within the recorded
  type; a different type needs a new field. The body CSV names a custom column with its unit,
  "Muscle ratio (%)", and the importer reads those columns back (only from our own header).
- **`views/`**: one file per screen, routed by `react-router-dom` from `App.jsx`.
- **`sheets.jsx`**: the bottom sheets (exercise picker, exercise config, workout detail, plan
  import...). It is large; a new sheet can go into `components/` as its own file.
- **`components/`**: shared UI (charts, modals, timers, media).
- **`locales/`**: this fork ships English (the source: keys are the English strings, no pack)
  and Russian (`ru.js`) only (`lib/i18n.js`, `i18n-core.js` LANGS). A new `t()` string goes into
  `ru.js`. A profile saved with another language opens in English. Exercise names and steps come
  from `catalogue/i18n/ru.json` through `scripts/catalogue/build.mjs`.

### API (`api/server.js`)

Plain `node:http`, no framework. Requests are dispatched through a `routes` object keyed by
`'METHOD /path'` (e.g. `routes['GET /api/health']`); add an endpoint by adding a key and its entry
in `openapi.yaml` (`openapi-routes.test.js` compares them). State is JSON under `DATA_DIR`:
`db.json` (users, credentials, push subscriptions, invites) and `state-<uid>.json` per user,
written temp-then-rename (`durable.js`). Custom-exercise photos and videos live in
`DATA_DIR/uploads` (`media.js`). Auth is WebAuthn passkeys (`@simplewebauthn/server`), an optional
password, and a signed session cookie (HMAC with `DATA_DIR/secret`); paired phones get the same
session as a bearer token. Optional pieces are gated by env vars: `ADMIN_UIDS`, `INVITE_ONLY`,
`ALLOW_GUEST`, `PASSWORD_LOGIN`, `AUDIT_*`, `API_TOKENS` (scoped `ogt_` tokens, `tokens.js`,
docs/API_TOKENS.md: never a session, only `/api/token/*`), `INTEGRATIONS` (`api/integrations/`: providers, sealed
connections in `DATA_DIR/integrations/`, the outbound webhook; docs/INTEGRATIONS.md). Web Push (`web-push`, VAPID keys in `data/vapid.json`)
drives rest-timer and reminder notifications.

### Sync

Each profile is one document with a server revision. A device PUTs with the revision it last saw;
if another device wrote in between, the server answers 409 with the current document and the
client merges (`lib/sync-merge.js`) and retries. Every change carries its own stamp, per setting
and per field, so the newest edit of each wins and deletions stay deleted.

### Code that exists twice on purpose

The API image cannot import the frontend, so some rules are hand-copied. Change both sides
together: `lib/sync-merge.js` and `api/sync-stamps.js` (parity test), `lib/glyphs.js` and
`api/shared/glyphs.js` (parity test), `lib/nudge.js` and `api/nudge.js`, `lib/queue.js` and
`api/queue.js` (mirrored test cases only, nothing compares the code), and `LiveActivityTick` in
`ios/App/App/WorkoutActivity.swift`. The other way round, the
frontend imports `api/shared/` directly (streaks, starter plans, the routines library, validatePlan).

### MCP server (`mcp/src`)

Stdio MCP bridge (`@modelcontextprotocol/sdk`) that reads one user's data straight from
`DATA_DIR`. `state.js` loads and derives the data, `tools.js` defines the read tools (zod schemas),
`labels.js` maps keys to readable labels, `index.js` wires it together. The one write tool,
`log_workout` (`write-tools.js`), never writes the file: it builds the workout with
`frontend/src/lib/log-workout.js` and saves it with `PUT /api/data` over a paired-session token
(`api-client.js`, `scripts/pair.mjs`), the way a device syncs. See `mcp/README.md`.

### Passkeys and self-hosting constraints

WebAuthn passkeys are bound to an exact hostname (`RP_ID`) and need HTTPS (localhost excepted).
Read `docs/SELF_HOSTING.md` before touching auth, session or notification code; it documents the
env-var contract (`RP_ID`, `ORIGIN`, `PORT`, `WEB_PORT`, `NGINX_PORT`, `BACKEND`, `SESSION_DAYS`,
`ADMIN_UIDS`, `INVITE_ONLY`, `ALLOW_GUEST`, `AUDIT_*`, `VAPID_SUBJECT`) that real deployments
depend on.

### Docker / deploy

`docker-compose.yml` has two services, `api` and `web`. The web image builds `frontend/`, copies
`catalogue/media` into it as `/exercise-media/`, and nginx proxies `/api` to the api (one origin,
which passkeys require). `web/nginx.conf.template` is rendered from env vars at start
(`NGINX_PORT`, `BACKEND`, `PORT`), so remapping works against prebuilt images.

### Exercise media (licence, read before touching media)

The stills and animations are licensed from Gym visual, not AGPL. Only 180 px files may be in the
repository, CI, the web image, the demo or a self-hosted server (`scripts/catalogue/check-media.mjs`
enforces it). Larger sizes exist only inside the APK and store packages, built on the release
machine, or as Apple-hosted / Play asset packs. Never commit, upload or serve anything larger, and
never feed the media to an AI tool.

## Guidelines from CONTRIBUTING.md worth knowing before changing code

- **Dependency-light is a hard constraint.** Frontend: React + Router + Zustand (plus Capacitor
  plugins). `api/`: three dependencies. New dependencies are a hard sell either side.
- Don't commit `data/`. Don't add or replace anything in `catalogue/media/`.
- Training-logic changes (progression, 1RM, session read-back) need a unit test in `src/lib`
  beside the code.
- User-facing text: plain and human, no em dashes. CHANGELOG.md is written at release time.
