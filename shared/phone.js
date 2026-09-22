import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/max'

const names = new Intl.DisplayNames(['en'], { type: 'region' })

export const phoneCountries = getCountries().map((country) => ({
  country,
  name: names.of(country) || country,
  code: `+${getCountryCallingCode(country)}`,
})).sort((a, b) => (a.country === 'IN' ? -1 : b.country === 'IN' ? 1 : a.name.localeCompare(b.name)))

export function normalizePhone(phoneCountry, rawPhone, required = false) {
  const raw = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  if (!raw) {
    if (required) throw new Error('Enter your phone number.')
    return { phoneCountry: '', countryCode: '', phone: '', phoneInternational: '' }
  }
  if (!getCountries().includes(phoneCountry)) throw new Error('Select a valid phone country.')
  if (!/^\+?[\d\s().-]+$/.test(raw) || !/\d/.test(raw)) throw new Error('Enter a phone number using digits only.')
  if (raw.startsWith('+') || raw.startsWith('00')) throw new Error('Enter the phone number without a country code; select it separately.')
  const parsed = parsePhoneNumberFromString(raw, phoneCountry)
  if (!parsed?.isValid() || parsed.country !== phoneCountry) throw new Error('Enter a valid phone number for the selected country.')
  return {
    phoneCountry,
    countryCode: `+${parsed.countryCallingCode}`,
    phone: parsed.nationalNumber,
    phoneInternational: parsed.number,
  }
}

export function resolveInternationalPhone(record) {
  const value = record?.phoneInternational || (typeof record?.phone === 'string' && record.phone.trim().startsWith('+') ? record.phone : '')
  if (value) {
    const parsed = parsePhoneNumberFromString(value)
    if (parsed?.isValid()) return parsed
  }
  if (record?.countryCode && record?.phone) {
    const parsed = parsePhoneNumberFromString(`${record.countryCode}${String(record.phone).replace(/\D/g, '')}`)
    if (parsed?.isValid() && `+${parsed.countryCallingCode}` === record.countryCode) return parsed
  }
  return null
}
