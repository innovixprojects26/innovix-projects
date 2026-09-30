import { studentDomains } from './student.js'

export const discoverTypes = ['NEWS', 'FACT', 'DID_YOU_KNOW', 'QUICK_LEARN', 'NEW_TECH', 'CAREER', 'TIP']
export const discoverTypeLabels = { NEWS: 'Latest Update', FACT: "Today's Fact", DID_YOU_KNOW: 'Did You Know?', QUICK_LEARN: 'Quick Learn', NEW_TECH: 'New Technology', CAREER: 'Career Tip', TIP: 'Developer Tip' }
export const discoverDomains = [...studentDomains, 'General']
export const discoverTabs = { 'For You': [], News: ['NEWS', 'NEW_TECH'], Facts: ['FACT', 'DID_YOU_KNOW'], Learn: ['QUICK_LEARN', 'TIP'], Career: ['CAREER'] }
export const defaultDiscoverCategories = [
  { name: 'Web Development', domains: ['Full Stack Development', 'Frontend Developer'], keywords: ['javascript', 'react', 'node.js', 'api', 'database', 'git', 'web', 'cloud', 'typescript'] },
  { name: 'Data & Analytics', domains: ['Data Analytics', 'Python Developer'], keywords: ['python', 'sql', 'power bi', 'excel', 'data', 'analytics', 'visualization'] },
  { name: 'Creators', domains: ['Content Creation'], keywords: ['creator', 'video', 'youtube', 'instagram', 'storytelling', 'social media', 'content strategy'] },
  { name: 'Security & Privacy', domains: ['Cyber Security'], keywords: ['security', 'vulnerability', 'privacy', 'cve', 'cyber', 'encryption'] },
  { name: 'Design & Accessibility', domains: ['UI/UX Designer'], keywords: ['ux', 'accessibility', 'figma', 'typography', 'design system', 'product design'] },
  { name: 'Artificial Intelligence', domains: ['AI & Machine Learning'], keywords: ['ai', 'machine learning', 'model', 'neural', 'llm'] },
  { name: 'Technology & Careers', domains: ['General'], keywords: ['career', 'interview', 'learning'] },
]

export function normalizeArticleUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS article URL without credentials.')
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  return url.href
}
