import { Link } from 'react-router-dom';
import { REGIONS } from '../data/seed.js';

export default function Register() {
  return (
    <main className="auth-page auth-page--wide">
      <div className="auth-brand">
        <img className="auth-gov-logo" src={`${import.meta.env.BASE_URL}india-gov-portal.png`} alt="National Portal of India emblem and wordmark" />
        <span><strong>AICTE</strong><small>INSTITUTION REGISTRATION</small></span>
      </div>
      <section className="auth-card register-card" aria-labelledby="register-title">
        <p className="meta">NEW INSTITUTION ONBOARDING</p>
        <h1 id="register-title" className="h2">Request AICTE registration</h1>
        <p className="auth-intro">Provide your institution details. An AICTE officer will review the request before portal access is issued.</p>
        <p className="auth-error" role="status">Registration requests cannot be delivered because the AICTE registration service is not connected. No information entered here will be submitted.</p>
        <form className="auth-form registration-form">
          <fieldset className="registration-fields" disabled>
            <label htmlFor="institution-name">Institution name</label>
            <input id="institution-name" name="institutionName" required maxLength="160" />
            <label htmlFor="registration-number">AICTE approval / application reference <span className="optional-label">(if available)</span></label>
            <input id="registration-number" name="applicationReference" maxLength="80" />
            <div className="registration-row">
              <div><label htmlFor="region">Region</label><select id="region" name="region" required defaultValue=""><option value="" disabled>Select region</option>{REGIONS.map((region) => <option key={region}>{region}</option>)}</select></div>
              <div><label htmlFor="state">State / Union Territory</label><input id="state" name="state" required maxLength="80" /></div>
            </div>
            <div className="registration-row">
              <div><label htmlFor="contact-name">Authorized contact person</label><input id="contact-name" name="contactName" required maxLength="120" /></div>
              <div><label htmlFor="contact-email">Official email address</label><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength="160" /></div>
            </div>
            <label htmlFor="contact-phone">Contact phone</label>
            <input id="contact-phone" name="phone" type="tel" autoComplete="tel" required maxLength="30" />
            <label htmlFor="request-note">Additional information <span className="optional-label">(optional)</span></label>
            <textarea id="request-note" name="note" rows="3" maxLength="500" placeholder="Share any information that may help with the review." />
            <div className="registration-actions"><button className="btn primary" type="button" disabled>Registration unavailable</button><Link className="btn secondary" to="/login">Back to sign in</Link></div>
          </fieldset>
        </form>
      </section>
      <p className="auth-footer">AICTE Fixed Deposit Receipt Management · Registration service required</p>
    </main>
  );
}
