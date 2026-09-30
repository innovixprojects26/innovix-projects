import rateLimit from 'express-rate-limit'

// Settings are polled by every open page. Keep their budget separate from
// content/forms and authentication; neither budget can consume the other.
export function createApiLimiters({ apiLimit = 120, configurationLimit = 120 } = {}) {
  const configurationRequest = req => ['GET', 'HEAD'].includes(req.method) && /^\/configuration\/?$/i.test(req.path)
  const options = { standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Too many requests. Please try again shortly.' } }
  return [
    rateLimit({ ...options, windowMs: 60000, limit: configurationLimit, skip: req => !configurationRequest(req) }),
    rateLimit({ ...options, windowMs: 15 * 60 * 1000, limit: apiLimit, skip: configurationRequest }),
  ]
}
