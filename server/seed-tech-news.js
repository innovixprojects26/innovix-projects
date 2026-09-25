import { connectDatabase, closeDatabase } from './config/db.js'
import { TechNews } from './models/tech-news.js'

try {
  if (!await connectDatabase()) throw new Error('Configure MONGODB_URI before seeding news.')
  const result = await TechNews.updateOne({ _id: '66f000000000000000000001' }, { $setOnInsert: {
    title: 'AI Is Changing the Way Developers Build Software', category: 'AI & Software Development',
    description: 'AI-assisted development tools are helping developers with coding, debugging, documentation, testing and understanding large codebases.',
    content: 'AI-assisted development tools can help developers draft code, explore unfamiliar codebases, explain errors and suggest tests. They work best when developers provide a clear task, relevant context and a way to check the result.\n\nFor students, a useful workflow is to plan a small change, ask for assistance, review the proposed code and test it before committing. Check API assumptions, security and edge cases. Generated code can be incorrect even when its explanation sounds confident.\n\nPractice on a small project: build an API integration, document your decisions and write tests for success and failure cases. Keep your changes in Git so you can compare, review and revert them. This is a learning update, not a report about a specific product launch.',
    keyTakeaways: ['AI can assist with coding, debugging, documentation and testing.', 'Review and test generated code before using it.', 'Strong programming fundamentals help you evaluate AI suggestions.'],
    studentsShouldLearn: ['AI-assisted development workflow', 'Effective prompting for coding tasks', 'Reviewing AI-generated code', 'Git and GitHub', 'API integration', 'Testing and debugging'],
    careerTip: 'Use AI as a development assistant, but make sure you understand the code you build.',
    readTime: 3, publishDate: new Date(), featured: false, status: 'published', source: 'admin',
  } }, { upsert: true, runValidators: true })
  console.log(result.upsertedCount ? 'Created the editable sample news article.' : 'Sample already exists; existing edits preserved.')
} finally { await closeDatabase() }
