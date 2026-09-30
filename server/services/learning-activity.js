import { LearningActivity } from '../models/learning.js'
import { getConfig } from '../models/management.js'
export async function recordActivity(student, type, key, label, points = 0) {
  const { settings } = await getConfig()
  await LearningActivity.updateOne({ student, key }, { $setOnInsert: { student, key, type, label, xp: settings.gamificationEnabled ? points : 0 } }, { upsert: true })
}
