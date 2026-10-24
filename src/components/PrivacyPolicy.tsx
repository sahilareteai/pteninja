import React from 'react';
import { motion } from 'motion/react';
import { Shield, ChevronLeft, Mic, Sparkles, Trash2, Globe, Lock, Mail } from 'lucide-react';

export function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto px-4 py-8 md:py-12 pb-24"
    >
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-app-text-muted hover:text-app-primary transition-colors mb-6 group cursor-pointer"
      >
        <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-bold uppercase tracking-widest">Back to Dashboard</span>
      </button>

      <div className="bg-app-surface rounded-[2.5rem] border border-app-border p-6 sm:p-10 md:p-12 shadow-2xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3.5 rounded-2xl bg-app-primary/10 text-app-primary">
            <Shield size={32} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-app-text tracking-tight uppercase">Privacy Policy</h1>
            <p className="text-xs sm:text-sm text-app-text-muted mt-1">Effective Date & Last Updated: October 24, 2026</p>
          </div>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-app-text-muted leading-relaxed">
          {/* Disclaimer */}
          <section className="space-y-3 bg-amber-500/10 p-5 sm:p-6 rounded-2xl border border-amber-500/20">
            <h2 className="text-lg font-bold text-amber-400 uppercase tracking-wide flex items-center gap-2">
              <Shield size={18} />
              Independent Status Disclaimer
            </h2>
            <p className="text-app-text text-sm sm:text-base font-medium italic">
              PTE Ninja ("PTE Ninja - AI Exam Prep") is an independent test preparation platform developed and operated by <strong>AI Geek Advisor Pvt. Ltd.</strong> ("we," "our," or "us"). PTE Ninja is NOT affiliated with, approved by, or endorsed by Pearson PLC or Pearson Education, Inc. "PTE Academic" and "PTE Core" are registered trademarks of Pearson PLC.
            </p>
          </section>

          {/* 1. Introduction */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">1. Introduction & Scope</h2>
            <p>
              This Privacy Policy explains how <strong>AI Geek Advisor Pvt. Ltd.</strong> collects, uses, protects, and discloses personal information when you use our website (<a href="https://pteninja.com" className="text-app-primary hover:underline">https://pteninja.com</a>) and our mobile applications (<strong>PTE Ninja - AI Exam Prep</strong> on Android and iOS). We are committed to transparency and compliance with global privacy regulations, including the <strong>General Data Protection Regulation (GDPR / UK GDPR)</strong>, the <strong>California Consumer Privacy Act (CCPA / CPRA)</strong>, the <strong>Australian Privacy Principles (Privacy Act 1988)</strong>, the <strong>Canadian PIPEDA</strong>, the <strong>India DPDP Act 2023</strong>, and <strong>Google Play Developer Policies</strong>.
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">2. Information We Collect</h2>
            <p>We collect information to deliver AI-driven exam preparation, study roadmaps, and secure account management:</p>
            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
              <li><strong>Account Credentials:</strong> Name, email address, profile picture, and authentication ID when signing in through Google Sign-In or Firebase Authentication.</li>
              <li><strong>Voice & Microphone Recordings:</strong> Audio captured during speaking practice questions (Read Aloud, Repeat Sentence, Describe Image, Re-tell Lecture, Answer Short Question). Recorded strictly on-demand.</li>
              <li><strong>Written Practice Responses:</strong> Essay submissions, text summaries, and question answers for Writing and Reading sections.</li>
              <li><strong>Study & Performance Metrics:</strong> AI score breakdowns (pronunciation, fluency, grammar, vocabulary, spelling, content), mock test results, and daily study targets.</li>
              <li><strong>Subscription & Purchase Records:</strong> Purchase tokens, active plan duration, and renewal dates processed via <strong>Google Play In-App Billing</strong> on Android, or <strong>Stripe / Razorpay</strong> on the web. We never store raw credit card numbers.</li>
              <li><strong>Technical Diagnostics:</strong> IP address (processed ephemerally for regional currency localization), device model, OS version, app version, and crash analytics.</li>
              <li><strong>Advertising Data (Android Mobile App):</strong> Android Advertising ID (AAID) processed by Google AdMob for ad presentation.</li>
            </ul>
          </section>

          {/* 3. Audio & Microphone Privacy */}
          <section className="space-y-3 bg-app-bg/50 p-5 sm:p-6 rounded-2xl border border-app-border">
            <h2 className="text-lg sm:text-xl font-bold text-app-text uppercase tracking-wide flex items-center gap-2">
              <Mic size={20} className="text-app-primary" />
              3. Microphone & Voice Data Privacy
            </h2>
            <p className="text-sm sm:text-base">
              Speaking practice requires the <code>RECORD_AUDIO</code> permission. We adhere to strict privacy safeguards:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
              <li><strong>Strictly On-Demand:</strong> Microphone recording begins only when you tap the "Record" button, and stops automatically when the countdown ends or when you tap "Stop". The app never records audio in the background.</li>
              <li><strong>Evaluation Use Only:</strong> Audio recordings are sent over encrypted HTTPS connections to AI models solely to evaluate oral fluency, pronunciation, and content accuracy.</li>
              <li><strong>No Commercial Sale:</strong> Voice recordings are never sold, rented, leased, or distributed to advertising networks or third parties.</li>
              <li><strong>No Public AI Training:</strong> Your voice responses are processed ephemerally and are not used to train public foundation models.</li>
            </ul>
          </section>

          {/* 4. AI Processing */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide flex items-center gap-2">
              <Sparkles size={20} className="text-app-primary" />
              4. Artificial Intelligence (AI) Scoring
            </h2>
            <p>
              PTE Ninja utilizes Google Gemini AI models to generate Pearson-aligned scoring. Audio clips and text transcripts are transmitted via TLS 1.3 encryption and analyzed in real-time to generate your detailed diagnostic scorecard.
            </p>
          </section>

          {/* 5. Advertising via Google AdMob */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">5. Advertising (Google AdMob)</h2>
            <p>
              To support complimentary free practice questions and rewarded bonus AI evaluations, our mobile application integrates <strong>Google AdMob (Google LLC)</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
              <li><strong>Ad Formats:</strong> Banner ads, interstitial ads, and optional user-triggered rewarded video ads.</li>
              <li><strong>AdMob Data Processing:</strong> Google AdMob may process device identifiers, AAID, IP address, and interaction statistics in accordance with <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="text-app-primary hover:underline">Google's Advertising Privacy Policy</a>.</li>
              <li><strong>Opt-Out & Ad Removal:</strong> You can manage or delete your advertising identifier at any time via Android settings (<em>Settings &gt; Google &gt; Ads &gt; Reset or Delete Advertising ID</em>). Upgrading to any Pro subscription completely eliminates all banner and interstitial advertisements.</li>
            </ul>
          </section>

          {/* 6. Third-Party Service Processors */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">6. Third-Party Processors</h2>
            <p>We work exclusively with industry-leading cloud service providers bound by Data Processing Agreements:</p>
            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
              <li><strong>Google Firebase & Google Cloud:</strong> Secure database storage (Firestore), cloud hosting, and user identity management.</li>
              <li><strong>Google AdMob:</strong> Mobile ad serving and rewarded video infrastructure.</li>
              <li><strong>Google Play Billing:</strong> Secure Android in-app subscription and order processing.</li>
              <li><strong>Google Gemini AI:</strong> Automated speech and essay evaluation.</li>
              <li><strong>Stripe & Razorpay:</strong> PCI-DSS Level 1 compliant payment processing for web subscriptions.</li>
            </ul>
          </section>

          {/* 7. Account Deletion & Data Retention */}
          <section className="space-y-3 bg-red-500/5 p-5 sm:p-6 rounded-2xl border border-red-500/20">
            <h2 className="text-lg sm:text-xl font-bold text-red-400 uppercase tracking-wide flex items-center gap-2">
              <Trash2 size={20} />
              7. Account Deletion & Data Retention (Google Play Compliance)
            </h2>
            <p className="text-sm sm:text-base">
              You possess complete control over your personal information and may request its complete deletion at any time:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm sm:text-base">
              <li><strong>In-App Self-Service Deletion:</strong> You can delete your account directly inside the app by navigating to <em>Profile &gt; Settings &gt; Delete Account</em>.</li>
              <li><strong>Email / Web Deletion:</strong> You may submit an account deletion request by emailing our Data Protection Officer at <a href="mailto:pteninja.support@gmail.com" className="text-app-primary font-bold hover:underline">pteninja.support@gmail.com</a> with the subject <em>"Delete My Account and Data"</em>.</li>
              <li><strong>Purge Guarantee:</strong> Within 30 days of receiving a verified deletion request, all account credentials, practice histories, speech audio logs, and scorecards are permanently and irreversibly purged from our active databases.</li>
            </ul>
          </section>

          {/* 8. Global Legal Compliances */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide flex items-center gap-2">
              <Globe size={20} className="text-app-primary" />
              8. Global Privacy Rights & Compliances
            </h2>

            <div className="space-y-3 pl-2">
              <h3 className="text-base font-bold text-app-text">A. European Economic Area & United Kingdom (GDPR / UK GDPR)</h3>
              <p className="text-sm">
                If you are located in the EEA or UK, you are entitled to exercise your rights under GDPR Articles 15–22, including the Right of Access, Right to Rectification, Right to Erasure ("Right to be Forgotten"), Right to Restriction of Processing, Right to Data Portability, and Right to Object. You also have the right to lodge a complaint with your local Data Protection Authority.
              </p>

              <h3 className="text-base font-bold text-app-text">B. California Consumers (CCPA / CPRA - USA)</h3>
              <p className="text-sm">
                California residents have the right to know what personal information is collected, request deletion, and request correction without facing discriminatory treatment. <strong>We do NOT sell personal information and do NOT share personal information for cross-context behavioral advertising.</strong>
              </p>

              <h3 className="text-base font-bold text-app-text">C. Australia (Privacy Act 1988 & Australian Privacy Principles - APPs)</h3>
              <p className="text-sm">
                As a primary test preparation platform for candidates pursuing Australian study visas and skilled migration, we strictly adhere to the 13 Australian Privacy Principles (APPs). Australian users may access, correct, or raise concerns regarding their personal data by contacting our DPO, or by contacting the Office of the Australian Information Commissioner (OAIC) at <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-app-primary hover:underline">www.oaic.gov.au</a>.
              </p>

              <h3 className="text-base font-bold text-app-text">D. India (Digital Personal Data Protection Act, 2023 - DPDP)</h3>
              <p className="text-sm">
                In compliance with the DPDP Act 2023, data is processed lawfully with transparent notice and explicit consent. Users can exercise their rights of access, correction, and grievance redressal through our designated Grievance Officer.
              </p>
            </div>
          </section>

          {/* 9. Children's Privacy */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">9. Children's Privacy (COPPA)</h2>
            <p>
              PTE Ninja is designed for university applicants, professionals, and adults aged 18 and older (or at least 13 with verified parental/guardian permission). We do not knowingly collect personal data from children under the age of 13. Any inadvertently collected data will be deleted immediately upon discovery.
            </p>
          </section>

          {/* 10. Data Security */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide flex items-center gap-2">
              <Lock size={20} className="text-app-primary" />
              10. Data Security & Storage
            </h2>
            <p>
              All traffic is secured via HTTPS/TLS 1.3 encryption. Data stored in Google Cloud and Firebase is protected by AES-256 server-side encryption, firewalls, and least-privilege security controls.
            </p>
          </section>

          {/* 11. Contact Info & DPO */}
          <section className="space-y-3 bg-emerald-500/10 p-6 rounded-2xl border border-emerald-500/30">
            <h2 className="text-lg sm:text-xl font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-2">
              <Mail size={20} />
              11. Data Protection Officer & Grievance Contact
            </h2>
            <p className="text-app-text text-sm sm:text-base">
              For any questions, privacy concerns, or data deletion requests, please contact our Data Protection Officer:
            </p>
            <div className="text-xs sm:text-sm space-y-1 text-app-text-muted mt-2">
              <p><strong>Operating Entity:</strong> AI Geek Advisor Pvt. Ltd.</p>
              <p><strong>App:</strong> PTE Ninja - AI Exam Prep</p>
              <p><strong>Data Protection Officer:</strong> <a href="mailto:pteninja.support@gmail.com" className="text-app-primary font-bold hover:underline">pteninja.support@gmail.com</a></p>
              <p><strong>General Support:</strong> <a href="mailto:support@pteninja.com" className="text-app-primary font-bold hover:underline">support@pteninja.com</a></p>
              <p><strong>Website:</strong> <a href="https://pteninja.com" className="text-app-primary hover:underline">https://pteninja.com</a></p>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
