# Neptune: testing

How changes are checked before they're pushed to `prod`. For tools and run modes, see [development.md](development.md). For shipping, see [releasing.md](releasing.md).

---

## 1. The loop

Every change goes through these steps, in this order:

1. **Live test:** `npm run e2e` (§3). The app runs in headless Chrome.
2. **Lint:** `npm run lint` (§4).
3. **Unit tests:** `npm run test` (§2).
4. **Build:** `npm run build`, then `cargo check`.

`npm run verify` runs steps 2–4 in one go and stops at the first failure.

**If you edit anything while fixing steps 2–4, go back to step 1.** Push only once a live test and a `verify` pass both run on the same, unchanged code.

| Command | Runs |
| --- | --- |
| `npm run e2e` | Playwright live tests in headless Chrome |
| `npm run lint` | ESLint on all TypeScript (zero warnings allowed), then `cargo fmt --check` |
| `npm run test` | Vitest unit tests, once |
| `npm run test:watch` | Vitest in watch mode while you work |
| `npm run build` | Type check plus the Vite build into `dist/` |
| `npm run verify` | lint → test → build → `cargo check` |

## 2. Unit tests (Vitest)

Push tests also use PGlite (embedded Postgres) to apply the actual push migration
with network, Vault and cron stand-ins. These verify authorization and queue
behavior without touching Supabase. Check the Edge Function separately with
`npx deno check supabase/functions/send-push/index.ts`. The `Android check` workflow
compiles native code without publishing. On-device push checks are listed in
[push-notifications.md](push-notifications.md).

- **What they cover:** pure logic with no DOM, network or Tauri. Examples are QR parsing (`src/lib/config.ts`), version comparison (`src/lib/updates.ts`), presence and labels (`src/lib/useConversation.ts`), time formatting (`src/ui/time.ts`), agent usage and tool descriptions (`src/bridge/agents.ts`), and telemetry formatting (`src/bridge/telemetry.ts`).
- **Where they live:** next to the code, as `src/**/<file>.test.ts`. Config is in `vitest.config.ts`, running in the `node` environment.
- **Run them:** `npm run test`, or `npm run test:watch` while working. Run a single file with `npx vitest run src/lib/config.test.ts`.
- **Adding tests:**
  - New or changed pure logic ships with a test.
  - If a function is hard to test because it's mixed into a component or hook, move the logic into a plain exported function and test that.
  - Keep tests deterministic. Pass `now` in explicitly (as `ago()` allows) rather than depending on the clock.
  - Never call Supabase or a real CLI from a unit test.

## 3. Live tests (Playwright + headless Chrome)

- **What they cover:** the real app, served by `npm run dev`, driven in the Chrome installed on the machine (`channel: 'chrome'`, headless). Playwright starts the dev server on :1420 and stops it afterwards. It reuses a dev server that's already running, except in CI.
- **Projects:** each spec runs at the size of the device it targets.

  | Project | Size | Specs | Covers |
  | --- | --- | --- | --- |
  | `desktop` | Desktop Chrome | `e2e/bridge.spec.ts` | `?mode=bridge` console, `?mode=bridge&pair` pairing screen |
  | `phone` | Pixel 7 | `e2e/phone.spec.ts` | `?mode=phone` sign-in flow |

- **Production is never touched.** `e2e/fixtures.ts` intercepts every request to Supabase:
  - The `pair` and `request-code` edge functions return canned replies (`PAIR` holds the fake pairing code).
  - Auth calls get an empty `204` and table reads get `[]`.
  - Realtime sockets are closed.
  - The `supabaseCalls` fixture records every path, so a test can check which backend calls happened.

  Always import `test` and `expect` from `./fixtures`, never directly from `@playwright/test`.
- **Run them:**
  ```bash
  npm run e2e
  ```
  Watch the browser:
  ```bash
  npm run e2e -- --headed
  ```
  Run one spec:
  ```bash
  npm run e2e -- e2e/phone.spec.ts
  ```
  Step through a test:
  ```bash
  npm run e2e -- --debug
  ```
- **Failures:** a failed test leaves a page snapshot (`error-context.md`) and a trace in `test-results/`. Open the trace with `npx playwright show-trace <path>/trace.zip`. `test-results/` and `playwright-report/` are git-ignored.
- **Adding tests:**
  - Every new screen or user-facing flow gets a spec.
  - A bridge feature goes in `bridge.spec.ts`, which uses the `desktop` project. A phone feature goes in `phone.spec.ts`, which uses the `phone` project. A new spec file also needs its own `testMatch` entry in `playwright.config.ts`.
  - Find elements the way a user would: `getByRole`, `getByText`, `getByPlaceholder`.
  - If a flow needs a new backend response, add it to the router in `fixtures.ts` rather than letting the request through.
  - Check `pageerror` for screens that shouldn't throw.
- **Limits:** the browser has no real Tauri side, camera or agent CLI. The push
  navigation test seeds fake sessions and mocks native commands to cover signed-in
  screens; it cannot prove Android background delivery. Verify that on a phone
  with FCM configured, as described in [push-notifications.md](push-notifications.md).

## 4. Lint

- **ESLint** (`eslint.config.js`): the recommended JS and TypeScript rules, plus the classic React hook rules `rules-of-hooks` and `exhaustive-deps`. Warnings fail the run too (`--max-warnings 0`).
  - The React Compiler rules from `eslint-plugin-react-hooks` are left off, because the app doesn't use the compiler.
  - Disable a rule only on the exact line, with an `eslint-disable-next-line` comment. `src/lib/fn.ts` has an example.
- **Rust:** `cargo fmt --check` with the default rustfmt style. Fix it with `cargo fmt --manifest-path src-tauri/Cargo.toml`.
- **TypeScript:** the strict compiler settings (`noUnusedLocals`, `noUnusedParameters`) run as part of `npm run build`.

## 5. Manual end-to-end run (backend and protocol changes)

The automated tests fake the backend. For changes to migrations, edge functions, RLS, the task protocol or the bridge engine, also run the real flow with a **test node**, as described in [development.md §4B](development.md#b-desktop-bridge-tauri):

1. Pair a separate dev bridge.
2. Sign in on the phone.
3. Send a task and get a reply.
4. Test `/stop`.
5. Remove the node and its throwaway auth users.

The Supabase project is production, so this needs Nandan's go-ahead first (see [AGENTS.md](../AGENTS.md)).
