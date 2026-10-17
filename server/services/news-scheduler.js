import { createServer } from 'node:net'

export const NEWS_INTERVAL_MS = 60 * 60 * 1000

// A loopback socket provides an OS-owned, crash-released single-host lock.
export function acquireSchedulerLock(port = 15061) {
  return new Promise((resolve, reject) => {
    const server = createServer(socket => socket.destroy())
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve({
      port: server.address().port,
      release: () => new Promise(done => server.close(done)),
    }))
  })
}

export function createNewsScheduler({ refresh, log = value => console.log(JSON.stringify(value)),
  now = () => new Date(), schedule = setInterval, cancel = clearInterval }) {
  let running, timer, stopped = false, lastSuccessfulSync = null
  async function tick() {
    if (stopped || running) return false
    running = (async () => {
      try {
        const result = await refresh()
        const rows = result.results || []
        const failed = rows.filter(row => row.failed).length
        const completed = rows.filter(row => !row.failed && row.skipped !== true).length
        const status = result.disabled ? 'disabled' : failed ? 'failed' : completed ? 'success' : 'idle'
        if (status === 'success') lastSuccessfulSync = now().toISOString()
        log({ event: 'technology-news-sync', time: now().toISOString(), status, lastSuccessfulSync,
          sourcesCompleted: completed, sourcesFailed: failed,
          imported: rows.reduce((n, row) => n + (row.imported || 0), 0),
          duplicates: rows.reduce((n, row) => n + (row.duplicates || 0), 0),
          ...(failed ? { error: 'One or more sources failed; inspect existing source status.' } : {}) })
      } catch {
        log({ event: 'technology-news-sync', time: now().toISOString(), status: 'failed',
          lastSuccessfulSync, error: 'Refresh failed; inspect source configuration and database availability.' })
      }
    })()
    try { await running } finally { running = undefined }
    return true
  }
  return {
    tick,
    start() { if (!timer && !stopped) { timer = schedule(() => void tick(), NEWS_INTERVAL_MS); void tick() } },
    async stop() { stopped = true; if (timer) cancel(timer); await running },
  }
}
