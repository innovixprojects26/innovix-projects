import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import '../config/env.js'

export const storageRoot = path.resolve(process.env.CONTENT_VIDEO_STORAGE_DIR || fileURLToPath(new URL('../uploads/content-creation/', import.meta.url)))
export const maxVideoBytes = 1024 * 1024 * 1024
export const maxThumbnailBytes = 5 * 1024 * 1024
export const mediaTypes = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
export function storagePath(filename) {
  if (!/^[a-f0-9-]{36}\.(mp4|webm|mov|jpg|jpeg|png|webp)$/.test(filename || '')) throw new Error('Invalid storage filename')
  return path.join(storageRoot, filename)
}
export async function removeMedia(filename) { if (filename) await rm(storagePath(filename), { force: true }) }

export function matchesSignature(buffer, extension) {
  if (extension === 'webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  if (extension === 'mp4' || extension === 'mov') {
    const atom = buffer.toString('ascii', 4, 8)
    const brand = buffer.toString('ascii', 8, 12)
    if (atom === 'ftyp') return extension === 'mov' ? brand === 'qt  ' : /^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(brand)
    return extension === 'mov' && ['moov', 'mdat', 'wide', 'free'].includes(atom)
  }
  if (extension === 'jpg' || extension === 'jpeg') return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  if (extension === 'png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return extension === 'webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
}

export async function receiveMedia(req, extension, thumbnail = false) {
  const allowed = thumbnail ? ['jpg', 'jpeg', 'png', 'webp'] : ['mp4', 'webm', 'mov']
  const limit = thumbnail ? maxThumbnailBytes : maxVideoBytes
  if (!allowed.includes(extension)) throw Object.assign(new Error(thumbnail ? 'Use a JPG, PNG or WebP thumbnail.' : 'Use an MP4, WebM or MOV video.'), { status: 400 })
  const length = Number(req.headers['content-length'])
  if (Number.isFinite(length) && length > limit) throw Object.assign(new Error(thumbnail ? 'Thumbnail limit is 5 MB.' : 'Video limit is 1 GB.'), { status: 413 })
  await mkdir(storageRoot, { recursive: true })
  const filename = `${randomUUID()}.${extension}`
  const finalPath = storagePath(filename)
  const temporary = `${finalPath}.part`
  let bytes = 0
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length
    callback(bytes > limit ? Object.assign(new Error('Upload exceeds the file size limit.'), { status: 413 }) : null, chunk)
  } })
  try {
    await pipeline(req, meter, createWriteStream(temporary, { flags: 'wx' }))
    if (!bytes) throw Object.assign(new Error('The uploaded file is empty.'), { status: 400 })
    const handle = await open(temporary, 'r')
    const header = Buffer.alloc(32)
    try { await handle.read(header, 0, header.length, 0) } finally { await handle.close() }
    if (!matchesSignature(header, extension)) throw Object.assign(new Error('File content does not match its supported format.'), { status: 400 })
    await rename(temporary, finalPath)
    return { filename, bytes }
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}
