import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { safeSourceUrl, isPublicIPv4, publicAddress, fetchSource, FETCH_LIMIT } from './services/discover-fetch.js'
import { parseFeed, plainText, mapEntry } from './services/discover-ingest.js'
import { normalizeArticleUrl, defaultDiscoverCategories } from '../shared/discover.js'

test('SSRF URL and DNS rules reject unsafe destinations and alternative IP representations', async () => {
  for (const url of ['http://example.com/feed', 'file:///etc/passwd', 'ftp://example.com', 'https://localhost', 'https://localhost.localdomain', 'https://127.0.0.1', 'https://127.1', 'https://2130706433', 'https://0x7f000001', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://10.1.1.1', 'https://169.254.169.254', 'https://site.internal', 'https://site.local', 'https://example.com:444', 'https://user:pass@example.com', 'https://example.com/#x', 'https://example.com.', 'not a URL']) {
    if (url === 'https://localhost.localdomain') { await assert.rejects(publicAddress(new URL(url), async () => [{ address: '127.0.0.1' }])); continue }
    assert.throws(() => safeSourceUrl(url), url)
  }
  for (const ip of ['0.0.0.0', '10.1.1.1', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.2.1', '192.0.0.9', '192.88.99.1', '198.18.0.1', '198.19.1.1', '198.51.100.4', '203.0.113.2', '224.0.0.1', '255.255.255.255', '::1', '2001:db8::1']) assert.equal(isPublicIPv4(ip), false, ip)
  assert.equal(isPublicIPv4('93.184.216.34'), true)
  await assert.rejects(publicAddress(new URL('https://example.com'), async () => [{ address: '93.184.216.34' }, { address: '10.0.0.1' }]))
  await assert.rejects(publicAddress(new URL('https://example.com'), async () => []))
  assert.equal(normalizeArticleUrl('https://example.com/article?utm_source=x&b=2&a=1#top'), 'https://example.com/article?a=1&b=2')
})

function fakeTransport({ status = 200, headers = {}, chunks = [Buffer.from('<rss/>')], inspect, stall = false } = {}) {
  return (url, options, callback) => {
    inspect?.(url, options)
    const req = new EventEmitter()
    req.destroy = error => { req.emit('error', error); return req }
    req.end = () => { if (!stall) queueMicrotask(() => { const response = Readable.from(chunks); response.statusCode = status; response.headers = { 'content-type': 'application/rss+xml', ...headers }; callback(response) }) }
    return req
  }
}
test('fetch pins public DNS, validates response type, rejects redirects and enforces byte limits', async () => {
  let resolutions = 0
  const resolve = async () => { resolutions++; return [{ address: '93.184.216.34', family: 4 }] }
  const result = await fetchSource('https://example.com/feed', { resolve, transport: fakeTransport({ inspect: (url, options) => { assert.equal(url.hostname, 'example.com'); assert.equal(options.servername, 'example.com'); assert.equal(options.agent, false); options.lookup('example.com', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '93.184.216.34'); assert.equal(family, 4) }); options.lookup('example.com', { all: true }, (error, addresses) => { assert.equal(error, null); assert.equal(addresses[0].address, '93.184.216.34') }) } }) })
  assert.equal(result.text, '<rss/>')
  assert.equal(resolutions, 1)
  for (const fixture of [{ status: 302, headers: { location: 'https://127.0.0.1' } }, { headers: { 'content-type': 'text/html' } }, { headers: { 'content-encoding': 'gzip' } }, { headers: { 'content-length': String(FETCH_LIMIT + 1) } }, { chunks: [Buffer.alloc(FETCH_LIMIT), Buffer.from('x')] }]) await assert.rejects(fetchSource('https://example.com/feed', { resolve, transport: fakeTransport(fixture) }))
  await assert.rejects(fetchSource('https://example.com/feed', { resolve: async () => [{ address: '127.0.0.1' }], transport: () => { assert.fail('Must not connect to rejected address') } }))
})
test('external requests time out instead of hanging', async () => {
  await assert.rejects(fetchSource('https://example.com/feed', { resolve: async () => [{ address: '93.184.216.34' }], transport: fakeTransport({ stall: true }) }), /timed out/)
})

test('RSS, Atom and JSON Feed parsers keep short safe metadata and reject entity expansion', () => {
  const rss = '<rss version="2.0"><channel><item><title>React &amp; APIs</title><link>https://example.com/article?utm_medium=rss</link><description><![CDATA[<p>Learn API testing</p><script>alert(1)</script>]]></description><content:encoded>DO NOT COPY FULL ARTICLE</content:encoded><pubDate>Fri, 25 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>'
  const result = parseFeed(rss, 'RSS')[0]
  assert.equal(result.title, 'React & APIs')
  assert.equal(result.summary, 'Learn API testing')
  assert.equal(result.url, 'https://example.com/article')
  assert.ok(!JSON.stringify(result).includes('FULL ARTICLE'))
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Design tips</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/design"/><summary>Accessible forms</summary><updated>2026-09-25T12:00:00Z</updated></entry></feed>'
  assert.equal(parseFeed(atom, 'ATOM')[0].url, 'https://example.com/design')
  assert.equal(parseFeed(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', items: [{ title: 'Creator tips', url: 'https://example.com/create', summary: 'word '.repeat(300), content_html: 'FULL ARTICLE' }] }), 'JSON_FEED')[0].summary.split(' ').length, 40)
  assert.throws(() => parseFeed('<!DOCTYPE rss [<!ENTITY a SYSTEM "file:///etc/passwd">]><rss/>', 'RSS'))
  assert.throws(() => parseFeed('<feed><broken></feed>', 'ATOM'))
  assert.throws(() => parseFeed('<rss>' + '<a>'.repeat(100) + '</a>'.repeat(100) + '</rss>', 'RSS'))
  assert.throws(() => parseFeed('x'.repeat(FETCH_LIMIT + 1), 'RSS'))
  assert.equal(parseFeed('<rss><channel><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>', 'RSS').length, 0)
  assert.equal(plainText('<script>evil()</script><b>Safe</b>'), 'Safe')
  const categories = defaultDiscoverCategories.map(item => ({ ...item, active: true }))
  const source = { categories: categories.map(item => item.name), domains: ['Content Creation', 'General', 'Full Stack Development'] }
  assert.deepEqual(mapEntry({ title: 'YouTube creator video storytelling', summary: '' }, source, categories).domains, ['Content Creation'])
  assert.deepEqual(mapEntry({ title: 'An unrelated update', summary: '' }, source, categories).domains, ['General'])
  assert.deepEqual(mapEntry({ title: 'React JavaScript APIs', summary: '' }, source, categories).domains, ['Full Stack Development'])
})
