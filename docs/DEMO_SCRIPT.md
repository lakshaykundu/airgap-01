# 90-second demo script

Audience: an engineering manager. Everything shown is the real app — no mocked
interactions. Before starting: open the deployed URL (or `pnpm dev`) once while
online, then press `` Ctrl/⌘ + ` `` to open the developer console at the bottom.

| Time | Do                                                                                       | Say                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Land on **Overview**. Point at the status badge, LAST SYNC and QUEUE 00.                 | "This is an operations console built to keep working when the network doesn't. The badge is verified by a backend health probe, not `navigator.onLine`."                                              |
| 0:10 | Click **DISCONNECT NETWORK** in the top bar.                                             | "This is a simulated API outage: the transport layer now rejects every backend request — not just the badge."                                                                                         |
| 0:18 | **Create incident** → title "Sector 07 relay down", Critical → Create.                   | "It's written to IndexedDB with a queued mutation in one transaction. Queue 01, purple marker on the map, row says Pending."                                                                          |
| 0:30 | Press **⌘R / F5** to reload.                                                             | "Reload with the API down: the service worker serves the shell, IndexedDB the data. The incident and the queue are still here."                                                                       |
| 0:40 | Open the incident → change status to Investigating.                                      | "Edits offline are recorded against the last server version I saw. Queue 02."                                                                                                                         |
| 0:48 | Go to **Synchronization Center**, then click **RESTORE CONNECTION**.                     | "Health check, cross-tab lock, then mutations drain in order with idempotency keys. Watch them move from local storage to the server."                                                                |
| 1:00 | Open **Chaos Lab** → **Drop next mutation response**, then create another incident.      | "The server applies it but the response is lost. The retry uses the same key — the server replays the stored result. One record, not two." Point at RESPONSE_LOST → IDEMPOTENT_REPLAY in the console. |
| 1:12 | Chaos Lab → **Trigger version conflict**: Edit offline → Simulate remote edit → Restore. | "A colleague changed it while I was offline. My stale write gets a 409; nothing is silently overwritten."                                                                                             |
| 1:22 | In the dialog: **Review & merge** → pick my title, their status → Apply merge.           | "Field-level comparison; I choose the final state and it's sent as a new mutation on top of their version."                                                                                           |
| 1:30 | Close on the **Architecture** page.                                                      | "Everything you saw is covered by unit, integration and Playwright tests — including a real browser-offline reload."                                                                                  |

Shortcut for a recruiter: the **START THE 60-SECOND CHALLENGE** button walks
through disconnect → offline create → reload → reconnect, verifying each step
for real (it fails visibly if a check fails).

Optional extras if there is time:

- Chaos Lab → **Simulated 2G** before restoring, so each mutation is visible on the wire.
- Chaos Lab → **LOAD TEST / 1000** → generate, search "relay", filter Critical, scroll; point at measured IndexedDB query time and "rows mounted".
- Open a second tab: the simulated disconnect and the queue are shared; only one tab sends.
- DevTools → Network → **Offline** for a real outage: the badge says "Offline · browser" instead of "simulated".
