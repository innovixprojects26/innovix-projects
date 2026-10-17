import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import express from 'express'
import webhook from './routes/razorpay-webhook.js'

test('isolated webhook HTTP validation and raw-body middleware ordering', async t => {
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET
  const secret = 'isolated-webhook-http-secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = secret
  const app = express()
  app.use('/api/webhooks/razorpay', webhook)
  app.use(express.json())
  app.post('/ordinary-json', (req, res) => res.json(req.body))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const sign = body => createHmac('sha256', secret).update(body).digest('hex')
  const body = JSON.stringify({ entity: 'event', event: 'payment.captured', payload: { payment: { entity: { entity: 'payment', id: 'pay_fixture123' } } } }, null, 2)
  const send = async (raw, signature = sign(raw), extraHeaders = {}) => {
    const response = await fetch(`${base}/api/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature === null ? {} : { 'X-Razorpay-Signature': signature }), ...extraHeaders }, body: raw })
    const text = await response.text()
    assert.ok(!text.includes(secret) && !text.includes('pay_fixture123'))
    if (signature) assert.ok(!text.includes(signature))
    assert.equal(JSON.parse(text).success, false)
    return { status: response.status, message: JSON.parse(text).message, retry: response.headers.get('retry-after') }
  }
  try {
    await t.test('valid exact raw bytes return retryable 503, never success', async () => {
      const result = await send(body)
      assert.equal(result.status, 503); assert.equal(result.retry, '300')
      assert.match(result.message, /not enabled/)
      assert.equal((await send(body + ' ', sign(body))).status, 401)
    })
    await t.test('missing, malformed and invalid signatures rejected before parsing', async () => {
      for (const signature of [null, 'invalid', '0'.repeat(64)]) assert.equal((await send('{', signature)).status, 401)
    })
    await t.test('signed malformed JSON, structures and unsupported events rejected', async () => {
      assert.equal((await send('{')).status, 400)
      for (const value of [null, [], {}, { entity: 'event', event: 'unknown', payload: {} }, { entity: 'event', event: 'payment.captured', payload: { payment: { entity: [] } } }]) {
        assert.equal((await send(JSON.stringify(value))).status, 400)
      }
    })
    await t.test('supported payment and refund events remain unprocessed', async () => {
      for (const event of ['payment.failed', 'payment.refunded', 'refund.created', 'refund.processed', 'refund.failed']) {
        const refund = event.startsWith('refund.')
        const payload = refund ? { refund: { entity: { entity: 'refund', id: 'rfnd_fixture123', payment_id: 'pay_fixture123' } } } : JSON.parse(body).payload
        assert.equal((await send(JSON.stringify({ entity: 'event', event, payload }))).status, 503)
      }
    })
    await t.test('missing secret fails closed', async () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET
      try { assert.equal((await send(body)).status, 503) }
      finally { process.env.RAZORPAY_WEBHOOK_SECRET = secret }
    })
    await t.test('strict size and content encoding/type limits', async () => {
      assert.equal((await send('x'.repeat(256 * 1024 + 1))).status, 413)
      assert.equal((await send(body, sign(body), { 'Content-Type': 'text/plain' })).status, 415)
      assert.equal((await send(body, sign(body), { 'Content-Encoding': 'gzip' })).status, 415)
    })
    await t.test('actual server mounts raw receiver before JSON parser; ordinary JSON remains usable', async () => {
      const source = await readFile(new URL('./server.js', import.meta.url), 'utf8')
      const mount = source.indexOf("app.use('/api/webhooks/razorpay', razorpayWebhookRoutes)")
      assert.ok(mount >= 0 && mount < source.indexOf('app.use(express.json('))
      const response = await fetch(`${base}/ordinary-json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' })
      assert.deepEqual(await response.json(), { ok: true })
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
    if (previous === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
    else process.env.RAZORPAY_WEBHOOK_SECRET = previous
  }
})
