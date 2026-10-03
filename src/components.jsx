import './news-hub.css'
import { NotificationCenter } from './NotificationCenter'
import { LearnDiscover } from './LearnDiscover'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Award, BookOpen, Check, ChevronDown, ChevronRight, Code2, Compass, FileText, Hammer, Menu, MessageCircle, Play, Search, Share2, ShieldCheck, Sparkles, Target, Wrench, X } from 'lucide-react'
import { useState } from 'react'
import { useSite } from './site-context'
import { PublicContent } from './SiteConfiguration'
import { StudentNav } from './StudentSession'
import { ThemeSelector } from './ThemeSelector'
import innovixLogo from './assets/innovix-logo.png.png'

export function Logo() {
  return <Link className="logo" to="/"><img className="logo-image" src={innovixLogo} alt="Innovix Projects logo" /><span>innovix<span className="logo-muted">projects</span></span></Link>
}

export function WhatsAppButton({ compact = false }) {
  const { settings } = useSite()
  const text = encodeURIComponent('Hi Innovix Projects,\nI\'m interested in your ₹2,999 project services. I would like to know more details.')
  return <a className={compact ? 'whatsapp whatsapp-compact' : 'whatsapp'} href={`https://wa.me/${settings.whatsapp}?text=${text}`} target="_blank" rel="noreferrer"><MessageCircle size={compact ? 17 : 21} />{!compact && <span>Chat with us</span>}</a>
}

export function Navbar() {
  const { settings } = useSite()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const submitSearch = (event) => { if (event.key === 'Enter' && query.trim()) { navigate(`/projects?search=${encodeURIComponent(query.trim())}`); setOpen(false) } }
  return <header className="site-header"><div className="container nav-wrap"><Logo /><label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={submitSearch} placeholder="Search projects, skills, domains..." aria-label="Search projects" /><kbd>↵</kbd></label><nav id="primary-navigation" aria-label="Main navigation" className={open ? 'main-nav open' : 'main-nav'}><NavLink to="/about" onClick={() => setOpen(false)}>About</NavLink>{settings.internshipsEnabled && <NavLink to="/internships" onClick={() => setOpen(false)}>Internships</NavLink>}<NavLink to="/domains" onClick={() => setOpen(false)}>Domains</NavLink>{settings.projectsEnabled && <NavLink to="/projects" onClick={() => setOpen(false)}>Projects</NavLink>}{settings.newsEnabled && <NavLink className="header-news" to="/news" onClick={() => setOpen(false)}>News</NavLink>}<NavLink to="/contact" onClick={() => setOpen(false)}>Contact</NavLink><div className="mobile-auth"><StudentNav onNavigate={() => setOpen(false)} /></div></nav><div className="desktop-auth"><StudentNav /></div><ThemeSelector /><NotificationCenter /><button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open} aria-controls="primary-navigation">{open ? <X /> : <Menu />}</button></div></header>
}

export function Footer() {
  const { settings } = useSite()
  return <footer className="footer"><div className="container footer-grid"><div><Logo /><p className="footer-intro">Turning Ideas into Innovation.<br />A clearer path from student project to confident career.</p><div className="socials"><a href={settings.instagramUrl} aria-label="Instagram"><Share2 size={17} /></a><a href={settings.linkedinUrl} aria-label="LinkedIn"><Share2 size={17} /></a>{settings.youtubeUrl && <a href={settings.youtubeUrl} aria-label="YouTube"><Share2 size={17} /></a>}</div></div><div><p className="footer-label">Explore</p><Link to="/projects">Projects</Link><Link to="/domains">Domains</Link>{settings.internshipsEnabled && <Link to="/internships">Internships</Link>}{settings.newsEnabled && <Link to="/news">News</Link>}{settings.newsEnabled && settings.techNewsEnabled && <Link to="/tech-news">Daily Tech News</Link>}<Link to="/project-finder">Find my project</Link></div><div><p className="footer-label">Company</p><Link to="/about">About Innovix</Link><Link to="/contact">Contact</Link><Link to="/faq">FAQ</Link>{settings.certificateVerificationEnabled && <Link to="/verify">Verify Certificate</Link>}<Link to="/build-your-project">Build your idea</Link></div><div><p className="footer-label">Stay in the loop</p><p className="footer-small">Get project inspiration, new domain drops, and career tips.</p><div className="subscribe"><input placeholder="Your email" aria-label="Email for updates" /><button aria-label="Subscribe"><ArrowUpRight size={17} /></button></div></div></div><div className="container footer-bottom"><span>© 2026 Innovix Projects. All Rights Reserved.</span><span>Made for ambitious student builders.</span></div></footer>
}

export function Layout({ children }) { return <><Navbar /><main><PublicContent>{children}</PublicContent></main><LearnDiscover /><WhatsAppButton /><Footer /></> }

export function SectionHeading({ eyebrow, title, description, action }) { return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div> }

export function Price({ amount = 2999 }) { return <span className="price">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)}</span> }
export function DemoLink({ project, className = 'demo-link', children }) { if (project.available === false) return <span className={className}>Currently Unavailable</span>; return project.demoUrl ? <a className={className} href={project.demoUrl} target="_blank" rel="noopener noreferrer">{children || <><Play size={12} /> Demo</>}</a> : <Link className={className} to={`/projects/${project.slug}#demo`}>{children || <><Play size={12} /> Demo</>}</Link> }

export function ProjectCard({ project, compact = false, onCompare, compared = false }) {
  const badges = [project.available === false && 'Currently Unavailable', project.featured && 'Featured', project.trending && 'Trending', project.popular && 'Popular', project.level === 'Beginner' && 'Beginner friendly', project.newProject && 'New'].filter(Boolean).slice(0, 2)
  return <article className={compact ? 'project-card project-card-compact' : 'project-card'}><Link to={`/projects/${project.slug}`} className="project-image"><img src={project.image} alt={project.title} loading="lazy" />{badges.length > 0 && <span className="card-badge">{badges[0]}</span>}<span className="image-arrow"><ArrowUpRight size={16} /></span></Link><div className="project-card-body"><div className="card-meta"><span>{project.domain}</span><span>{project.level}</span></div><Link to={`/projects/${project.slug}`}><h3>{project.title}</h3></Link><p>{project.description}</p>{!compact && <div className="tech-row">{(project.technologies || []).map((technology) => <span key={technology}>{technology}</span>)}<span>{project.projectType}</span></div>}<div className="project-card-footer"><Price amount={project.price} /><span className="project-actions"><Link className="text-link" to={`/projects/${project.slug}`}>View project <ChevronRight size={15} /></Link><DemoLink project={project} /></span></div>{onCompare && <button className={compared ? 'compare-check active' : 'compare-check'} onClick={() => onCompare(project)}><Check size={14} /> {compared ? 'Added to compare' : 'Compare'}</button>}</div></article>
}

export function StudentJourney() {
  const steps = [['01', 'Choose Your Domain', 'Start with what makes you curious.', Compass], ['02', 'Find Your Project', 'Match the brief to your skills.', Search], ['03', 'Get Your Complete Kit', 'Everything is ready to begin.', Award], ['04', 'Build With Guidance', 'Learn by making real progress.', Hammer], ['05', 'Prepare for Your Viva', 'Present your work with confidence.', Target]]
  return <section className="section journey-upgrade"><div className="container"><SectionHeading eyebrow="A clearer path forward" title="Your Project Journey, Simplified." description="From choosing an idea to confidently presenting your project, Innovix supports you at every step." /><div className="journey-timeline">{steps.map(([number, title, copy, Icon], index) => <div className="journey-upgrade-step" key={title}><div className="journey-step-marker"><span>{number}</span><Icon size={19} /></div><div><b>{title}</b><p>{copy}</p></div>{index < steps.length - 1 && <span className="journey-connector" />}</div>)}</div></div></section>
}

export function ValueSection() {
  const features = [['Complete Source Code', Code2], ['Project Documentation', FileText], ['PPT Support', BookOpen], ['Installation Guidance', Wrench], ['Output / Demo Video', Play], ['Project Explanation', Sparkles], ['Viva Preparation', Target], ['Technical Support', ShieldCheck]]
  return <section className="value-section"><div className="container value-inner"><div className="value-heading"><span className="eyebrow">Project support</span><h2>Practical work.<br /><em>Clear guidance.</em></h2><p>Explore the project listings for their saved prices and choose the package support that fits your needs.</p></div><div className="value-price"><span>₹2,999</span><small>starting from</small><b>See each project listing for its saved price.</b></div><div className="value-features">{features.map(([label, Icon]) => <div key={label}><Icon size={17} /><span>{label}</span></div>)}</div></div></section>
}

export function DemoSection({ projects }) {
  return <section className="section demo-section"><div className="container"><SectionHeading eyebrow="A little closer to the work" title="See It Before You Choose It." description="Explore project demos and understand how your project works before making your choice." /><div className="demo-grid">{projects.slice(0, 3).map((project) => <article className="demo-card" key={project._id || project.slug}><div className="demo-visual"><img src={project.image} alt="" loading="lazy" /><span><Play size={14} fill="currentColor" /> Demo preview</span></div><div className="demo-body"><div className="card-meta"><span>{project.technologies?.[0]}</span><span>{project.level}</span></div><h3>{project.title}</h3><p>{project.description}</p><div><DemoLink project={project} className="button button-dark">Watch demo <Play size={14} /></DemoLink><Link className="text-link" to={`/projects/${project.slug}`}>View project <ArrowRight size={15} /></Link></div></div></article>)}</div></div></section>
}

export function FAQ() {
  const questions = ['What is included with the ₹2,999 project?', 'Do I receive complete source code?', 'Do you provide project documentation and PPT support?', 'Will you explain the project and prepare me for viva?', 'Can I customize a project?', 'Do you provide internships?']
  const [active, setActive] = useState(0)
  return <div className="faq-list">{questions.map((question, index) => <div className={active === index ? 'faq-item active' : 'faq-item'} key={question}><button onClick={() => setActive(active === index ? -1 : index)}>{question}<ChevronDown size={18} /></button>{active === index && <p>Yes. Innovix keeps the experience practical and transparent. You receive the core project resources, documentation support, guidance, and a clear next step for your academic requirement.</p>}</div>)}</div>
}

export function FormField({ label, as = 'input', ...props }) { const Tag = as; const academicField = label === 'Department' || label === 'Student Department' || label === 'Academic Program'; const displayLabel = academicField ? 'Degree / Course / Department' : label; const fieldProps = academicField ? { placeholder: 'Type your degree or course', ...props } : props; return <label className="form-field"><span>{displayLabel}</span><Tag {...fieldProps} /></label> }

export function CourseAutocomplete({ value, onChange }) {
  const suggestions = ['MCA', 'BCA', 'BBA', 'B.Com', 'B.Sc', 'B.Tech', 'B.Sc Computer Science', 'B.Com Computer Applications', 'B.Tech Computer Science and Engineering', 'Computer Applications', 'MBA', 'M.Tech', 'Diploma', 'B.Sc Agriculture', 'Mechanical Engineering', 'Biotechnology', 'Visual Communication']
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const matches = suggestions.filter((item) => !value.trim() || item.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 6)
  const choose = (item) => { onChange(item); setOpen(false); setActive(-1) }
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); setOpen(true); setActive((index) => (index + 1) % matches.length) }
    if (event.key === 'ArrowUp' && matches.length) { event.preventDefault(); setActive((index) => (index - 1 + matches.length) % matches.length) }
    if (event.key === 'Enter' && active >= 0 && matches[active]) { event.preventDefault(); choose(matches[active]) }
    if (event.key === 'Escape') setOpen(false)
  }
  return <div className="course-autocomplete"><input value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={handleKeyDown} placeholder="Example: MCA, BCA, B.Tech CSE, B.Com CA, MBA, B.Sc Agriculture..." aria-label="Degree or course" role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0} aria-controls="course-suggestions" autoComplete="off" />{open && matches.length > 0 && <div className="course-suggestions" id="course-suggestions" role="listbox">{matches.map((item, index) => <button type="button" role="option" aria-selected={index === active} className={index === active ? 'active' : ''} key={item} onMouseDown={() => choose(item)}>{item}</button>)}</div>}</div>
}

export function Toast({ children }) { return <div className="toast"><Check size={17} /> {children}</div> }
