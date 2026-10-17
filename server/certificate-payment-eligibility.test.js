import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// Evaluate the actual services with inert dependencies: no dotenv, DB, or network imports.
const context = vm.createContext({ process: { env: { NODE_ENV: 'test' } }, Date })
let stages = { videosDone: true, tasksDone: true, projectsDone: true }
const stub = (values) => new vm.SyntheticModule(Object.keys(values), function () {
  for (const [key, value] of Object.entries(values)) this.setExport(key, value)
}, { context })
const forbidden = () => { throw new Error('Unexpected database operation') }
const models = Object.fromEntries(['BatchEnrollment', 'InternshipBatch', 'InternshipTask', 'TaskSubmission', 'VideoProgress', 'LearningActivity', 'Certificate'].map(name => [name, new Proxy({}, { get: () => forbidden })]))
const modules = {
  '../models/learning.js': stub(models),
  '../models/management.js': stub({ getDomain: forbidden, getConfig: forbidden }),
  '../../shared/internship-domain.js': stub({ sameInternshipDomain: forbidden }),
  './learning-stages.js': stub({ learningStages: async () => ({ ...stages }) }),
  '../models/discover.js': stub({ DiscoverRead: {} }),
  './learning-access.js': stub({ taskQuery: forbidden, studentHasDomainAccess: forbidden, problem: (message, status) => Object.assign(new Error(message), { status }) }),
  '../../shared/learning.js': stub({ batchProgress: forbidden }),
}
const monthly = new vm.SourceTextModule(await readFile(new URL('./services/monthly-enrollment.js', import.meta.url), 'utf8'), { context })
await monthly.link(specifier => modules[specifier])
await monthly.evaluate()
modules['./monthly-enrollment.js'] = monthly
const progress = new vm.SourceTextModule(await readFile(new URL('./services/learning-progress.js', import.meta.url), 'utf8'), { context })
await progress.link(specifier => modules[specifier])
await progress.evaluate()
const { eligibility } = progress.namespace
const student = { _id: 'student-fixture' }
const evidence = () => ({ status: 'Paid', orderId: 'order_fixture123', paymentId: 'pay_fixture123', verifiedAt: new Date('2026-01-01'), amount: 49900, currency: 'INR' })
const enrollment = (mode = 'live') => ({ student: student._id, status: 'Completed', batch: { status: 'Completed' }, paymentStatus: 'PAID', paymentMode: mode, [mode === 'live' ? 'livePayment' : 'testPayment']: evidence() })
const check = async (item, expected) => assert.equal((await eligibility(student, item)).eligible, expected)

test('verified LIVE qualifies in test and production without TEST evidence', async () => {
  for (const environment of ['test', 'production']) {
    context.process.env.NODE_ENV = environment
    await check(enrollment(), true)
  }
  context.process.env.NODE_ENV = 'test'
})

test('incomplete, malformed, refunded and conflicting LIVE evidence is rejected', async () => {
  for (const key of ['status', 'orderId', 'paymentId', 'verifiedAt', 'amount', 'currency']) {
    const item = enrollment(); delete item.livePayment[key]; await check(item, false)
  }
  for (const patch of [
    { status: 'Pending' }, { status: 'Refunded' }, { orderId: 'bad' }, { paymentId: {} },
    { verifiedAt: 'invalid' }, { verifiedAt: true }, { amount: -1 }, { amount: '49900' },
    { currency: 'USD' }, { amount_refunded: 1 },
  ]) await check({ ...enrollment(), livePayment: { ...evidence(), ...patch } }, false)
  await check({ ...enrollment(), testPayment: evidence() }, false)
  await check({ ...enrollment(), paymentMode: 'test' }, false)
  await check({ ...enrollment(), paymentStatus: 'NOT_PAID' }, false)
})

test('unpaid and manually marked paid-only records do not qualify', async () => {
  for (const paymentStatus of ['NOT_PAID', 'Paid', 'PAID']) {
    const item = enrollment(); delete item.livePayment; delete item.paymentMode
    await check({ ...item, paymentStatus }, false)
  }
})

test('verified TEST and legacy TEST evidence qualify only outside production', async () => {
  for (const legacy of [false, true]) {
    const item = enrollment('test')
    if (legacy) { delete item.paymentMode; item.paymentStatus = 'Not Paid' }
    context.process.env.NODE_ENV = 'test'
    await check(item, true)
    context.process.env.NODE_ENV = 'production'
    await check(item, false)
  }
  context.process.env.NODE_ENV = 'test'
  await check({ ...enrollment('test'), livePayment: evidence() }, false)
  await check({ ...enrollment('test'), paymentMode: 'unknown' }, false)
  await check({ ...enrollment('test'), paymentStatus: 'NOT_PAID' }, false)
  await check({ ...enrollment('test'), testPayment: { ...evidence(), amount_refunded: 1 } }, false)
})

test('ownership, completed batch/enrollment and all learning stages remain mandatory', async () => {
  for (const mode of ['live', 'test']) {
    await assert.rejects(eligibility(student, { ...enrollment(mode), student: 'other' }), { status: 404 })
    await assert.rejects(eligibility(student, { ...enrollment(mode), batch: null }), { status: 404 })
    await check({ ...enrollment(mode), status: 'Enrolled' }, false)
    await check({ ...enrollment(mode), batch: { status: 'Active' } }, false)
    for (const key of Object.keys(stages)) {
      stages[key] = false
      try { await check(enrollment(mode), false) } finally { stages[key] = true }
    }
    await check(enrollment(mode), true)
  }
  // Model operations throw above: eligibility never creates or changes certificates.
})
