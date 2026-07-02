# Incident Response & Data Breach Plan

## 1. Purpose
This document outlines the standard operating procedure for identifying, containing, eradicating, and recovering from cybersecurity incidents, specifically data breaches involving Personally Identifiable Information (PII) or sensitive payment data, in compliance with the **DPDP Act (India)**, **GDPR (EU)**, and **IT Act 2000**.

## 2. Incident Response Team
- **Incident Commander:** CTO / Lead Developer
- **Data Protection Officer (DPO):** pteninja.support@gmail.com
- **Communications Lead:** CEO / Product Owner

## 3. Incident Severity Levels
- **Severity 1 (Critical):** Confirmed exfiltration of user PII or payment data.
- **Severity 2 (High):** Unauthorized access to production databases or infrastructure without confirmed data theft.
- **Severity 3 (Medium):** Localized vulnerability discovered (e.g., XSS, broken rate limits) actively being exploited.
- **Severity 4 (Low):** Minor anomalies, failed login spikes, or non-sensitive data exposure.

## 4. Response Phases

### Phase 1: Preparation
- Ensure all API endpoints are rate-limited.
- Ensure automated backups of Firebase/Firestore are enabled.
- Audit logs weekly to identify anomalies.

### Phase 2: Identification
- Monitor alerts from Vercel, Firebase Crashlytics, and Stripe Webhooks.
- Report any suspected breach immediately to the Incident Commander.

### Phase 3: Containment
- **Short-term Containment:** 
  - Rotate all compromised API keys (Gemini, Stripe, Firebase Admin).
  - Temporarily block suspicious IP addresses.
  - If necessary, take the application offline by deploying a maintenance page to Vercel.
- **Long-term Containment:** 
  - Patch vulnerabilities.
  - Review IAM roles and remove unauthorized access.

### Phase 4: Eradication
- Identify the root cause (e.g., misconfigured CORS, exposed secrets, vulnerable dependency).
- Apply security patches and dependency updates.
- Re-deploy hardened application code.

### Phase 5: Recovery
- Restore data from the last known good backup if data was corrupted.
- Monitor network traffic and API logs closely for 48 hours for recurring attacks.

### Phase 6: Notification & Compliance
*Per the DPDP Act and GDPR, notifications must happen within 72 hours of discovering a breach.*
1. **Notify Authorities:** Contact the Data Protection Board of India (or relevant EU authority if EU citizens are affected).
2. **Notify Users:** Send a transparent email to all affected users detailing:
   - What happened.
   - What data was compromised.
   - What steps we have taken to secure their accounts.
   - What actions they should take (e.g., change passwords).

## 5. Post-Incident Review
- Conduct a "blameless post-mortem" within 5 days of the incident resolution.
- Update this plan and application architecture to prevent similar future incidents.
