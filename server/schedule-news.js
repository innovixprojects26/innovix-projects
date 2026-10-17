import { devNull } from 'node:os'
import { acquireSchedulerLock, createNewsScheduler } from './services/news-scheduler.js'

// Explicit opt-in and a supplied local URI are required; never fall back to .env.
if (!process.argv.includes('--run-local') ||
    !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/[a-zA-Z0-9_-]+$/.test(process.env.MONGODB_URI || '') ||
    process.env.RUN_STARTUP_INITIALIZATION !== 'false' || process.env.NODE_ENV !== 'test') {
  console.error('BLOCKED: use --run-local with an explicit loopback test MongoDB URI, NODE_ENV=test and RUN_STARTUP_INITIALIZATION=false.')
  process.exitCode = 1
} else {
  process.env.DOTENV_CONFIG_PATH = devNull
  process.env.DOTENV_CONFIG_OVERRIDE = 'false'
  let lock, scheduler, closeDatabase
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await scheduler?.stop()
    await closeDatabase?.()
    await lock?.release()
  }
  try {
    lock = await acquireSchedulerLock()
    const database = await import('./config/db.js')
    closeDatabase = database.closeDatabase
    const { refreshDiscoverSources } = await import('./services/discover-ingest.js')
    await database.connectDatabase()
    scheduler = createNewsScheduler({ refresh: () => refreshDiscoverSources({ initializeCategories: false }) })
    process.on('SIGINT', () => void stop())
    process.on('SIGTERM', () => void stop())
    scheduler.start()
  } catch {
    console.error('News scheduler startup failed: check local configuration or an existing scheduler instance.')
    process.exitCode = 1
    await stop()
  }
}
