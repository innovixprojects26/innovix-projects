export const learningSettings = { batchesEnabled: true, tasksEnabled: true, certificateVerificationEnabled: true, notificationsEnabled: true, gamificationEnabled: false, leaderboardEnabled: false }
export const batchStatuses = ['Draft', 'Upcoming', 'Active', 'Completed', 'Cancelled']
export const taskStatuses = ['Draft', 'Published', 'Closed']
export const submissionStatuses = ['Submitted', 'Under Review', 'Approved', 'Resubmit', 'Completed']
export const submissionMethods = ['text', 'github', 'demo', 'file']
export const certificateTypes = ['Internship Certificate', 'Completion Certificate', 'Project Certificate', 'Achievement Certificate']
export const leadStatuses = ['New', 'Contacted', 'Interested', 'Follow-up', 'Payment Pending', 'Confirmed', 'In Progress', 'Completed', 'Closed', 'Converted']
export function batchProgress(batch, now = new Date()) {
  const start = new Date(batch.startDate).getTime(), end = new Date(batch.endDate).getTime()
  const total = Math.max(1, Math.ceil((end - start) / 86400000))
  let measuredAt = new Date(now).getTime()
  if (['Draft', 'Upcoming'].includes(batch.status)) measuredAt = start
  if (batch.status === 'Cancelled') measuredAt = Math.min(measuredAt, batch.updatedAt ? new Date(batch.updatedAt).getTime() : start)
  const elapsed = Math.max(0, Math.min(total, Math.floor((measuredAt - start) / 86400000)))
  return { daysCompleted: elapsed, daysRemaining: Math.max(0, total - elapsed), totalDays: total, percent: Math.round(elapsed / total * 100) }
}
export const daysUntil = (date, now = new Date()) => {
  const days = (new Date(date) - new Date(now)) / 86400000
  return days < 0 ? Math.floor(days) : Math.ceil(days)
}

export function taskTab(item) { return !item.submission || item.submission.status === 'Resubmit' ? 'Pending' : ['Submitted', 'Under Review'].includes(item.submission.status) ? 'Submitted' : item.submission.status === 'Completed' ? 'Completed' : 'Reviewed' }
