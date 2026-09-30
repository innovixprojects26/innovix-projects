import { useVideoTracking } from './useVideoTracking'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Video, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { studentFetch } from './student-api'
import { contentMediaUrl, contentVideoPath } from './content-video-api'
import './content-creation.css'

// A supplied local portrait is picked up at build time. No stock or external person image.
const portraits = import.meta.glob('./assets/content-creation-profile.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })
const profilePhoto = Object.values(portraits)[0]

function ContentDialog({ children, onClose, labelId, library = false }) {
  const dialog = useRef(null)
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close() }, [])
  return createPortal(<dialog ref={dialog} className={`cc-player-dialog${library ? ' cc-library-dialog' : ''}`} aria-labelledby={labelId} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }} onClick={(event) => { if (event.target === dialog.current) onClose() }}>{children}</dialog>, document.body)
}

export function ContentVideoPlayer({ item, token, onClose }) {
  const video = useRef(null)
  useVideoTracking(video, item, token)
  const [error, setError] = useState(false)
  return <ContentDialog onClose={onClose} labelId="cc-player-title"><div className="cc-player-head"><div><span>{item.module}</span><h2 id="cc-player-title">{item.title}</h2></div><button type="button" onClick={onClose} aria-label="Close video"><X size={20} /></button></div><video ref={video} controls controlsList="nodownload" crossOrigin="use-credentials" playsInline preload="metadata" src={contentMediaUrl(item._id, 'video', token)} poster={item.hasThumbnail ? contentMediaUrl(item._id, 'thumbnail', token) : undefined} onError={() => setError(true)} aria-label={item.title} /><p>{item.description}</p>{error && <p className="cc-error" role="alert">This video could not be played. Try refreshing or using a browser that supports its codec. MOV playback depends on the browser; ask your instructor for an MP4 version if needed.</p>}</ContentDialog>
}

export function RecordedClasses({ onClose }) {
  const [state, setState] = useState({ items: [], loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  const [watching, setWatching] = useState(null)
  useEffect(() => {
    let active = true
    studentFetch(contentVideoPath).then((items) => { if (active) setState({ items, loading: false, error: '' }) }).catch((error) => { if (active) setState({ items: [], loading: false, error: error.message }) })
    return () => { active = false }
  }, [attempt])
  return <ContentDialog library onClose={onClose} labelId="cc-library-title"><div className="cc-player-head"><div><span>Content Creation</span><h2 id="cc-library-title">Recorded Classes</h2></div><button type="button" onClick={onClose} aria-label="Close recorded classes"><X size={20} /></button></div>{state.loading && <p role="status">Loading recorded classes...</p>}{state.error && <div role="alert"><p>{state.error}</p><button className="button button-outline" onClick={() => { setState({ items: [], loading: true, error: '' }); setAttempt((value) => value + 1) }}>Retry</button></div>}{!state.loading && !state.error && !state.items.length && <p>Recorded classes will appear here when your instructor publishes them.</p>}<div className="cc-video-list">{state.items.map((item) => <article className="cc-video-card" key={item._id}><div className="cc-thumbnail">{item.hasThumbnail ? <img crossOrigin="use-credentials" src={contentMediaUrl(item._id, 'thumbnail')} alt={`Thumbnail for ${item.title}`} loading="lazy" /> : <Video size={32} aria-hidden="true" />}{item.duration > 0 && <span className="cc-duration">{Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}</span>}</div><div className="cc-video-copy"><span className="cc-module">{item.module}</span><h5>{item.title}</h5><p>{item.description}</p><button className="button button-outline" onClick={() => setWatching(item)}><Play size={14} /> Watch Video</button></div></article>)}</div>{watching && <ContentVideoPlayer key={watching._id} item={watching} onClose={() => setWatching(null)} />}</ContentDialog>
}

export function ContentCreationCard({ index, meetingUrl, recordedEnabled = true, applicationsOpen = true }) {
  const navigate = useNavigate()
  return <div className="internship-card cc-internship-card" id="content-creation"><div className="cc-profile-row"><span>0{index + 1}</span>{profilePhoto && <img className="cc-profile-photo" src={profilePhoto} alt="Content Creation instructor" width="64" height="64" />}</div><h3>Content Creation</h3>{!applicationsOpen && <p className="availability-notice">Applications are currently closed for this internship.</p>}<p>Build real deliverables with thoughtful mentor feedback and a portfolio-ready outcome.</p><div className="cc-class-actions">{meetingUrl && <a className="button button-dark" href={meetingUrl} target="_blank" rel="noopener noreferrer">Join Live Class</a>}{recordedEnabled && <button className="button button-outline" onClick={() => navigate('/student/recorded-classes')}><Video size={16} /> Recorded Classes</button>}</div></div>
}
