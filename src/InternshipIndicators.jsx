import './internship-indicators.css'

export function InternshipIndicators({ enrollmentCount = 0 }) {
  return <div className="internship-indicators" aria-label="Internship ratings and enrollment"><span className="internship-rating">★ New</span><span className="internship-indicator-divider" aria-hidden="true">|</span><span>{enrollmentCount > 0 ? `${enrollmentCount.toLocaleString()} Enrolled` : 'New batch'}</span></div>
}
