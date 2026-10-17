import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import express from 'express'

test('public Technology News merges isolated manual/imported fixtures safely', async () => {
  process.env.DOTENV_CONFIG_PATH = resolve('server/.news-fixture-no-env')
  process.env.DOTENV_CONFIG_OVERRIDE = 'false'
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = randomBytes(48).toString('hex')
  process.env.RUN_STARTUP_INITIALIZATION = 'false'
  const mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName: 'news_adapter_test' } })
  let server
  try {
    const uri = mongo.getUri('news_adapter_test')
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/news_adapter_test$/)
    process.env.MONGODB_URI = uri
    const { listNews, readNews } = await import('./controllers/tech-news.js')
    const { TechNews } = await import('./models/tech-news.js')
    const { DiscoverItem, DiscoverSource, DiscoverCategory } = await import('./models/discover.js')
    const { WebsiteConfig } = await import('./models/management.js')
    await mongoose.connect(uri)
    assert.equal(mongoose.connection.host, '127.0.0.1')
    const source = await DiscoverSource.create({ name:'Fixture publisher', url:'https://example.org/feed', type:'RSS', active:true })
    const disabled = await DiscoverSource.create({ name:'Disabled', url:'https://example.org/disabled', type:'RSS', active:false })
    await DiscoverCategory.create({ name:'Artificial Intelligence', active:true, domains:['General'] })
    await DiscoverCategory.create({ name:'Disabled category', active:false, domains:['General'] })
    const manual = await TechNews.create({ title:'Manual', category:'Python', description:'Manual summary', content:'Original manual body', keyTakeaways:['Keep'], studentsShouldLearn:['Testing'], careerTip:'Practice', readTime:2, publishDate:'2025-01-01', status:'published' })
    const base = { title:'Imported', summary:'Publisher excerpt', category:'Artificial Intelligence', domains:['General'], imported:true, type:'NEWS', status:'published', publishedAt:new Date('2025-02-01'), source:source._id, sourceName:'Fixture publisher', sourceUrl:'https://example.org/article' }
    const imported = await DiscoverItem.create(base)
    await DiscoverItem.create({ ...base, publishedAt:new Date('2025-01-15'), sourceUrl:'https://example.org/article?utm_source=duplicate#fragment' })
    const hidden=[]
    for (const patch of [{status:'draft'},{status:'pending'},{status:'rejected'},{publishedAt:new Date('2099-01-01')},{deletedAt:new Date()},{source:disabled._id},{category:'Disabled category'},{imported:false},{type:'FACT'},{domains:[]},{sourceUrl:'javascript:alert(1)'}]) hidden.push(await DiscoverItem.create({...base,...patch}))
    const app=express(); app.get('/news',listNews); app.get('/news/:id',readNews)
    server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r))
    const get=async path=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/news${path}`);return {status:r.status,...await r.json()}}
    const list=(await get('')).data
    assert.deepEqual(list.map(x=>x._id),[String(imported._id),String(manual._id)])
    assert.equal(list[0].sourceName,base.sourceName); assert.equal(list[0].sourceUrl,base.sourceUrl)
    assert.equal(list[0].description,base.summary); assert.equal(list[0].publishDate,base.publishedAt.toISOString())
    assert.equal(list[0].content,undefined); assert.equal(list[0].keyTakeaways,undefined)
    assert.equal((await get('?latest=true')).data[0]._id,String(imported._id))
    assert.deepEqual((await get('/'+imported._id)).data,list[0])
    assert.equal((await get('/'+manual._id)).data.content,'Original manual body')
    for(const item of hidden) assert.equal((await get('/'+item._id)).status,404)
    assert.equal((await get('/invalid')).status,404)
    await WebsiteConfig.updateOne({_id:'website'},{$set:{'settings.discoverEnabled':false}},{upsert:true})
    assert.equal((await get('/'+imported._id)).status,404)
    assert.equal((await get('')).data.length,1)
    await WebsiteConfig.updateOne({_id:'website'},{$set:{'settings.techNewsEnabled':false}})
    assert.equal((await get('')).data.length,0)
  } finally {
    if(server) await new Promise(r=>server.close(r))
    await mongoose.disconnect(); await mongo.stop()
  }
})
