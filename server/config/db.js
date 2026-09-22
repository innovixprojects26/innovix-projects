import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDatabase() {
  if (!env.mongoUri) {
    console.warn('MONGODB_URI is not configured. API will run in development mode without persistence.')
    return false
  }
  try {
    await mongoose.connect(env.mongoUri)
    console.log('MongoDB connected')
    return true
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
    throw error
  }
}

export async function closeDatabase() {
  if (mongoose.connection.readyState) await mongoose.disconnect()
}
