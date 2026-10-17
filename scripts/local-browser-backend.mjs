import { randomBytes } from 'node:crypto'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const filename = fileURLToPath(import.meta.url)
const root = resolve(filename, '../..')

export function guard(env, expectedUri) {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/browser_test$/.test(env.MONGODB_URI || '') || env.MONGODB_URI !== expectedUri) throw new Error('Isolation guard: unexpected database target')
  if (env.NODE_ENV !== 'test' || env.RUN_STARTUP_INITIALIZATION !== 'false' || env.DOTENV_CONFIG_OVERRIDE !== 'false') throw new Error('Isolation guard: unsafe startup mode')
  if (Object.entries(env).some(([key, value]) => /RAZORPAY|PAYMENT/i.test(key) && value)) throw new Error('Isolation guard: payment configuration present')
  if (!env.DOTENV_CONFIG_PATH || !env.JWT_SECRET || !env.SESSION_SECRET) throw new Error('Isolation guard: missing isolated settings')
}

async function worker() {
  guard(process.env, process.env.LOCAL_BROWSER_URI)
  const { default: mongoose } = await import('mongoose')
  const { env } = await import('../server/config/env.js')
  guard(process.env, process.env.LOCAL_BROWSER_URI)
  if (env.mongoUri !== process.env.LOCAL_BROWSER_URI) throw new Error('Isolation guard: configuration mismatch')
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 })
  if (mongoose.connection.host !== '127.0.0.1') throw new Error('Isolation guard: connected host mismatch')
  const { Admin } = await import('../server/models/index.js')
  const { default: bcrypt } = await import('bcryptjs')
  await Admin.create({ email: env.adminEmail, passwordHash: await bcrypt.hash(env.adminInitialPassword, 12) })
  await mongoose.disconnect()
  // Bind the existing backend to loopback without changing its application code.
  const { Server } = await import('node:net')
  const listen = Server.prototype.listen
  Server.prototype.listen = function (port, callback) {
    this.once('error', error => {
      console.error('Isolated backend listen failed:', error.code)
      process.exit(1)
    })
    return listen.call(this, port, '127.0.0.1', () => {
      callback?.()
      process.send?.({ ready: true, port: this.address().port })
    })
  }
  await import('../server/server.js')
  process.on('message', message => { if (message === 'stop') process.emit('SIGTERM') })
  process.on('disconnect', () => process.emit('SIGTERM'))
}

async function launch() {
  // Do not inherit application secrets, NODE_OPTIONS, dotenv or provider settings.
  const safe = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|PROGRAMDATA|PROGRAMFILES)$/i.test(key)))
  let mongo, child, directory, stopping = false
  async function stop() {
    if (stopping) return
    stopping = true
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      if (child.connected) child.send('stop')
      const timer = setTimeout(() => child.kill(), 8000)
      await exited
      clearTimeout(timer)
    }
    await mongo?.stop()
    if (directory) await rm(directory, { recursive: true, force: true })
    console.log('Stopped: backend and disposable MongoDB cleaned up.')
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
  try {
    // Sanitize before loading MongoMemoryServer too (ignore inherited MONGOMS_*).
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, safe)
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    directory = await mkdtemp(join(tmpdir(), 'innovix-browser-'))
    const emptyEnv = join(directory, 'empty.env')
    await writeFile(emptyEnv, '')
    mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: 'browser_test' } })
    const uri = mongo.getUri('browser_test')
    const password = randomBytes(18).toString('base64url')
    const settings = { ...safe, NODE_ENV: 'test', MONGODB_URI: uri, LOCAL_BROWSER_URI: uri,
      DOTENV_CONFIG_PATH: emptyEnv, DOTENV_CONFIG_OVERRIDE: 'false', RUN_STARTUP_INITIALIZATION: 'false',
      JWT_SECRET: randomBytes(48).toString('hex'), SESSION_SECRET: randomBytes(48).toString('hex'),
      ADMIN_EMAIL: 'browser-admin@example.test', ADMIN_INITIAL_PASSWORD: password,
      CLIENT_URL: 'http://localhost:5173', PORT: '0', STUDENT_COOKIE_SAME_SITE: 'lax' }
    guard(settings, uri)
    if (stopping) { stopping = false; return await stop() }
    child = fork(filename, ['--worker'], { cwd: root, env: settings, execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    const port = await new Promise((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('Backend readiness timeout')), 30000)
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Backend exited before ready')) })
      child.once('message', message => { clearTimeout(timer); message.ready && Number.isInteger(message.port) && message.port > 0 && message.port <= 65535 ? resolveReady(message.port) : reject(new Error('Unexpected worker response')) })
    })
    const backendUrl = `http://127.0.0.1:${port}`
    const response = await fetch(`${backendUrl}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: settings.ADMIN_EMAIL, password }), signal: AbortSignal.timeout(5000) })
    const result = await response.json()
    if (!response.ok || !result.data?.token || result.data.admin.email !== settings.ADMIN_EMAIL) throw new Error('Disposable login verification failed')
    console.log('PASS: temporary loopback MongoDB; initialization disabled; payment credentials absent; disposable login verified.')
    if (process.argv.includes('--verify')) return await stop()
    console.log(`Backend: ${backendUrl}\nDisposable admin: ${settings.ADMIN_EMAIL}\nDisposable password: ${password}\nCtrl+C stops both processes and discards test data.`)
    child.once('exit', () => void stop())
  } catch (error) {
    console.error('BLOCKED: isolated startup or verification failed. No production configuration was loaded.'); console.error('Reason:', error?.message)
    process.exitCode = 1
    await stop()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === filename) {
  if (process.argv.includes('--worker')) worker().catch(() => { console.error('BLOCKED: isolated worker failed'); process.exit(1) })
  else await launch()
}
