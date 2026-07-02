import React from 'react';
import { motion } from 'motion/react';
import { Shield, ChevronLeft } from 'lucide-react';

export function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto px-4 py-12 pb-24"
    >
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-app-text-muted hover:text-app-primary transition-colors mb-8 group"
      >
        <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-bold uppercase tracking-widest">Back</span>
      </button>

      <div className="bg-app-surface rounded-[2.5rem] border border-app-border p-8 md:p-12 shadow-2xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-2xl bg-app-primary/10">
            <Shield className="text-app-primary" size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-app-text uppercase tracking-tight">Privacy Policy</h1>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-app-text-muted leading-relaxed">
          <p className="text-lg text-app-text font-medium">Last Updated: April 2, 2026</p>
          
          <section className="space-y-4 bg-app-primary/5 p-6 rounded-2xl border border-app-primary/10">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide flex items-center gap-2">
              <Shield size={20} className="text-app-primary" />
              Independent Status Disclaimer
            </h2>
            <p className="text-app-text font-semibold italic">
              Ninja PTE Prep is an independent preparation platform. We are NOT affiliated with, approved by, or endorsed by Pearson PLC or Pearson Education, Inc. "PTE Academic" is a registered trademark of Pearson PLC.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">1. Introduction</h2>
            <p>
              Welcome to Ninja PTE Prep ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you use our application.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">2. Information We Collect</h2>
            <p>We collect information that you provide directly to us when you:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Sign in using Google Authentication (Name, Email, Profile Picture).</li>
              <li>Use our practice tools (Voice recordings for speaking tasks, text for writing tasks).</li>
              <li>Set study goals and target scores.</li>
              <li>Make purchases or subscribe to our plans.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">3. How We Use Your Information</h2>
            <p>We use the collected data to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and maintain our service.</li>
              <li>Analyze your performance using AI to provide feedback.</li>
              <li>Personalize your study roadmap.</li>
              <li>Process your payments and manage your subscription.</li>
              <li>Communicate with you about updates or support.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">4. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data. Your authentication is handled securely by Firebase (Google), and we do not store your passwords. Payment information is processed by secure third-party providers.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">5. AI Processing</h2>
            <p>
              Our application uses Google Gemini AI to analyze your practice responses. Your voice recordings and text inputs are sent to AI models for evaluation. This data is used solely for providing you with feedback and is not used to train public models.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">6. Cookies and Tracking</h2>
            <p>
              We use cookies and similar tracking technologies to track the activity on our Service and hold certain information. Cookies are files with a small amount of data which may include an anonymous unique identifier. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">7. Data Retention</h2>
            <p>
              We will retain your personal data only for as long as is necessary for the purposes set out in this Privacy Policy. We will retain and use your data to the extent necessary to comply with our legal obligations, resolve disputes, and enforce our legal agreements and policies.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">8. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal information. You can manage your profile within the app or contact us at ninja-pte-services@googlegroups.com for data deletion requests.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">9. Third-Party Services & APIs</h2>
            <p>We use the following third-party services which act as data processors under the DPDP Act and GDPR. We ensure they have strict Data Processing Agreements (DPAs) in place:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Google Firebase & Authentication:</strong> Securely hosts our application and manages user identity.</li>
              <li><strong>Google Gemini AI:</strong> Processes text and audio for scoring and feedback. Data is ephemeral and not used to train base models.</li>
              <li><strong>Stripe:</strong> Securely handles all payment processing. We never store or transmit your raw credit card information on our servers.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">10. Data Protection Officer (DPO)</h2>
            <p>
              In compliance with the Digital Personal Data Protection (DPDP) Act, 2023 and GDPR, we have appointed a Data Protection / Grievance Officer. 
              If you have any grievances, data deletion requests, or questions about this Privacy Policy, please contact our DPO at:
              <br />
              <span className="text-app-primary font-bold">pteninja.support@gmail.com</span>
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">11. Contact Us</h2>
            <p>
              For general inquiries, please contact us at:
              <br />
              <span className="text-app-primary font-bold">ninja-pte-services@googlegroups.com</span>
            </p>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
