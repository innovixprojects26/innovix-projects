import { StudentNotification } from '../models/learning.js'
import { getConfig } from '../models/management.js'

// Persist individual workflow events; the inbox synchronizer also repairs missed
// deliveries from saved source records without duplicating these keys.
export async function notifyStudent(student, key, title, message, href = '/student') {
  if (!(await getConfig()).settings.notificationsEnabled) return
  await StudentNotification.updateOne({ student, key }, { $setOnInsert: { student, key, title, message, href } }, { upsert: true })
}
