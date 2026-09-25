import { API_BASE, getAdminToken } from './api'

export const contentVideoPath = '/content-creation/videos'
export function contentMediaUrl(id, kind = 'video', token) {
  return `${API_BASE}${contentVideoPath}/${encodeURIComponent(id)}/media/${kind}${token ? `?preview=${encodeURIComponent(token)}` : ''}`
}
export function uploadContentFile(id, kind, file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', `${API_BASE}/admin${contentVideoPath}/${id}/upload/${kind}`)
    request.setRequestHeader('Authorization', `Bearer ${getAdminToken()}`)
    request.setRequestHeader('Content-Type', 'application/octet-stream')
    request.setRequestHeader('X-File-Extension', file.name.split('.').pop().toLowerCase())
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    const abort = () => request.abort()
    signal.addEventListener('abort', abort, { once: true })
    const finish = (error, value) => { signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(value) }
    request.onload = () => {
      let result
      try { result = JSON.parse(request.responseText) } catch { finish(new Error('The server could not complete this upload. Check the video list before retrying.')); return }
      if (request.status >= 200 && request.status < 300 && result.success) finish(null, result.data)
      else finish(new Error(result.message || 'Upload failed. Please try again.'))
    }
    request.onerror = () => finish(new Error('Upload interrupted. Check your connection and retry from the saved draft.'))
    request.onabort = () => finish(new Error('Upload cancelled. Your draft is saved; you can resume or delete it.'))
    if (signal.aborted) { finish(new Error('Upload cancelled.')); return }
    request.send(file)
  })
}
export function readVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const finish = (value) => { clearTimeout(timer); video.onloadedmetadata = null; video.onerror = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); resolve(value) }
    const timer = setTimeout(() => finish(undefined), 5000)
    video.preload = 'metadata'
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 && video.duration <= 86400 ? video.duration : undefined)
    video.onerror = () => finish(undefined)
    video.src = url
  })
}
