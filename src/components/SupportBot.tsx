import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Send, Loader2, ChevronDown, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'bot';
  content: string;
}

interface UserDetails {
  name: string;
  email: string;
  issueType: string;
  description: string;
}

type BotState = 'collecting' | 'chatting' | 'submitted';

const ISSUE_TYPES = [
  'General PTE Question',
  'Study Strategy',
  'Score / Feedback Question',
  'Technical Issue',
  'Subscription / Billing',
  'Feature Request',
  'Other',
];

interface SupportBotProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function SupportBot({ isOpen, setIsOpen }: SupportBotProps) {
  const [botState, setBotState] = useState<BotState>('collecting');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userDetails, setUserDetails] = useState<UserDetails>({
    name: '',
    email: '',
    issueType: ISSUE_TYPES[0],
    description: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<Array<{ role: string; parts: Array<{ text: string }> }>>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function validateForm(): boolean {
    if (!userDetails.name.trim()) {
      toast.error('Please enter your name.');
      return false;
    }
    // Use a simple, ReDoS-safe check (same logic as server-side isValidEmail)
    const atIndex = userDetails.email.indexOf('@');
    const isEmailValid =
      atIndex > 0 &&
      atIndex === userDetails.email.lastIndexOf('@') &&
      userDetails.email.slice(atIndex + 1).includes('.');
    if (!isEmailValid) {
      toast.error('Please enter a valid email address.');
      return false;
    }
    if (!userDetails.description.trim()) {
      toast.error('Please describe your issue.');
      return false;
    }
    return true;
  }

  async function startChat() {
    if (!validateForm()) return;

    setBotState('chatting');
    setIsLoading(true);

    const userMsg: Message = { role: 'user', content: userDetails.description };
    setMessages([userMsg]);

    try {
      const response = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userDetails.description,
          history: [],
          userDetails: {
            name: userDetails.name,
            email: userDetails.email,
            issueType: userDetails.issueType,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to get response');

      historyRef.current = [
        { role: 'user', parts: [{ text: userDetails.description }] },
        { role: 'model', parts: [{ text: data.response }] },
      ];

      setMessages([userMsg, { role: 'bot', content: data.response }]);
    } catch {
      setMessages([
        userMsg,
        {
          role: 'bot',
          content:
            "I'm sorry, I couldn't process your query right now. Please try again or use the **Send to Support Team** button below to escalate your issue directly.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function sendMessage() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    setInputValue('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyRef.current,
          userDetails: {
            name: userDetails.name,
            email: userDetails.email,
            issueType: userDetails.issueType,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to get response');

      historyRef.current = [
        ...historyRef.current,
        { role: 'user', parts: [{ text }] },
        { role: 'model', parts: [{ text: data.response }] },
      ];

      setMessages(prev => [...prev, { role: 'bot', content: data.response }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'bot', content: "I'm sorry, I couldn't process your message. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function sendToSupport() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/support-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userDetails,
          conversation: messages
            .map(m => `${m.role === 'user' ? userDetails.name : 'Support Bot'}: ${m.content}`)
            .join('\n\n'),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to send ticket');

      setBotState('submitted');
      setMessages(prev => [
        ...prev,
        {
          role: 'bot',
          content: `✅ Your query has been sent to our support team! We'll get back to you at **${userDetails.email}** soon. Thank you for reaching out, ${userDetails.name}!`,
        },
      ]);
      toast.success('Support ticket submitted successfully!');
    } catch {
      toast.error('Failed to send support ticket. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetBot() {
    setBotState('collecting');
    setMessages([]);
    setInputValue('');
    setUserDetails({ name: '', email: '', issueType: ISSUE_TYPES[0], description: '' });
    historyRef.current = [];
  }

  return (
    <>
      {/* Floating toggle button — desktop only */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-app-primary text-app-bg rounded-full shadow-lg hidden md:flex items-center justify-center hover:bg-app-accent transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={isOpen ? 'Close support chat' : 'Open support chat'}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X size={22} />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle size={22} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-1.5rem)] bg-app-bg border border-app-surface rounded-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: '72vh' }}
          >
            {/* Header */}
            <div className="bg-app-primary text-app-bg px-4 py-3 flex items-center gap-3 rounded-t-2xl flex-shrink-0">
              <div className="w-8 h-8 bg-app-bg/20 rounded-full flex items-center justify-center">
                <MessageCircle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">PTE Support Bot</p>
                <p className="text-xs opacity-80 truncate">PTE Academic Help & Support</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="opacity-80 hover:opacity-100 transition-opacity flex-shrink-0"
                aria-label="Minimise chat"
              >
                <ChevronDown size={18} />
              </button>
            </div>

            {botState === 'collecting' ? (
              /* ── Details form ─────────────────────────────────────── */
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-sm text-app-text-muted leading-relaxed">
                  👋 Hi! I'm your <strong className="text-app-text">PTE Support Bot</strong>. I'm here to
                  help you with PTE Academic questions and platform issues. Please tell me a little about yourself
                  first.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-app-text-muted mb-1">Name *</label>
                  <input
                    type="text"
                    value={userDetails.name}
                    onChange={e => setUserDetails(d => ({ ...d, name: e.target.value }))}
                    placeholder="Your full name"
                    className="w-full px-3 py-2 bg-app-surface border border-app-surface rounded-lg text-sm text-app-text placeholder-app-text-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-app-text-muted mb-1">Email *</label>
                  <input
                    type="email"
                    value={userDetails.email}
                    onChange={e => setUserDetails(d => ({ ...d, email: e.target.value }))}
                    placeholder="your@email.com"
                    className="w-full px-3 py-2 bg-app-surface border border-app-surface rounded-lg text-sm text-app-text placeholder-app-text-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-app-text-muted mb-1">Issue Type *</label>
                  <select
                    value={userDetails.issueType}
                    onChange={e => setUserDetails(d => ({ ...d, issueType: e.target.value }))}
                    className="w-full px-3 py-2 bg-app-surface border border-app-surface rounded-lg text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-app-primary/50"
                  >
                    {ISSUE_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-app-text-muted mb-1">
                    Describe your issue or question *
                  </label>
                  <textarea
                    value={userDetails.description}
                    onChange={e => setUserDetails(d => ({ ...d, description: e.target.value }))}
                    placeholder="Please describe your question or issue in detail…"
                    rows={3}
                    className="w-full px-3 py-2 bg-app-surface border border-app-surface rounded-lg text-sm text-app-text placeholder-app-text-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50 resize-none"
                  />
                </div>

                <button
                  onClick={startChat}
                  disabled={isLoading}
                  className="w-full py-2.5 bg-app-primary text-app-bg rounded-lg font-bold text-sm hover:bg-app-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading && <Loader2 size={15} className="animate-spin" />}
                  Get Help
                </button>
              </div>
            ) : (
              /* ── Chat view ────────────────────────────────────────── */
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          msg.role === 'user'
                            ? 'bg-app-primary text-app-bg rounded-tr-sm'
                            : 'bg-app-surface text-app-text rounded-tl-sm'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-app-surface px-3 py-2.5 rounded-2xl rounded-tl-sm">
                        <Loader2 size={16} className="animate-spin text-app-text-muted" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Escalate / new chat actions */}
                <div className="px-4 pb-2 flex gap-2 flex-shrink-0">
                  {botState === 'chatting' && messages.length >= 2 && (
                    <button
                      onClick={sendToSupport}
                      disabled={isSubmitting}
                      className="flex-1 py-2 border border-app-primary/40 text-app-primary rounded-lg text-xs font-semibold hover:bg-app-primary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isSubmitting ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <AlertCircle size={12} />
                      )}
                      Send to Support Team
                    </button>
                  )}
                  {botState === 'submitted' && (
                    <button
                      onClick={resetBot}
                      className="flex-1 py-2 border border-app-surface text-app-text-muted rounded-lg text-xs font-semibold hover:bg-app-surface transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle size={12} className="text-green-500" />
                      Start New Query
                    </button>
                  )}
                </div>

                {/* Input area */}
                {botState === 'chatting' && (
                  <div className="px-4 pb-4 pt-1 border-t border-app-surface flex gap-2 flex-shrink-0">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="Ask a PTE-related question…"
                      className="flex-1 px-3 py-2 bg-app-surface rounded-lg text-sm text-app-text placeholder-app-text-muted focus:outline-none focus:ring-2 focus:ring-app-primary/50"
                      disabled={isLoading}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={isLoading || !inputValue.trim()}
                      className="w-9 h-9 bg-app-primary text-app-bg rounded-lg flex items-center justify-center hover:bg-app-accent transition-colors disabled:opacity-40 flex-shrink-0"
                      aria-label="Send message"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
