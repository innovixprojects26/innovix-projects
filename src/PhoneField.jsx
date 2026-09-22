import { forwardRef, useId } from 'react'
import { phoneCountries } from '../shared/phone'

export const PhoneField = forwardRef(function PhoneField({ required = false, countryRef, onCountryKeyDown, onPhoneKeyDown }, phoneRef) {
  const countryId = useId()
  const phoneId = useId()
  return <div className="phone-field">
    <label className="form-field phone-country" htmlFor={countryId}><span>Country code</span><select id={countryId} name="phoneCountry" defaultValue="IN" required={required} ref={countryRef} onKeyDown={onCountryKeyDown}>
      {phoneCountries.map(({ country, name, code }) => <option key={country} value={country}>{name} ({code})</option>)}
    </select></label>
    <label className="form-field phone-national" htmlFor={phoneId}><span>Phone number</span><input id={phoneId} name="phone" type="tel" autoComplete="tel-national" inputMode="tel" required={required} ref={phoneRef} onKeyDown={onPhoneKeyDown} /></label>
  </div>
})
