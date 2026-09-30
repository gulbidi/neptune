# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this is
**Neptune** lets you message the coding agents on your PC (Claude Code, Codex, …) from your phone. One Tauri 2 + React + TypeScript codebase builds two apps: an **Android chat client** and a **Windows desktop bridge** that runs the agent CLIs. They talk only through **Supabase** (Postgres with RLS, Realtime, Auth, Edge Functions).

## Read these first
| Doc | Read it when |
| --- | --- |
| [docs/overview.md](docs/overview.md) | Always. It covers the product, concepts (node, operator, agent, chat), how a task flows, features, security model and stack |
| [docs/architecture.md](docs/architecture.md) | Before changing code. It covers where every file lives, the bridge engine, Tauri commands, database schema and RLS, edge functions, protocols, and **where to make common changes** (§9) |
| [docs/development.md](docs/development.md) | Before running or building anything. It covers tools and versions, environment, run modes, Supabase workflow and conventions |
| [docs/testing.md](docs/testing.md) | Before writing or running tests. It covers the check loop, unit tests (Vitest), live tests (Playwright + headless Chrome), lint, and the manual end-to-end run |
| [docs/releasing.md](docs/releasing.md) | Before releasing, touching CI (`.github/workflows/release.yml`), signing or updater settings, or moving the repo |

## Workflow
Work directly on `prod`, the only branch. Every change is tested locally, pushed and then released. **Don't stop between steps** unless one of the checkpoints under Rules applies.

1. **Understand.** Read overview.md and the relevant sections of architecture.md. Find the touch points in its "Where to make common changes" table (§9).
2. **Implement.** Follow the Rules below. Keep both apps working: phone mode and bridge mode share `src/lib` and `src/ui`. Add or update tests alongside the code (testing.md §2–3).
   - Schema changes: write a new migration plus RLS policies, apply it, and update `src/lib/types.ts`. See development.md §5.
3. **Live test.** Run `npm run e2e` (Playwright in headless Chrome, testing.md §3). Fix and repeat until it passes.
4. **Check.** Run `npm run verify`: lint → unit tests → build → `cargo check` (testing.md §1). Everything must pass.
5. **Re-test after edits.** If you changed anything in step 4, go back to step 3. Continue only when `e2e` and `verify` both pass on the same, unchanged code.
   - For backend or protocol changes, also do the manual test-node run (testing.md §5).
6. **Document.** Update the docs if you changed behaviour, structure, setup, testing or the release process.
7. **Commit and push.**
   ```bash
   git add -A
   ```
   ```bash
   git commit -F <message-file>
   ```
   Write the message in the format under [Commit messages](#commit-messages).
   ```bash
   git push origin prod
   ```
8. **Release.** Choose the version (see Versioning), then follow [releasing.md §1](docs/releasing.md#1-release-flow):
   ```bash
   node scripts/bump.mjs X.Y.Z
   ```
   ```bash
   git commit -a -F <message-file>   # subject: [REL vX.Y.Z] chore: bumped version to X.Y.Z
   ```
   ```bash
   git tag vX.Y.Z
   ```
   ```bash
   git push origin prod
   ```
   ```bash
   git push origin vX.Y.Z
   ```
   Then run `gh run watch` until the workflow finishes. After that, check that `latest.json` reports X.Y.Z and that the `.exe`, `.sig` and `.apk` are attached ([releasing.md §5](docs/releasing.md#5-release-checklist)). If a job fails, fix the problem, run the loop again and rerun the workflow (releasing.md §1).
   - **Skip the release** if the change touches only docs, tests or dev tooling. The shipped apps would be identical, so just push.
9. **Report.** Send a short summary: the version released (or why not), what changed, which checks passed, and the release link. Name anything you skipped or couldn't verify.

### Versioning
The version is `MAJOR.MINOR.PATCH`. Bump it from the latest `v*` tag (`git describe --tags --abbrev=0`) and reset the lower numbers.

| Change | Bump | Example |
| --- | --- | --- |
| Bug fix or improvement to something that exists | **Patch** | 0.1.0 → 0.1.1 |
| New feature | **Minor** | 0.1.1 → 0.2.0 |
| Huge upgrade: redesign, new platform, breaking protocol or schema change | **Major** | 0.2.0 → 1.0.0 |

If a batch mixes kinds of change, the largest one decides the bump.

### Commit messages
Every commit message follows this format:

```
<type>: <what-you-did>

Co-Authored-By: Nandanunni <asnqln@gmail.com>
Co-Authored-By: <agent> <model> <noreply@agent-domain>
```

The second line names the AI agent that did the work, one of:

- `Co-Authored-By: Claude <model> <noreply@anthropic.com>`
- `Co-Authored-By: Codex <model> <noreply@openai.com>`

`<type>` is one of:

| Type | Use for |
| --- | --- |
| `feat` | A new feature. |
| `fix` | A bug fix. |
| `chore` | Maintenance, tooling, dependencies and config. |
| `docs` | Documentation only. |

- Leave one blank line between the subject and the `Co-Authored-By` lines, with nothing after them. GitHub only reads co-authors from the last paragraph of the message; without the blank line they become part of the title and no co-authors are shown.
- The first `Co-Authored-By` line is always `Nandanunni <asnqln@gmail.com>`.
- When an AI agent (Claude or Codex) worked on the commit, add a second `Co-Authored-By` line for it. `<model>` is the model that actually did the work (e.g. `Opus 5.5`), so it changes with the model. Don't copy it from an old commit.
- No other co-authors are added.
- A release commit starts with `[REL vX.Y.Z]` before the type, e.g. `[REL v0.3.0] chore: bumped version to 0.3.0`. Other commits have no prefix.

Example:

```
feat: implemented email-otp authentication flow

Co-Authored-By: Nandanunni <asnqln@gmail.com>
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Commands
| Command | What it does |
| --- | --- |
| `npm ci` | Install dependencies |
| `npm run dev` | Browser preview on :1420. Add `?mode=bridge`, `?mode=bridge&pair` or `?mode=phone` |
| `npm run e2e` | Live tests in headless Chrome (add `-- --headed` to watch) |
| `npm run verify` | Lint, unit tests, build and `cargo check`. Must pass before pushing |
| `npm run lint` / `npm run test` / `npm run build` | The individual checks |
| `npx tauri dev` | Desktop bridge. **Read development.md §4B first**, because by default it acts as the real PC |
| `node scripts/bump.mjs X.Y.Z` | Sets the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` |

## Rules
- **Checkpoints that need Nandan's go-ahead first:**
  - Applying migrations or deploying edge functions.
  - Changing signing keys, repository secrets or updater settings.
  - Changing repo visibility, or moving the repo (releasing.md §4).
  - A **major** version bump.

  Everything else runs end to end without asking.
- **The Supabase project is production.** Migrations and edge-function deploys reach the installed apps immediately.
  - Add a *new* migration file; never edit one that's been applied.
  - Keep changes backward compatible, or ship the matching app release at the same time.
  - Update `src/lib/types.ts` to match.
  - Test with throwaway nodes and emails, then delete them.
- **Live tests never reach Supabase.** Mock new backend calls in `e2e/fixtures.ts` (testing.md §3).
- **Deploy edge functions with `--no-verify-jwt`.** The pairing PC has no session.
- **Never put the service-role key in client code or commit `~/.neptune/bridge.json`,** which holds a live session. Clients use only the publishable key in `src/lib/config.ts`.
- **All permissions are enforced by RLS,** built from `operates()`, `runs()` and `sees()`. Any new table needs RLS enabled plus policies, and it needs adding to the `supabase_realtime` publication if clients subscribe.
- **Keep the Rust side thin.** It runs processes and reads the OS; product logic belongs in TypeScript, where it can be unit tested.
- **`BridgeConfig` is defined twice,** in `src-tauri/src/bridge.rs` and `src/bridge/native.ts`. Change both together.
- **A new Tauri command** needs registering in `src-tauri/src/lib.rs` (`generate_handler!`), a typed wrapper in `src/bridge/native.ts`, and plugin permissions in `src-tauri/capabilities/*.json`.
- **Adding an agent CLI:** add an adapter to `ADAPTERS` in `src/bridge/agents.ts` and detection in `bridge.rs`. See architecture.md §9.
- **Change versions only with `scripts/bump.mjs`.** Push release tags by name (`git push origin vX.Y.Z`); `--follow-tags` skips lightweight tags.
- **Don't make the repo that hosts releases private.** The auto-updaters use public GitHub URLs (releasing.md §2).
- **Never skip or weaken a failing check** to get a push through. That includes deleting or loosening tests, adding `eslint-disable` to silence a real problem, or using `--no-verify`. Fix the cause, or stop and report it.
- **Match the existing style** (development.md §7):
  - Strict TypeScript, and no unused code.
  - Functional React; plain CSS using the tokens in `src/styles.css`.
  - Brief comments that explain *why*.
  - Short, plain user-facing copy that says what to do.
  - Green (`#22C55E`) for machine/agent output, blue (`#2563EB`) for structure and anything the user sends.
- **Windows is the primary dev OS.** Use the MSVC Rust toolchain.
