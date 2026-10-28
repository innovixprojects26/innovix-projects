import { normalizeInternshipDomain } from '../../shared/internship-domain.js'

// Pure dry-run planner. It never connects to MongoDB or executes writes/index DDL.
export function enrollmentMigrationPlan(records, batches, indexes) {
  const byId = new Map(batches.map(batch => [String(batch._id), batch]))
  const backfill = [], blockers = [], active = new Map()
  for (const record of records) {
    const domain = normalizeInternshipDomain(byId.get(String(record.batch))?.domain)
    if (!domain || (record.domain && normalizeInternshipDomain(record.domain) !== domain)) {
      blockers.push({ id: String(record._id), reason: 'Missing batch, unknown domain, or enrollment/batch mismatch' })
      continue
    }
    if (record.domain !== domain) backfill.push({ id: String(record._id), previousDomain: record.domain, domain })
    if (record.status === 'Enrolled') {
      const key = `${record.student}:${domain}`
      if (active.has(key)) blockers.push({ id: String(record._id), otherId: active.get(key), reason: 'Duplicate active student/domain' })
      active.set(key, String(record._id))
    }
  }
  const desired = indexes.find(index => index.unique && index.key.student === 1 && index.key.domain === 1 &&
    Object.keys(index.key).length === 2 && index.partialFilterExpression?.status === 'Enrolled')
  const obsolete = indexes.filter(index => index.unique && index.key.student === 1 &&
    index.key.domain === undefined && index.partialFilterExpression?.status === 'Enrolled' &&
    Object.keys(index.key).every(key => ['student', 'status'].includes(key)))
  return { backfill, blockers, createIndex: !desired, dropIndexes: obsolete.map(index => index.name) }
}
