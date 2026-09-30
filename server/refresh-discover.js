import { connectDatabase, closeDatabase } from './config/db.js'
import { refreshDiscoverSources } from './services/discover-ingest.js'

try {
  if (!await connectDatabase()) throw new Error('MONGODB_URI is required.')
  const result = await refreshDiscoverSources()
  console.log(JSON.stringify(result))
  if (result.results?.some(item => item.failed)) process.exitCode = 1
} catch { console.error('Learn & Discover refresh failed. Check server configuration and source health.'); process.exitCode = 1 }
finally { await closeDatabase() }
