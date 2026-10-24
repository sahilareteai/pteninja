import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, ChevronLeft, Shield } from 'lucide-react';

export function TermsOfService({ onBack }: { onBack: () => void }) {
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
            <BookOpen className="text-app-primary" size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-app-text uppercase tracking-tight">Terms of Service</h1>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-app-text-muted leading-relaxed">
          <p className="text-lg text-app-text font-medium">Last Updated: April 2, 2026</p>
          
          <section className="space-y-4 bg-app-primary/5 p-6 rounded-2xl border border-app-primary/10">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide flex items-center gap-2">
              <Shield size={20} className="text-app-primary" />
              Independent Status Disclaimer
            </h2>
            <p className="text-app-text font-semibold italic">
              PTE Ninja is an independent preparation platform. We are NOT affiliated with, approved by, or endorsed by Pearson PLC or Pearson Education, Inc. "PTE Academic" is a registered trademark of Pearson PLC.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">1. Acceptance of Terms</h2>
            <p>
              By accessing or using PTE Ninja ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">2. Use of Service</h2>
            <p>
              PTE Ninja provides educational tools for PTE Academic preparation. You agree to use the Service only for lawful purposes and in a way that does not infringe the rights of others or restrict their use of the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account information. You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">4. Subscriptions and Payments</h2>
            <p>
              Certain features of our Service require a paid subscription. All payments are non-refundable unless required by law. We reserve the right to change our subscription fees at any time.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">5. Intellectual Property</h2>
            <p>
              All content, features, and functionality of the Service are the exclusive property of PTE Ninja and its licensors. You may not reproduce, distribute, or create derivative works from our content without express written permission.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">6. Limitation of Liability</h2>
            <p>
              PTE Ninja is provided "as is" without any warranties. We do not guarantee that your use of the Service will result in a specific PTE score. We are not liable for any damages arising from your use of the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">7. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms of Service at any time. We will notify users of any significant changes by posting the new terms on this page.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">8. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which the Service operates, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-app-text uppercase tracking-wide">9. Contact Us</h2>
            <p>
              If you have any questions about these Terms of Service or general inquiries, please contact us at:
              <br />
              <a href="mailto:pteninja.support@gmail.com" className="text-app-primary font-bold hover:underline">pteninja.support@gmail.com</a>
            </p>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
