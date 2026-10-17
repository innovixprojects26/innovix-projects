# Local Technology News scheduler

Opt-in worker: `node server/schedule-news.js --run-local`.
Requires process-local `MONGODB_URI` pointing to a disposable localhost database,
`NODE_ENV=test`, and `RUN_STARTUP_INITIALIZATION=false`. It bypasses `.env`.
Do not run it against production or unapproved feeds. This worker was not activated.

Runs immediately and every 60 minutes independently of visitors. Ctrl+C waits for
the current refresh, disconnects MongoDB and releases its loopback-port 15061 lock.
Only one worker may run per host; crashes release the OS lock. Existing source
leases and canonical URL hashes/unique indexes remain the importer safeguards.
Existing import enablement, source activation and publication settings are honored.
Category/startup initialization is skipped. No sources or permissions are changed.
Each tick processes the existing bounded batch of up to 10 due sources; larger
source catalogs rotate across later ticks rather than all refreshing each hour.

JSON stdout logs record timestamps, last successful sync in this process, imported
and duplicate counts, and redacted errors. Existing per-source database status is
unchanged. Preserve stdout in the service manager for history across restarts.

Production activation remains pending: provision a supervised worker with restart
and durable logs, review/extend the local-only entry guard for its approved runtime,
confirm publisher permissions and active sources, and ensure exactly one worker
host. Multi-host operation needs a distributed job lock before activation. Existing
manual refresh commands are not governed by the local socket lock; source leases
and unique article keys still apply. Never infer production activation from tests.
