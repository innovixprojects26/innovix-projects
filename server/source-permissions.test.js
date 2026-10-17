import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'

test('source permission defaults and authenticated secret-safe read-only export', async () => {
 process.env.DOTENV_CONFIG_PATH=resolve('server/.permission-test-no-env')
 process.env.DOTENV_CONFIG_OVERRIDE='false'
 process.env.NODE_ENV='test'
 process.env.RUN_STARTUP_INITIALIZATION='false'
 process.env.JWT_SECRET=randomBytes(48).toString('hex')
 const mongo=await MongoMemoryServer.create({instance:{ip:'127.0.0.1',dbName:'permission_test'}})
 let server
 try {
  const uri=mongo.getUri('permission_test'); assert.match(uri,/^mongodb:\/\/127\.0\.0\.1:\d+\/permission_test$/)
  process.env.MONGODB_URI=uri
  const {DiscoverSource}=await import('./models/discover.js')
  const {discoverAdminRoutes}=await import('./routes/discover.js')
  await mongoose.connect(uri)
  const fresh=await DiscoverSource.create({name:'New',url:'https://example.org/feed',type:'RSS',categories:['Technology'],domains:['General']})
  assert.equal(fresh.commercialReuseAllowed,null); assert.equal(fresh.permissionVerifiedAt,null)
  await DiscoverSource.collection.insertOne({name:'Legacy',url:'https://user:URL_SECRET@example.org/feed?key=QUERY_SECRET#FRAGMENT_SECRET',active:true,lease:'LEASE_SECRET',apiKey:'FIELD_SECRET',permissionNotes:'token=NOTE_SECRET',licenseUrl:'https://example.org/license?token=LICENSE_SECRET'})
  const before=await DiscoverSource.collection.find({}).toArray()
  const app=express();app.use(express.json());app.use('/sources-admin',discoverAdminRoutes)
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
  const base=`http://127.0.0.1:${server.address().port}/sources-admin/sources`
  const token=jwt.sign({id:new mongoose.Types.ObjectId().toString(),role:'admin'},process.env.JWT_SECRET)
  assert.equal((await fetch(base+'/export')).status,401)
  assert.equal((await fetch(base+'/export',{headers:{Authorization:'Bearer invalid'}})).status,401)
  const response=await fetch(base+'/export',{headers:{Authorization:`Bearer ${token}`}})
  assert.equal(response.status,200)
  const text=await response.text();const rows=JSON.parse(text).data
  for(const secret of ['URL_SECRET','QUERY_SECRET','FRAGMENT_SECRET','LEASE_SECRET','FIELD_SECRET','NOTE_SECRET','LICENSE_SECRET']) assert.ok(!text.includes(secret),secret)
  const legacy=rows.find(x=>x.name==='Legacy');assert.equal(legacy.commercialReuseAllowed,null);assert.equal(legacy.permissionVerifiedAt,null);assert.equal(legacy.enabled,true);assert.equal(legacy.url,'https://example.org/feed')
  assert.deepEqual(await DiscoverSource.collection.find({}).toArray(),before)
  const patch=await fetch(base+'/'+fresh._id,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({commercialReuseAllowed:'yes'})})
  assert.equal(patch.status,400)
  const metadata={licenseType:'CC BY 4.0',licenseUrl:'https://example.org/terms',attributionRequirements:'Credit the author',permissionNotes:'Reviewed fixture terms',commercialReuseAllowed:true,permissionVerifiedAt:'2025-01-01T00:00:00.000Z'}
  const saved=await fetch(base+'/'+fresh._id,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(metadata)})
  assert.equal(saved.status,200)
  const value=(await saved.json()).data
  for(const [key,expected] of Object.entries(metadata)) assert.equal(value[key],expected)
  assert.equal(value.active,false)

 } finally {if(server) await new Promise(r=>server.close(r));await mongoose.disconnect();await mongo.stop()}
})
