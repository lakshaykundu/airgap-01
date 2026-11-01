# Testing

## Automated suites

| Suite           | Runner                        | Where                                                | What it proves                                                                                                                                                                                                                                                                                   |
| --------------- | ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared          | Vitest                        | `packages/shared/src/*.test.ts`                      | Every map node lies inside its sector polygon; links are valid; schemas; determinism                                                                                                                                                                                                             |
| API             | Vitest + `fastify.inject`     | `apps/server/tests/api.test.ts`                      | CRUD, versions, 400/401/404/409/410/413/422/429 envelopes, idempotent replay, 5 simultaneous retries applied once, racing updates (one 409), poll mode, session isolation, scoped reset, event cursor, security headers                                                                          |
| Unit            | Vitest                        | `apps/web/src/**/*.test.ts`                          | Retry delays and caps, error classification, transport simulator (disconnect, latency, seeded failures, dropped response), connection-state derivation, queue ordering and rebasing, delete-after-create, retry parking, filters/search/sort, URL round trip, map aggregation, load-test indexes |
| Monitor (MSW)   | Vitest + MSW                  | `ConnectivityMonitor.test.ts`                        | Reachability comes from the backend, not `navigator.onLine`                                                                                                                                                                                                                                      |
| Component       | Vitest + RTL + fake-indexeddb | `IncidentEditor.test.tsx`, `ConflictDialog.test.tsx` | Accessible validation errors, local write + queued mutation, field-level conflict diff, keep-mine and accept-server actions                                                                                                                                                                      |
| **Integration** | Vitest (node) + real Fastify  | `SyncEngine.integration.test.ts`                     | The real sync engine and Dexie over real HTTP against the real server (in-memory PGlite Postgres)                                                                                                                                                                                                |
| **E2E**         | Playwright (Chromium)         | `tests/e2e/*.spec.ts`                                | The production build with its service worker, served by the production server                                                                                                                                                                                                                    |

The integration suite covers: online create, offline create plus three edits
replayed in order, offline delete (tombstone, no resurrection), offline
create+delete cancelling locally, 50% random failures with no duplicates, a
lost response replayed via idempotency, conflict → keep mine / accept server /
merge, recovery of interrupted `syncing` mutations, two engines (tabs) with the
lock held by one, permanent failure parked without blocking other incidents,
remote pull, and offline skip logged once.

### E2E scenarios (`tests/e2e`)

| #   | Test                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Real browser offline** (`context.setOffline`): create → reload (SW shell) → edit → reload → reconnect → server has the final state, version 2                   |
| 2   | Simulated API disconnect → create → reconnect → server record exists, queue empty                                                                                 |
| 3   | Drop next mutation response → exactly one server record and one `incident.created` event; `RESPONSE_LOST` + `IDEMPOTENT_REPLAY` logged                            |
| 4   | Offline edit, server-side change through the demo endpoint, reconnect → conflict shown → keep mine → final server state correct                                   |
| 5   | Generate 1,000 records → search and filter results equal an independent count from IndexedDB → scroll to the end with fewer than 60 rows mounted (virtualization) |
| 6   | Two tabs: shared simulated state and queue; one effective server mutation; tabs converge                                                                          |
| 7   | Three offline creates, 2G latency, **reload mid-sync** → every incident on the server exactly once                                                                |
| 8   | The full guided 60-second challenge, including its real reload                                                                                                    |
| —   | No horizontal overflow at 1440×900, 1280×800, 768×1024 and 390×844 on five routes                                                                                 |
| —   | No console or page errors on any route                                                                                                                            |

## Running

```bash
pnpm test
```

```bash
pnpm test:e2e
```

`pnpm test` runs the unit, component and integration tests. `pnpm test:e2e`
builds, then starts the production server on :4173 with a throwaway PGlite
database. If Chromium is missing, install it first:

```bash
pnpm exec playwright install chromium
```

## Latest results

Environment: macOS 26 (Apple Silicon), Node 26.7.0, pnpm 10.34.9, Playwright
1.64.0 (Chromium build 1248), run on 2026-11-01.

| Check                                     | Result                                          |
| ----------------------------------------- | ----------------------------------------------- |
| `pnpm typecheck` (3 packages + E2E)       | ✅ pass                                         |
| `pnpm lint` (ESLint, 0 warnings)          | ✅ pass                                         |
| `pnpm format:check`                       | ✅ pass                                         |
| `packages/shared`                         | ✅ 6 / 6                                        |
| `apps/server`                             | ✅ 17 / 17                                      |
| `apps/web` (unit, component, integration) | ✅ 52 / 52 (11 files)                           |
| Playwright E2E                            | ✅ 10 / 10 (scenarios 1–8, responsive, console) |
| `pnpm build`                              | ✅ web + server; SW precaches 39 entries        |
| Failing tests                             | none                                            |

### Lighthouse (local production build, `http://localhost:4173/`)

Lighthouse 12.8.2 with Chrome for Testing (Playwright build 1248), headless,
on the same machine. The service worker was cold (first visit).

| Preset                     | Performance | Accessibility | Best practices | SEO | FCP   | LCP   | TBT    | CLS   | Speed Index |
| -------------------------- | ----------- | ------------- | -------------- | --- | ----- | ----- | ------ | ----- | ----------- |
| Desktop                    | 90          | 100           | 96             | 100 | 1.2 s | 1.7 s | 30 ms  | 0.003 | 1.3 s       |
| Mobile (simulated slow 4G) | 54          | 100           | 96             | 100 | 6.3 s | 9.2 s | 270 ms | 0.01  | 6.3 s       |

Measuring led to two real fixes: a static pre-boot splash in `index.html`
(Speed Index went from 2.7 s to 1.3 s), and `initial={false}` on the sidebar's
width animation (CLS went from 0.148 to 0.003). The mobile cold-load score is
limited by about 570 KB of JavaScript that first paint does not need, plus
render-blocking CSS. Repeat visits are served from the service-worker
precache. The next steps would be route-level splitting of the overview
widgets and inlined critical CSS. Best practices loses points for one Chrome
"Content security policy" inspector issue.

## Manual offline testing

1. Run `pnpm build`, then `pnpm start`, and open <http://localhost:3000>. Wait until the toast says _Offline ready_, or until DevTools → Application → Service Workers shows the worker as activated.
2. In DevTools → Network, choose **Offline**. The badge shows _Offline · browser_.
3. Create an incident and edit another. Both rows show _Pending_ and the queue counter shows 02.
4. Reload. The shell loads from the service worker, and the rows and queue are still there.
5. Switch the network back to **No throttling**. The badge goes from _Checking_ to _Synchronizing_ to _System online_, and the queue drops to 00.
6. To confirm on the server, read the session id from IndexedDB (`syncMetadata`), then run:

```bash
curl -H "x-airgap-session: <id>" http://localhost:3000/api/incidents
```

Also try two tabs side by side, closing a tab mid-sync with 2G latency set,
and reloading while _Disconnect network_ is active. The simulated disconnect
persists across reloads.

## Chaos Lab scenarios

| Control                    | Expected                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Disconnect / Restore       | The transport rejects every API call; local work continues; restoring triggers a health check and a sync        |
| Simulated 3G / 2G / custom | Every request is delayed; the request log shows measured duration plus the injected delay; DEGRADED above 1.2 s |
| Failure rate 0–50%         | Seeded, reproducible failures; `MUTATION_RETRY_SCHEDULED` with backoff; nothing is duplicated                   |
| Drop next response         | `RESPONSE_LOST` → retry → `IDEMPOTENT_REPLAY`; the request log marks a _replay_                                 |
| Trigger version conflict   | Edit offline → out-of-band remote edit → restore → 409 → resolver opens                                         |
| Reset demo                 | Asks for confirmation (warns about unsynced changes); reseeds only this visitor's session                       |
| Load test / 1000           | Measured IndexedDB query and filter times; the number of mounted rows stays small                               |

## Known limitations

- E2E covers Chromium only. Firefox and Safari have not been tested in CI. Safari lacks some service-worker and Web Locks behaviour in older versions; a storage-lease fallback exists for the lock, but it has no automated test in a real browser.
- The built-in browser pane used during development refused to register service workers (`An unknown error occurred when fetching the script`), even though the server returned `/sw.js` with a 200. Playwright's Chromium registers and uses the worker normally, as test 1 shows.
- Test 7 cannot guarantee that the reload lands exactly while a request is in flight. It asserts the outcome (no loss, no duplicates), which holds in every timing.
- Docker was not available on the development machine, so the image has not been built locally. CI builds it.
- The `pg` driver path (Neon) is not covered by the automated suites, which use PGlite. Before the first deploy, the bundled Vercel function was exercised through `pg` against a Postgres wire-protocol server (PGlite socket): health, session seeding, idempotent replay, 409 conflict, event feed, and the disabled stream.

### Reproducing a failure

Run the failing spec alone with traces:

```bash
pnpm exec playwright test tests/e2e/reliability.spec.ts -g "4 —" --trace on
```

Then open the trace:

```bash
pnpm exec playwright show-trace test-results/<test-dir>/trace.zip
```

Unit and integration tests run in isolation (fresh fake-indexeddb database, in-memory PGlite Postgres) and need no services.
