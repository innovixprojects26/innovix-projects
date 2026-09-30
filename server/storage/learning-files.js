import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { problem } from '../services/learning-access.js'

export const learningStorageRoot = path.resolve(process.env.LEARNING_STORAGE_DIR || fileURLToPath(new URL('../uploads/learning/', import.meta.url)))
export const learningFileLimit = 10 * 1024 * 1024
const types = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain' }
export function learningFilePath(name) {
  if (!/^[a-f\d-]{36}\.(pdf|png|jpe?g|txt)$/.test(name || '')) throw problem('File unavailable.', 404)
  return path.join(learningStorageRoot, name)
}
export function validateLearningFile(name, data) {
  if (typeof name !== 'string' || !/^[\w .()-]{1,120}$/.test(name) || name.startsWith('.') || name.includes('..')) throw problem('Use a simple filename without folders or special characters.')
  const ext = name.split('.').pop().toLowerCase()
  if (!types[ext] || !data.length || data.length > learningFileLimit) throw problem('Upload a PDF, PNG, JPG or TXT file up to 10 MB.')
  const ascii = data.toString('latin1')
  const valid = ext === 'pdf' ? ascii.startsWith('%PDF-') && ascii.trimEnd().endsWith('%%EOF') && !/\/(JavaScript|JS|Launch|EmbeddedFile)\b/i.test(ascii)
    : ext === 'png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && data.includes(Buffer.from('IEND'))
      : ['jpg', 'jpeg'].includes(ext) ? data[0] === 255 && data[1] === 216 && data[data.length - 2] === 255 && data[data.length - 1] === 217
        : !data.includes(0) && !/^(MZ|\x7fELF|#!)|<\s*(script|html|svg|iframe)\b/i.test(ascii) && !data.toString('utf8').includes('\uFFFD')
  if (!valid) throw problem('The file content does not match an allowed safe format.')
  return { ext, type: types[ext] }
}
export async function receiveLearningFile(req) {
  let name
  try { name = decodeURIComponent(req.headers['x-file-name'] || '') } catch { throw problem('Invalid filename.') }
  if (Number(req.headers['content-length']) > learningFileLimit) throw problem('File limit is 10 MB.', 413)
  await mkdir(learningStorageRoot, { recursive: true })
  const key = randomUUID(), temporary = path.join(learningStorageRoot, `${key}.part`)
  let bytes = 0
  try {
    await pipeline(req, new Transform({ transform(chunk, _encoding, done) { bytes += chunk.length; done(bytes > learningFileLimit ? problem('File limit is 10 MB.', 413) : null, chunk) } }), createWriteStream(temporary, { flags: 'wx' }))
    const { ext, type } = validateLearningFile(name, await readFile(temporary))
    const filename = `${key}.${ext}`
    await rename(temporary, learningFilePath(filename))
    return { filename, originalName: name, type, bytes }
  } catch (error) { await rm(temporary, { force: true }); throw error }
}
