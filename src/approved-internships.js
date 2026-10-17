export const approvedInternshipRoles = [
  'Frontend Developer',
  'UI/UX Designer',
  'Python Developer',
  'Content Creation',
  'Cyber Security',
  'Full Stack Development',
  'Data Analyst',
  'AI & Machine Learning',
]

const displayName = name =>
  name === 'Data Analytics' ? 'Data Analyst' :
  name === 'Front-End Developer' ? 'Frontend Developer' : name

export const approvedInternshipTracks = domains =>
  approvedInternshipRoles
    .map(role => domains.find(item => displayName(item.name) === role))
    .filter(Boolean)

export const internshipDisplayName = displayName
