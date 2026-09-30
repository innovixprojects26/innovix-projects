import { useEffect } from 'react'
import { useStudentSession } from './student-session-context'
import { studentFetch } from './student-api'

export function useVideoTracking(ref, item, previewToken) {
  const session = useStudentSession()
  const studentId = session?.student?.studentId, csrfToken = session?.csrfToken
  useEffect(() => {
    const video = ref.current
    if (!video || previewToken || !studentId || !csrfToken) return
    let pending = false, active = true
    const sample = async () => {
      if (pending || !active || !Number.isFinite(video.currentTime)) return
      pending = true
      try { await studentFetch(`/student/learning/videos/${item._id}/progress`, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ position: video.currentTime }) }) }
      catch { /* Playback remains usable if tracking is temporarily unavailable. */ }
      finally { pending = false }
    }
    video.addEventListener('playing', sample); video.addEventListener('pause', sample); video.addEventListener('ended', sample)
    const timer = setInterval(() => { if (!video.paused && !video.seeking && !document.hidden) sample() }, 15000)
    return () => { active = false; clearInterval(timer); video.removeEventListener('playing', sample); video.removeEventListener('pause', sample); video.removeEventListener('ended', sample) }
  }, [ref, item._id, previewToken, studentId, csrfToken])
}
