import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BatchEnrollment } from './models/learning.js'

test('one active enrollment per student and domain', () => {
  const indexes = BatchEnrollment.schema.indexes()

  const activeIndexes = indexes.filter(([, options]) =>
    options.unique === true &&
    options.partialFilterExpression?.status === 'Enrolled'
  )

  assert.ok(
    activeIndexes.some(([fields]) =>
      fields.student === 1 &&
      fields.domain === 1
    ),
    'Active enrollment must be unique per student and domain'
  )

  assert.ok(
    !activeIndexes.some(([fields]) =>
      fields.student === 1 &&
      fields.status === 1 &&
      fields.domain === undefined
    ),
    'Global one-active-enrollment restriction must be removed'
  )
})


import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { enrollmentMigrationPlan } from './services/enrollment-migration-plan.js'

test('legacy index and domain backfill transition is idempotent and preserves uniqueness', async () => {
  const mongo = await MongoMemoryServer.create()
  const connection = await mongoose.createConnection(mongo.getUri()).asPromise()
  try {
    const collection = connection.collection('isolated_enrollments')
    await collection.createIndex({ student: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'Enrolled' } })
    const student = 'student', batches = [{ _id: 'front', domain: 'Frontend Developer' }, { _id: 'py', domain: 'Python Developer' }]
    await collection.insertOne({ student, batch: 'front', status: 'Enrolled', paymentStatus: 'Paid' })
    await assert.rejects(collection.insertOne({ student, batch: 'py', domain: 'Python Developer', status: 'Enrolled' }), { code: 11000 })
    const plan = enrollmentMigrationPlan(await collection.find().toArray(), batches, await collection.indexes())
    assert.equal(plan.blockers.length, 0)
    assert.equal(plan.backfill.length, 1)
    for (const item of plan.backfill) await collection.updateOne({ _id: new mongoose.Types.ObjectId(item.id), domain: { $exists: false } }, { $set: { domain: item.domain } })
    await collection.createIndex({ student: 1, domain: 1 }, { unique: true, partialFilterExpression: { status: 'Enrolled' } })
    for (const name of plan.dropIndexes) await collection.dropIndex(name)
    await collection.insertOne({ student, batch: 'py', domain: 'Python Developer', status: 'Enrolled' })
    await assert.rejects(collection.insertOne({ student, batch: 'py', domain: 'Python Developer', status: 'Enrolled' }), { code: 11000 })
    assert.equal((await collection.findOne({ batch: 'front' })).paymentStatus, 'Paid')
    assert.deepEqual(enrollmentMigrationPlan(await collection.find().toArray(), batches, await collection.indexes()), { backfill: [], blockers: [], createIndex: false, dropIndexes: [] })
    const conflicts = enrollmentMigrationPlan([
      { _id: 'a', student, batch: 'front', status: 'Enrolled' },
      { _id: 'b', student, batch: 'front', status: 'Enrolled' },
      { _id: 'c', student, batch: 'absent', status: 'Enrolled' },
      { _id: 'd', student, batch: 'py', domain: 'Frontend Developer' }
    ], batches, [])
    assert.equal(conflicts.blockers.length, 3)
  } finally { await connection.close(); await mongo.stop() }
})
