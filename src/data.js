export const contactConfig = {
  whatsapp: '918489025879',
  email: 'innovixprojects26@gmail.com',
  phone: '+91 84890 25879',
  hours: 'Mon - Sat, 9:30 AM - 7:00 PM',
}

export const internshipRoles = [
  'Frontend Developer',
  'UI/UX Designer',
  'Python Developer',
  'Content Creation',
  'Cyber Security',
  'Full Stack Development',
]

// Live class configuration
// Set meetLink to the meeting URL for each track when available (Zoom or Google Meet).

export const liveClasses = [
  {
    name: 'Data Analytics',
    meetLink: 'https://us05web.zoom.us/j/89360539378?pwd=6wDbAPuaSFqICm28tsaHRWL3OhPfJr.1',
  },
  {
    name: 'AI & Machine Learning',
    meetLink: '',
  },
  {
    name: 'Full Stack Development',
    meetLink: 'https://us05web.zoom.us/j/6534770300?pwd=BOCaVrasZ37ni1xGynHRXqW82CwIbY.1',
  },
  {
    name: 'Frontend Developer',
    meetLink: '',
  },
  {
    name: 'UI/UX Designer',
    meetLink: '',
  },
  {
    name: 'Python Developer',
    meetLink: '',
  },
  {
    name: 'Content Creation',
    meetLink: 'https://us05web.zoom.us/j/6534770300?pwd=BOCaVrasZ37ni1xGynHRXqW82CwIbY.1',
  },
  {
    name: 'Cyber Security',
    meetLink: '',
  },
]

const image = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`

export const domains = [
  { name: 'AI & Machine Learning', icon: '✦', tone: 'mint', count: 18 },
  { name: 'Full Stack Development', icon: '↗', tone: 'coral', count: 24 },
  { name: 'Python', icon: '⌘', tone: 'sun', count: 16 },
  { name: 'Data Science', icon: '◌', tone: 'sky', count: 14 },
  { name: 'Cyber Security', icon: '◈', tone: 'ink', count: 11 },
  { name: 'Cloud Computing', icon: '☁', tone: 'lavender', count: 9 },
  { name: 'IoT', icon: '⌁', tone: 'mint', count: 8 },
  { name: 'Mobile Applications', icon: '▣', tone: 'coral', count: 12 },
  { name: 'Java', icon: '◇', tone: 'sun', count: 10 },
]

export const projects = [
  {
    id: 1,
    slug: 'ai-crop-recommendation-system',
    title: 'AI Crop Recommendation System',
    domain: 'AI & Machine Learning',
    technologies: ['Python', 'TensorFlow'],
    level: 'Intermediate',
    projectType: 'Final Year Project',
    description:
      'Help farmers make smarter crop choices with a practical ML recommendation engine.',
    fullDescription:
      'A data-informed crop recommendation platform that blends soil, weather, and seasonal inputs into clear, actionable recommendations for modern agriculture.',
    image: image('photo-1625246333195-78d9c38ad449'),
    features: [
      'Soil and weather inputs',
      'ML-powered recommendations',
      'Farmer-friendly dashboard',
    ],
    modules: [
      'Data collection',
      'Model training',
      'Recommendation dashboard',
    ],
    trending: true,
    popular: true,
    newProject: false,
  },

  {
    id: 2,
    slug: 'ai-resume-screening-system',
    title: 'AI Resume Screening System',
    domain: 'AI & Machine Learning',
    technologies: ['Python', 'NLP'],
    level: 'Advanced',
    projectType: 'Real-Time Project',
    description:
      'Shortlist relevant candidates faster with natural language processing and ranking.',
    fullDescription:
      'An ATS-style application that extracts skills, compares profiles to role requirements, and provides transparent candidate scoring.',
    image: image('photo-1551836022-d5d88e9218df'),
    features: [
      'Resume text extraction',
      'Skill matching',
      'Recruiter workspace',
    ],
    modules: ['Upload pipeline', 'NLP scoring', 'Results and export'],
    trending: true,
    popular: true,
    newProject: true,
  },

  {
    id: 3,
    slug: 'student-attendance-management-system',
    title: 'Student Attendance Management System',
    domain: 'Python',
    technologies: ['Python', 'Django'],
    level: 'Beginner',
    projectType: 'Mini Project',
    description:
      'A clean attendance workflow for faculty, students, and academic reporting.',
    fullDescription:
      'Manage classes, attendance records, leave requests, and reports from one straightforward academic workspace.',
    image: image('photo-1523240795612-9a054b0db644'),
    features: [
      'Role-based access',
      'Attendance reports',
      'Leave requests',
    ],
    modules: ['Admin panel', 'Faculty dashboard', 'Student portal'],
    trending: true,
    popular: false,
    newProject: false,
  },

  {
    id: 4,
    slug: 'e-commerce-website',
    title: 'E-Commerce Website',
    domain: 'Full Stack Development',
    technologies: ['React', 'Node.js'],
    level: 'Intermediate',
    projectType: 'Final Year Project',
    description:
      'Build a polished commerce experience with catalog, checkout, and order tracking.',
    fullDescription:
      'A full-stack commerce platform designed to teach real-world product, cart, order, and admin flows.',
    image: image('photo-1556742049-0cfed4f6a45d'),
    features: [
      'Product catalog',
      'Cart and checkout',
      'Order tracking',
    ],
    modules: ['Customer app', 'Admin console', 'Order service'],
    trending: true,
    popular: true,
    newProject: false,
  },

  {
    id: 5,
    slug: 'hospital-management-system',
    title: 'Hospital Management System',
    domain: 'Java',
    technologies: ['Java', 'MySQL'],
    level: 'Intermediate',
    projectType: 'Final Year Project',
    description:
      'Connect appointments, patient records, billing, and staff workflows in one system.',
    fullDescription:
      'A structured hospital operations project focused on clear workflows for reception, doctors, patients, and billing.',
    image: image('photo-1576091160399-112ba8d25d1d'),
    features: [
      'Appointment scheduling',
      'Patient records',
      'Billing workflows',
    ],
    modules: ['Reception', 'Doctor workspace', 'Billing'],
    trending: true,
    popular: false,
    newProject: false,
  },

  {
    id: 6,
    slug: 'ai-chatbot',
    title: 'AI Chatbot for Student Support',
    domain: 'Python',
    technologies: ['Python', 'OpenAI'],
    level: 'Intermediate',
    projectType: 'Real-Time Project',
    description:
      'Answer common student questions with a friendly, context-aware support assistant.',
    fullDescription:
      'A conversational student support assistant that makes FAQs, resource discovery, and escalation easier.',
    image: image('photo-1531482615713-2afd69097998'),
    features: [
      'Intent recognition',
      'FAQ knowledge base',
      'Escalation prompts',
    ],
    modules: ['Chat UI', 'Knowledge base', 'Analytics'],
    trending: true,
    popular: true,
    newProject: true,
  },

  {
    id: 7,
    slug: 'cyber-security-threat-detection',
    title: 'Cyber Security Threat Detection',
    domain: 'Cyber Security',
    technologies: ['Python', 'Scikit-learn'],
    level: 'Advanced',
    projectType: 'Real-Time Project',
    description:
      'Detect unusual network behavior and surface security signals early.',
    fullDescription:
      'A learning-focused threat detection dashboard that classifies network events and helps students understand security operations.',
    image: image('photo-1563013544-824ae1b704d3'),
    features: [
      'Event classification',
      'Threat dashboard',
      'Alert triage',
    ],
    modules: [
      'Data ingestion',
      'Detection model',
      'Security dashboard',
    ],
    trending: true,
    popular: false,
    newProject: false,
  },

  {
    id: 8,
    slug: 'online-examination-system',
    title: 'Online Examination System',
    domain: 'Web Development',
    technologies: ['React', 'Firebase'],
    level: 'Beginner',
    projectType: 'Mini Project',
    description:
      'Create flexible online assessments with timed tests and instant results.',
    fullDescription:
      'A responsive examination platform with question banks, timed attempts, scoring, and faculty controls.',
    image: image('photo-1434030216411-0b793f4b4173'),
    features: [
      'Timed assessments',
      'Question bank',
      'Instant scoring',
    ],
    modules: ['Exam builder', 'Candidate flow', 'Results'],
    trending: true,
    popular: false,
    newProject: true,
  },

  {
    id: 9,
    slug: 'job-portal-system',
    title: 'Job Portal System',
    domain: 'Full Stack Development',
    technologies: ['React', 'Express'],
    level: 'Intermediate',
    projectType: 'Final Year Project',
    description:
      'Bring job seekers and employers together in a focused portal experience.',
    fullDescription:
      'A two-sided platform that lets employers post roles and candidates discover, save, and apply to opportunities.',
    image: image('photo-1521737711867-e3b97375f902'),
    features: [
      'Role listings',
      'Candidate profiles',
      'Application tracking',
    ],
    modules: ['Employer area', 'Candidate area', 'Admin moderation'],
    trending: false,
    popular: true,
    newProject: false,
  },

  {
    id: 10,
    slug: 'expense-tracker',
    title: 'Expense Tracker',
    domain: 'Mobile Applications',
    technologies: ['React Native', 'Firebase'],
    level: 'Beginner',
    projectType: 'Mini Project',
    description:
      'Turn everyday spending into simple, useful financial visibility.',
    fullDescription:
      'A mobile-first personal finance tracker with categories, trends, and a calm daily money workflow.',
    image: image('photo-1554224155-6726b3ff858f'),
    features: [
      'Category budgets',
      'Spending charts',
      'Monthly summaries',
    ],
    modules: ['Transactions', 'Insights', 'Profile'],
    trending: false,
    popular: false,
    newProject: true,
  },

  {
    id: 11,
    slug: 'disease-prediction',
    title: 'Machine Learning Disease Prediction',
    domain: 'Data Science',
    technologies: ['Python', 'Pandas'],
    level: 'Advanced',
    projectType: 'Final Year Project',
    description:
      'Explore predictive modeling through an interpretable healthcare use case.',
    fullDescription:
      'A research-style prediction workflow with data preparation, model evaluation, and clear result interpretation.',
    image: image('photo-1576091160550-2173dba999ef'),
    features: [
      'Data preprocessing',
      'Model comparison',
      'Result interpretation',
    ],
    modules: ['Dataset lab', 'Training pipeline', 'Insights'],
    trending: false,
    popular: true,
    newProject: false,
  },

  {
    id: 12,
    slug: 'smart-agriculture-system',
    title: 'Smart Agriculture System',
    domain: 'IoT',
    technologies: ['Arduino', 'IoT'],
    level: 'Intermediate',
    projectType: 'Real-Time Project',
    description:
      'Monitor crop conditions and automate decisions with connected sensors.',
    fullDescription:
      'A practical IoT project that connects field readings to a web dashboard and smart alerts.',
    image: image('photo-1499529112087-3cb3b73cec95'),
    features: [
      'Sensor monitoring',
      'Smart alerts',
      'Live dashboard',
    ],
    modules: ['Device layer', 'Data service', 'Control center'],
    trending: false,
    popular: false,
    newProject: false,
  },
]

export const journey = [
  ['Choose Project', 'Compass'],
  ['Learn Technology', 'BookOpen'],
  ['Build Project', 'Hammer'],
  ['Get Guidance', 'MessageCircle'],
  ['Complete Internship', 'BriefcaseBusiness'],
  ['Build Portfolio', 'FolderOpen'],
  ['Prepare for Career', 'Rocket'],
]