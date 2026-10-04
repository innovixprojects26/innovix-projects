import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { env } from './config/env.js'
import { InternshipApplication } from './models/index.js'
import { Student } from './models/student.js'
import { InternshipBatch, BatchEnrollment } from './models/learning.js'
import { internshipIndicators } from './services/internship-indicators.js'

test('counts actual distinct students per domain without double counting applications and enrollments', async () => {
  const dbName = `ind_${randomUUID().replaceAll('-', '')}`
  try {
    await mongoose.connect(env.mongoUri, { dbName, serverSelectionTimeoutMS: 15000 })
    await InternshipApplication.insertMany([
      { name: 'Test A', email: 'a@example.test', domain: 'Cyber Security', status: 'Approved' },
      { name: 'Test A', email: 'a@example.test', domain: 'cyber-security', status: 'Joined' },
      { name: 'Test B', email: 'b@example.test', domain: 'Data Analyst', status: 'Approved' },
      { name: 'Test C', email: 'c@example.test', domain: 'Cyber Security', status: 'Pending' },
      { name: 'Test D', email: 'd@example.test', domain: 'Cyber Security', status: 'Rejected' },
    ])
    const students = await Student.insertMany(['a', 'e', 'f'].map(name => ({ fullName: 'Test Learner', email: `${name}@example.test`, phone: '+919876543210', college: 'Test', course: 'BSc', yearOfStudy: 'Final Year', internshipDomain: 'Cyber Security', passwordHash: 'unused-test-hash' })))
    const batch = await InternshipBatch.create({ name: 'Test Batch', domain: 'Cyber Security', code: 'IND-TEST', mentor: 'Test Mentor', maxStudents: 10, startDate: new Date(), endDate: new Date(Date.now() + 86400000) })
    await BatchEnrollment.insertMany(students.map((student, index) => ({ student: student._id, batch: batch._id, status: index === 2 ? 'Removed' : 'Completed' })))
    assert.deepEqual(await internshipIndicators(), { 'Cyber Security': { enrollmentCount: 2 }, 'Data Analytics': { enrollmentCount: 1 } })
    assert.equal(await InternshipApplication.countDocuments(), 5)
  } finally {
    try { if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() }
  }
})
