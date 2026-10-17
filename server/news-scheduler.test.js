import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { acquireSchedulerLock, createNewsScheduler, NEWS_INTERVAL_MS } from './services/news-scheduler.js'

test('hourly timer, overlap prevention, counts, failures and shutdown', async () => {
  let callback, interval, resolve, calls = 0, cancelled = false
  const logs = []
  const scheduler = createNewsScheduler({
    refresh: () => { calls++; return new Promise(done => { resolve = done }) },
    log: entry => logs.push(entry), now: () => new Date('2026-01-01T00:00:00Z'),
    schedule: (fn, ms) => { callback = fn; interval = ms; return 1 }, cancel: () => { cancelled = true },
  })
  scheduler.start()
  assert.equal(interval, 3600000)
  assert.equal(interval, NEWS_INTERVAL_MS)
  callback()
  assert.equal(await scheduler.tick(), false)
  assert.equal(calls, 1)
  resolve({ results: [{ imported: 3, duplicates: 2, skipped: 1 }] })
  await new Promise(done => setImmediate(done))
  assert.equal(logs[0].status, 'success')
  assert.equal(logs[0].imported, 3)
  assert.equal(logs[0].duplicates, 2)
  callback()
  resolve({ results: [{ failed: true }] })
  await new Promise(done => setImmediate(done))
  assert.equal(logs[1].status, 'failed')
  assert.equal(logs[1].lastSuccessfulSync, logs[0].lastSuccessfulSync)
  await scheduler.stop()
  assert.ok(cancelled)
  assert.equal(await scheduler.tick(), false)
})

test('exceptions are redacted and later ticks recover; disabled is not success', async () => {
  let fail = true
  const logs = []
  const scheduler = createNewsScheduler({ refresh: async () => { if (fail) throw new Error('SECRET'); return { disabled: true } }, log: row => logs.push(row) })
  await scheduler.tick(); fail = false; await scheduler.tick(); await scheduler.stop()
  assert.equal(logs[0].status, 'failed')
  assert.ok(!JSON.stringify(logs).includes('SECRET'))
  assert.equal(logs[1].status, 'disabled')
  assert.equal(logs[1].lastSuccessfulSync, null)
})

test('OS lock refuses another scheduler and releases cleanly', async () => {
  const first = await acquireSchedulerLock(0)
  try { await assert.rejects(acquireSchedulerLock(first.port), { code: 'EADDRINUSE' }) }
  finally { await first.release() }
  const next = await acquireSchedulerLock(first.port)
  await next.release()
})

test('unsafe CLI settings are rejected before database imports', () => {
  const result = spawnSync(process.execPath, ['server/schedule-news.js', '--run-local'], {
    env: { ...process.env, MONGODB_URI: 'mongodb://remote.invalid:27017/test', NODE_ENV: 'test', RUN_STARTUP_INITIALIZATION: 'false' }, encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /BLOCKED/)
  assert.ok(!result.stderr.includes('remote.invalid'))
})
