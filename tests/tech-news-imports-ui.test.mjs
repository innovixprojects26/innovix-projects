import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('imported details preserve attribution without fabricated manual fields', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType:'custom' })
  try {
    const { NewsArticle } = await vite.ssrLoadModule('/src/TechNews.jsx')
    const article = { imported:true, title:'Publisher headline', category:'Artificial Intelligence', description:'Original excerpt <script>unsafe</script>', sourceName:'Fixture Publisher', sourceUrl:'https://example.org/original', publishDate:'2025-02-01T00:00:00.000Z' }
    const html=renderToStaticMarkup(createElement(NewsArticle,{article}))
    for(const text of ['Publisher headline','Fixture Publisher','https://example.org/original','2025-02-01T00:00:00.000Z','Read Original Source']) assert.ok(html.includes(text))
    assert.ok(html.includes('&lt;script&gt;'))
    for(const text of ['Key Takeaways','What Students Should Learn','Career Tip','min read']) assert.ok(!html.includes(text))
    const manual=renderToStaticMarkup(createElement(NewsArticle,{article:{...article,imported:false,content:'Manual body',keyTakeaways:['Original takeaway'],studentsShouldLearn:['Original learning'],careerTip:'Original tip',readTime:3}}))
    for(const text of ['Manual body','Original takeaway','Original learning','Original tip']) assert.ok(manual.includes(text))
  } finally { await vite.close() }
})
