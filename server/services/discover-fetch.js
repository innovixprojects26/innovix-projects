import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request } from 'node:https'

export const FETCH_LIMIT = 1024 * 1024
export const FETCH_TIMEOUT = 8000
export function safeSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Enter a valid HTTPS source URL.')
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || isIP(host) || host.includes(':') || host.endsWith('.') || !host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host)) throw new Error('Use a public HTTPS hostname on port 443 without credentials or fragments.')
  return url
}
export function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}
export async function publicAddress(url, resolve = lookup) {
  let timer
  try {
    const addresses = await Promise.race([resolve(url.hostname, { all: true, family: 4 }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), 2000) })])
    if (!addresses.length || addresses.some(item => !isPublicIPv4(item.address))) throw new Error('Source resolves to an unsupported or non-public network.')
    return addresses[0].address
  } finally { clearTimeout(timer) }
}
export async function validateSourceUrl(value) { const url = safeSourceUrl(value); await publicAddress(url); return url.href }

// DNS is checked once and the approved IPv4 address is pinned to the TLS request.
// No redirects, proxies, cookies, credentials, decompression or third-party keys.
export async function fetchSource(value, { resolve = lookup, transport = request } = {}) {
  const url = safeSourceUrl(value)
  const address = await publicAddress(url, resolve)
  return new Promise((resolveResponse, reject) => {
    let timer
    const req = transport(url, { method: 'GET', family: 4, agent: false, servername: url.hostname, lookup: (_hostname, options, callback) => options?.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4), headers: { Accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml', 'Accept-Encoding': 'identity', 'User-Agent': 'Innovix-Learn-Discover/1.0' } }, response => {
      const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
      if (response.statusCode !== 200) { response.destroy(); req.destroy(new Error('Source must return HTTP 200 without redirects.')); return }
      if (!['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'application/feed+json', 'application/json'].includes(type)) { response.destroy(); req.destroy(new Error('Source response is not an accepted feed content type.')); return }
      if ((response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') || Number(response.headers['content-length']) > FETCH_LIMIT) { response.destroy(); req.destroy(new Error('Source response exceeds supported size or encoding.')); return }
      let bytes = 0
      const parts = []
      response.on('data', chunk => { bytes += chunk.length; if (bytes > FETCH_LIMIT) req.destroy(new Error('Source response exceeds 1 MB.')); else parts.push(chunk) })
      response.on('error', reject)
      response.on('aborted', () => reject(new Error('Source response was interrupted.')))
      response.on('end', () => { clearTimeout(timer); resolveResponse({ text: Buffer.concat(parts).toString('utf8'), contentType: type }) })
    })
    timer = setTimeout(() => req.destroy(new Error('Source request timed out.')), FETCH_TIMEOUT)
    req.on('error', error => { clearTimeout(timer); reject(error) })
    req.end()
  })
}
