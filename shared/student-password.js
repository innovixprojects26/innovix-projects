export const passwordMinLength = 8
export const passwordMaxLength = 72
export const passwordHint = 'Use 8–72 characters with uppercase and lowercase letters, a number and a special character. Avoid common or easily guessed passwords.'
const strongerPasswordMessage = 'Please choose a stronger password using uppercase and lowercase letters, a number, and a special character. Use 8–72 characters and avoid common or easily guessed passwords.'
const specialCharacter = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/

function easilyGuessed(password) {
  const compact = password.toLowerCase().replace(/[^a-z0-9]/g, '')
  const leet = password.toLowerCase().replace(/[@4301$57]/g, (character) => ({ '@': 'a', 4: 'a', 3: 'e', 0: 'o', 1: 'i', '$': 's', 5: 's', 7: 't' })[character]).replace(/[^a-z0-9]/g, '')
  if (['password', 'qwerty', 'letmein', 'iloveyou', 'changeme', 'welcome', 'admin', 'default'].some((word) => compact.includes(word) || leet.includes(word))) return true
  if (/^(student|innovix|user|guest|test|hello|secret|monkey|dragon|football|baseball|abc)\d*$/.test(compact)) return true
  if (!compact) return true
  // Reject patterns that dominate the password, even when padded with symbols/case.
  for (const match of compact.matchAll(/(.{1,4})\1{2,}/g)) {
    if (match[0].length >= compact.length * 0.6) return true
  }
  const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc4rfv', 'qazwsxedcrfvtgb'];
  for (const sequence of sequences.flatMap((value) => [value, [...value].reverse().join('')])) {
    for (let start = 0; start <= sequence.length - 4; start++) {
      for (let length = 4; length <= sequence.length - start; length++) {
        if (length >= compact.length * 0.6 && compact.includes(sequence.slice(start, start + length))) return true
      }
    }
  }
  return false
}

export function assessStudentPassword(value) {
  const password = typeof value === 'string' ? value : ''
  const requirements = [
    { id: 'length', label: 'Be 8–72 characters', met: password.length >= passwordMinLength && password.length <= passwordMaxLength },
    { id: 'uppercase', label: 'Include an uppercase letter', met: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'Include a lowercase letter', met: /[a-z]/.test(password) },
    { id: 'number', label: 'Include a number', met: /[0-9]/.test(password) },
    { id: 'special', label: 'Include a special character', met: specialCharacter.test(password) },
    { id: 'uncommon', label: 'Not be a common or easily guessed password', met: Boolean(password) && password.length <= passwordMaxLength && !easilyGuessed(password) },
  ]
  const valid = requirements.every((requirement) => requirement.met)
  const strength = valid ? 'Strong' : requirements[0].met && requirements[5].met && requirements.filter((requirement) => requirement.met).length >= 4 ? 'Medium' : 'Weak'
  return { requirements, valid, strength }
}

// New passwords only. Login must continue to verify existing hashes without this policy.
export function passwordError(password, confirmation) {
  if (!assessStudentPassword(password).valid) return strongerPasswordMessage
  if (password !== confirmation) return 'Passwords do not match.'
  return ''
}
