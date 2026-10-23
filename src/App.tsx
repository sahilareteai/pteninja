import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Swords,
  Mic, 
  PenTool, 
  BookOpen, 
  Headphones, 
  Trophy, 
  Target, 
  ChevronRight, 
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Info,
  Lock, 
  Play,
  RefreshCw,
  Settings,
  User,
  Mail,
  BarChart3,
  Flame,
  Star,
  Shield,
  Clock,
  ArrowRight,
  Check,
  CheckCircle,
  X,
  LogOut,
  CreditCard,
  ShieldCheck,
  Bell,
  Calendar,
  Map,
  Plus,
  Layout,
  Trash2,
  TrendingUp,
  AlertCircle,
  Book,
  Search,
  Volume2,
  Loader2,
  Sun,
  Moon,
  Database,
  Menu,
  MessageCircle,
  Save,
  RotateCcw,
  Phone,
  Gift,
  Share2,
  Copy,
  Sparkles
} from 'lucide-react';
import { cn, getLocalDateStr, formatAuthError } from './lib/utils';
import { Toaster, toast } from 'sonner';
import { Logo } from './components/Logo';
import { DatePicker } from './components/DatePicker';
import { PTE_TASKS, PTESection, PTETask, UserProgress, SUBSCRIPTION_PLANS, DailyGoal, ScheduledTask, TaskCompletion, MockTest, MockTestResult, MockTestSavedSession, UserData } from './types';
import { CurrencyService } from './services/currencyService';
import { MOCK_TESTS } from './data/mockTests';
import { PTE_VOCABULARY, VocabularyWord } from './data/vocabulary';
import { analyzeSpeaking, analyzeWriting, generateTTS, WritingAnalysisResult } from './services/geminiService';
import { SubscriptionProvider, useSubscription } from './components/SubscriptionProvider';
import { PromoService, PromoCode, generateUserReferralCode } from './services/promoService';
import { AdminDashboard } from './components/AdminDashboard';
import { CookieBanner } from './components/CookieBanner';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';
import { LandingPage } from './components/LandingPage';
import { SupportBot } from './components/SupportBot';
import { DiwaliBanner } from './components/DiwaliBanner';
import { 
  auth, 
  db, 
  doc, 
  updateDoc, 
  handleFirestoreError, 
  OperationType, 
  addDoc, 
  collection, 
  deleteField,
  updateProfile,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  unlink,
  ConfirmationResult
} from './firebase';
import { deleteUser } from 'firebase/auth';
import { seedTasksToFirestore } from './services/taskService';

// Module-level mic stream cache — shared across TaskModal instances so the browser
// only asks for microphone permission once per practice session.
let _globalMicStream: MediaStream | null = null;

function getOrRequestMicStream(): Promise<MediaStream> {
  if (_globalMicStream && _globalMicStream.getTracks().some(t => t.readyState === 'live')) {
    return Promise.resolve(_globalMicStream);
  }
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    _globalMicStream = stream;
    return stream;
  });
}

function releaseGlobalMicStream() {
  if (_globalMicStream) {
    _globalMicStream.getTracks().forEach(t => t.stop());
    _globalMicStream = null;
  }
}

// Mock Data for Initial State
const INITIAL_PROGRESS: UserProgress = {
  targetScore: 0,
  currentScore: 0,
  streak: 0,
  completedTasks: [],
  taskScores: {},
  favoriteWords: []
};

const calculateStreak = (activityLog: string[] = []) => {
  if (!activityLog || activityLog.length === 0) return 0;

  const todayStr = getLocalDateStr();

  // Deduplicate and sort descending so we walk from most-recent to oldest
  const uniqueLogs = Array.from(new Set(activityLog)).sort((a, b) => b.localeCompare(a));

  if (uniqueLogs.length === 0) return 0;

  // The streak must start from today or yesterday; otherwise it is broken
  let checkStr = todayStr;
  if (uniqueLogs[0] !== checkStr) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday);
    if (uniqueLogs[0] !== yesterdayStr) {
      return 0;
    }
    checkStr = yesterdayStr;
  }

  let streak = 0;
  for (const logStr of uniqueLogs) {
    if (logStr === checkStr) {
      streak++;
      // Step back one calendar day using local date arithmetic
      const checkDate = new Date(+checkStr.split('-')[0], +checkStr.split('-')[1] - 1, +checkStr.split('-')[2]);
      checkDate.setDate(checkDate.getDate() - 1);
      checkStr = getLocalDateStr(checkDate);
    } else if (logStr < checkStr) {
      break;
    }
  }

  return streak;
};

const NotificationService = {
  requestPermission: async () => {
    if (!('Notification' in window)) {
      toast.error("Notifications are not supported in this browser.");
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast.success("Notifications enabled!");
        return true;
      } else if (permission === 'denied') {
        toast.error("Notification permission denied. Please enable it in your browser settings.");
        return false;
      }
      return false;
    } catch (e) {
      console.error("Permission request error:", e);
      toast.error("Failed to request notification permission.");
      return false;
    }
  },
  send: (title: string, options?: NotificationOptions) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, options);
      } catch (e) {
        console.error("Notification error:", e);
        // Fallback to toast if Notification constructor fails (e.g. in some mobile browsers)
        toast(title, { description: options?.body });
      }
    } else {
      // Fallback to toast if permission not granted but we tried to send
      toast(title, { description: options?.body });
    }
  }
};

const DEFAULT_SCHEDULE_TIME = '09:00';
const DEFAULT_SCHEDULE_DURATION = 30;

function RoadmapView({ user, allTasks, onBack, onStartTask, notificationPermission, onRequestPermission }: { 
  user: any, 
  allTasks: PTETask[],
  onBack: () => void, 
  onStartTask: (task: PTETask) => void,
  notificationPermission: string,
  onRequestPermission: () => void
}) {
  const [activeView, setActiveView] = useState<'roadmap' | 'schedule' | 'goals'>('roadmap');
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ category: '', time: DEFAULT_SCHEDULE_TIME, duration: DEFAULT_SCHEDULE_DURATION });
  const [newGoal, setNewGoal] = useState({ type: 'tasks' as 'tasks' | 'time', target: 10 });
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);

  const currentScore = (() => {
    if (!user?.taskScores || Object.keys(user.taskScores).length === 0) return 0;
    let totalScore = 0;
    let totalAttempts = 0;
    Object.values(user.taskScores).forEach((scores: any) => {
      if (Array.isArray(scores)) {
        scores.forEach((score: number) => { totalScore += score; totalAttempts++; });
      }
    });
    return totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0;
  })();

  const BELT_DETAILS: Record<string, {
    color: string;
    gradient: string;
    scoreRange: string;
    emoji: string;
    sections: { name: string; icon: string; tasks: { label: string; category: string }[]; tip: string }[];
    keySkills: string[];
    tips: string[];
  }> = {
    white: {
      color: '#e2e8f0',
      gradient: 'from-slate-400 to-slate-300',
      scoreRange: '0 → 30',
      emoji: '🥋',
      sections: [
        {
          name: 'Speaking',
          icon: '🎙️',
          tasks: [
            { label: 'Read Aloud (Questions 1–5)', category: 'Read Aloud' },
            { label: 'Repeat Sentence (Questions 1–3)', category: 'Repeat Sentence' },
          ],
          tip: 'Focus on clear pronunciation and steady pace.',
        },
        {
          name: 'Reading',
          icon: '📖',
          tasks: [
            { label: 'Multiple Choice, Single Answer (Questions 1–3)', category: 'Multiple Choice, Single Answer' },
            { label: 'Reading: Fill in the Blanks (Questions 1–2)', category: 'Reading: Fill in the Blanks' },
          ],
          tip: 'Skim paragraphs for the main idea before answering.',
        },
        {
          name: 'Writing',
          icon: '✍️',
          tasks: [
            { label: 'Summarize Written Text (Question 1)', category: 'Summarize Written Text' },
            { label: 'Write Essay (Question 1 — basic argument)', category: 'Write Essay' },
          ],
          tip: 'Keep summaries under 75 words and use simple connectors.',
        },
        {
          name: 'Listening',
          icon: '🎧',
          tasks: [
            { label: 'Multiple Choice, Single Answer – Listening (Questions 1–2)', category: 'Multiple Choice, Single Answer' },
            { label: 'Fill in the Blanks – Listening (Question 1)', category: 'Fill in the Blanks' },
          ],
          tip: 'Listen for keywords and numbers; ignore filler words.',
        },
      ],
      keySkills: ['PTE exam format & timing', 'Basic sentence structure', 'Core vocabulary (~500 words)', 'Active listening at normal pace'],
      tips: [
        'Attempt every question type at least once to get familiar.',
        'Aim for a score of 30 by practising at least 2 tasks per day.',
        'Use the "Practice Now" feature to start with easier questions.',
      ],
    },
    yellow: {
      color: '#fbbf24',
      gradient: 'from-yellow-500 to-amber-400',
      scoreRange: '30 → 50',
      emoji: '🟡',
      sections: [
        {
          name: 'Speaking',
          icon: '🎙️',
          tasks: [
            { label: 'Describe Image (Questions 1–2)', category: 'Describe Image' },
            { label: 'Answer Short Question (Question 1)', category: 'Answer Short Question' },
            { label: 'Repeat Sentence (Questions 4–5)', category: 'Repeat Sentence' },
          ],
          tip: 'Use a structured template: Describe → Highlight → Conclude.',
        },
        {
          name: 'Reading',
          icon: '📖',
          tasks: [
            { label: 'Re-order Paragraphs (Questions 1–2)', category: 'Re-order Paragraphs' },
            { label: 'Multiple Choice, Multiple Answer (Questions 1–2)', category: 'Multiple Choice, Multiple Answer' },
            { label: 'Reading & Writing: Fill in the Blanks (Questions 1–2)', category: 'Reading & Writing: Fill in the Blanks' },
          ],
          tip: 'Look for cohesive devices (however, therefore) to order paragraphs.',
        },
        {
          name: 'Writing',
          icon: '✍️',
          tasks: [
            { label: 'Summarize Written Text (Questions 2–3)', category: 'Summarize Written Text' },
            { label: 'Write Essay (Question 2 — discuss both views)', category: 'Write Essay' },
          ],
          tip: 'Aim for an essay with 3 clear paragraphs: intro, body, conclusion.',
        },
        {
          name: 'Listening',
          icon: '🎧',
          tasks: [
            { label: 'Summarize Spoken Text (Question 1)', category: 'Summarize Spoken Text' },
            { label: 'Multiple Choice, Multiple Answer – Listening (Question 1)', category: 'Multiple Choice, Multiple Answer' },
            { label: 'Fill in the Blanks – Listening (Questions 2–3)', category: 'Fill in the Blanks' },
          ],
          tip: 'Take shorthand notes on key points while listening.',
        },
      ],
      keySkills: ['Descriptive speaking with templates', 'Essay structure (intro–body–conclusion)', 'Paragraph cohesion & connectors', 'Note-taking while listening'],
      tips: [
        'Learn and practise 3 speaking templates (describe image, short answer).',
        'Expand vocabulary to ~1,000 words — focus on academic word lists.',
        'Write one essay every two days and self-review using PTE criteria.',
      ],
    },
    green: {
      color: '#22c55e',
      gradient: 'from-green-500 to-emerald-400',
      scoreRange: '50 → 65',
      emoji: '🟢',
      sections: [
        {
          name: 'Speaking',
          icon: '🎙️',
          tasks: [
            { label: 'Retell Lecture (Question 1)', category: 'Retell Lecture' },
            { label: 'Respond to a Situation (Question 1)', category: 'Respond to a Situation' },
            { label: 'Read Aloud — all 5 questions with fluency target', category: 'Read Aloud' },
          ],
          tip: 'Practice retelling with a 40-second spoken summary after each listen.',
        },
        {
          name: 'Reading',
          icon: '📖',
          tasks: [
            { label: 'Reading & Writing: Fill in the Blanks (Questions 3–4)', category: 'Reading & Writing: Fill in the Blanks' },
            { label: 'Multiple Choice, Single Answer (Questions 4–6)', category: 'Multiple Choice, Single Answer' },
            { label: 'Re-order Paragraphs (Questions 3–4)', category: 'Re-order Paragraphs' },
          ],
          tip: 'Eliminate wrong options first in Multiple Choice tasks.',
        },
        {
          name: 'Writing',
          icon: '✍️',
          tasks: [
            { label: 'Write Essay (Questions 3–4 — agree/disagree, solution essays)', category: 'Write Essay' },
            { label: 'Summarize Written Text — all 3 with accuracy focus', category: 'Summarize Written Text' },
          ],
          tip: 'Check for grammar, spelling and word count (200–300 words for essays).',
        },
        {
          name: 'Listening',
          icon: '🎧',
          tasks: [
            { label: 'Summarize Spoken Text (Question 2)', category: 'Summarize Spoken Text' },
            { label: 'Highlight Correct Summary (Question 1)', category: 'Highlight Correct Summary' },
            { label: 'Multiple Choice, Multiple Answer – Listening (Questions 2–3)', category: 'Multiple Choice, Multiple Answer' },
          ],
          tip: "Aim to identify the speaker's main argument within 10 seconds.",
        },
      ],
      keySkills: ['Consistent accuracy across all 4 sections', 'Academic vocabulary (~2,000 words)', 'Advanced grammar (conditionals, passive voice)', 'Speed-reading for reading tasks'],
      tips: [
        'Review all your incorrect answers to identify weak patterns.',
        'Time yourself on every task — speed is as important as accuracy.',
        'Focus on your weakest section and practise it daily for a week.',
      ],
    },
    blue: {
      color: '#3b82f6',
      gradient: 'from-blue-500 to-indigo-400',
      scoreRange: '65 → 79',
      emoji: '🔵',
      sections: [
        {
          name: 'Speaking',
          icon: '🎙️',
          tasks: [
            { label: 'Summarize Group Discussion (Question 1)', category: 'Summarize Group Discussion' },
            { label: 'Respond to a Situation — all tasks at 80%+ accuracy', category: 'Respond to a Situation' },
            { label: 'Describe Image — both questions with advanced vocabulary', category: 'Describe Image' },
          ],
          tip: 'Vary sentence complexity and use a wide range of vocabulary.',
        },
        {
          name: 'Reading',
          icon: '📖',
          tasks: [
            { label: 'Reading & Writing: Fill in the Blanks — all 4 questions', category: 'Reading & Writing: Fill in the Blanks' },
            { label: 'Multiple Choice, Multiple Answer (Questions 3–4)', category: 'Multiple Choice, Multiple Answer' },
            { label: 'All Re-order Paragraphs tasks', category: 'Re-order Paragraphs' },
          ],
          tip: 'Master collocations and fixed phrases for fill-in-the-blanks.',
        },
        {
          name: 'Writing',
          icon: '✍️',
          tasks: [
            { label: 'Write Essay — both essays with advanced cohesion score', category: 'Write Essay' },
            { label: 'Summarize Written Text — all 3 under 70 words with complex sentences', category: 'Summarize Written Text' },
          ],
          tip: 'Use a variety of sentence starters and linking adverbs.',
        },
        {
          name: 'Listening',
          icon: '🎧',
          tasks: [
            { label: 'Write from Dictation (Question 1)', category: 'Write from Dictation' },
            { label: 'Highlight Correct Summary (Question 2)', category: 'Highlight Correct Summary' },
            { label: 'Multiple Choice, Single Answer – Listening (all questions)', category: 'Multiple Choice, Single Answer' },
          ],
          tip: 'Write from Dictation is high-scoring — practise every day.',
        },
      ],
      keySkills: ['High-level vocabulary & collocations', 'Advanced discourse markers', 'Complex sentence construction', 'Exam strategy & time management'],
      tips: [
        'Practice Write from Dictation daily — each correct word earns points.',
        'Use AI feedback (the Analyze button) to refine your speaking and writing.',
        'Simulate full timed sections twice a week to build exam stamina.',
      ],
    },
    black: {
      color: '#1e293b',
      gradient: 'from-slate-800 to-slate-700',
      scoreRange: '79 → 90',
      emoji: '🏆',
      sections: [
        {
          name: 'Speaking',
          icon: '🎙️',
          tasks: [
            { label: 'All speaking tasks at 85%+ accuracy', category: 'Read Aloud' },
            { label: 'Summarize Group Discussion — fluency & content score', category: 'Summarize Group Discussion' },
            { label: 'Retell Lecture — all key points captured', category: 'Retell Lecture' },
          ],
          tip: 'Perfect your oral fluency by eliminating all hesitations and fillers.',
        },
        {
          name: 'Reading',
          icon: '📖',
          tasks: [
            { label: 'All reading tasks with < 2 errors each', category: 'Reading & Writing: Fill in the Blanks' },
            { label: 'Re-order Paragraphs — all questions correct', category: 'Re-order Paragraphs' },
            { label: 'Reading: Fill in the Blanks — all with zero errors', category: 'Reading: Fill in the Blanks' },
          ],
          tip: 'Develop a systematic elimination strategy for every question type.',
        },
        {
          name: 'Writing',
          icon: '✍️',
          tasks: [
            { label: 'Write Essay — both essays scoring 8/9 on all criteria', category: 'Write Essay' },
            { label: 'Summarize Written Text — single accurate sentence, all 3 tasks', category: 'Summarize Written Text' },
          ],
          tip: 'Aim for a Band 8 essay structure with sophisticated vocabulary.',
        },
        {
          name: 'Listening',
          icon: '🎧',
          tasks: [
            { label: 'Write from Dictation — perfect or near-perfect transcription', category: 'Write from Dictation' },
            { label: 'All listening tasks at 90%+ accuracy', category: 'Summarize Spoken Text' },
            { label: 'Fill in the Blanks & Highlight Correct Summary — mastered', category: 'Fill in the Blanks' },
          ],
          tip: 'Transcription accuracy is critical — practise with diverse accents.',
        },
      ],
      keySkills: ['Near-native fluency & accuracy', 'Mastery of all PTE task types', 'Strategic exam performance under pressure', 'Consistent 85%+ score across all sections'],
      tips: [
        'Take a full mock test every week and review every single answer.',
        'Focus on eliminating careless errors — review your top mistake patterns.',
        'You are exam-ready! Book your PTE exam and go achieve your target score.',
      ],
    },
  };

  // Minimum unique tasks required to unlock each belt.
  // A belt is earned only when BOTH the score threshold AND the minimum number
  // of unique task types (from that belt's own section list) have been met,
  // ensuring the learner has practised across all sections before progressing.
  const beltMinTasks = Object.fromEntries(
    Object.entries(BELT_DETAILS).map(([id, beltDetails]) => [id, beltDetails.sections.reduce((sum, section) => sum + section.tasks.length, 0)])
  );

  // Count how many unique task IDs the user has scored that belong to the
  // categories listed in a specific belt's sections.  This is belt-specific
  // so that tasks done for other belts do not count towards this threshold.
  const getBeltTasksAttempted = (beltId: string): number => {
    const beltDetail = BELT_DETAILS[beltId];
    if (!beltDetail) return 0;
    const beltCategories = new Set(beltDetail.sections.flatMap(section => section.tasks.map(task => task.category)));
    const scores = user?.taskScores || {};
    return allTasks.filter(task => beltCategories.has(task.category) && Array.isArray(scores[task.id]) && scores[task.id].length > 0).length;
  };

  const milestones = [
    { id: 'white', title: 'White Belt', targetScore: 30, description: 'Master the basics of PTE structure.', isUnlocked: true },
    { id: 'yellow', title: 'Yellow Belt', targetScore: 50, description: 'Build fluency and basic vocabulary.', isUnlocked: currentScore >= 30 && getBeltTasksAttempted('yellow') >= beltMinTasks.yellow },
    { id: 'green', title: 'Green Belt', targetScore: 65, description: 'Achieve consistent accuracy in all sections.', isUnlocked: currentScore >= 50 && getBeltTasksAttempted('green') >= beltMinTasks.green },
    { id: 'blue', title: 'Blue Belt', targetScore: 79, description: 'Advanced techniques and high-level vocabulary.', isUnlocked: currentScore >= 65 && getBeltTasksAttempted('blue') >= beltMinTasks.blue },
    { id: 'black', title: 'Black Belt', targetScore: 90, description: 'PTE Mastery. Ready for the exam.', isUnlocked: currentScore >= 79 && getBeltTasksAttempted('black') >= beltMinTasks.black },
  ];

  const currentMilestone = milestones.find(m => !m.isUnlocked) || milestones[milestones.length - 1];

  // Returns the best unattempted (or least-recently-attempted) task for a given category.
  const resolveTaskForCategory = (category: string): PTETask | null => {
    const tasksInCategory = allTasks.filter(t => t.category === category);
    if (tasksInCategory.length === 0) return null;
    const completedIds = new Set(user?.completedTasks || []);
    const unattempted = tasksInCategory.filter(t => !completedIds.has(t.id));
    // Prefer unattempted; fall back to first in category
    return unattempted.length > 0 ? unattempted[0] : tasksInCategory[0];
  };

  const handleAddSchedule = async () => {
    if (!user?.uid || !newSchedule.category) return;
    const resolvedTask = resolveTaskForCategory(newSchedule.category);
    if (!resolvedTask) return;

    const scheduleItem: ScheduledTask = {
      id: Math.random().toString(36).substr(2, 9),
      taskId: resolvedTask.id,
      category: newSchedule.category,
      section: resolvedTask.section,
      scheduledAt: getLocalDateStr() + 'T' + newSchedule.time + ':00.000Z',
      duration: newSchedule.duration,
      isCompleted: false,
      reminderSet: true
    };

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        schedule: [...(user.schedule || []), scheduleItem]
      });
      setNewSchedule({ category: '', time: DEFAULT_SCHEDULE_TIME, duration: DEFAULT_SCHEDULE_DURATION });
      setShowAddSchedule(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        schedule: user.schedule.filter((s: ScheduledTask) => s.id !== id)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleClearSchedule = async () => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        schedule: []
      });
      toast.success('Schedule cleared');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleAddGoal = async () => {
    if (!user?.uid) return;
    const goalItem: DailyGoal = {
      id: Math.random().toString(36).substr(2, 9),
      type: newGoal.type,
      target: newGoal.target,
      current: 0,
      date: getLocalDateStr()
    };

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        goals: [...(user.goals || []), goalItem]
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        goals: user.goals.filter((g: DailyGoal) => g.id !== id)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const getTodayCompletions = () => {
    const today = getLocalDateStr();
    return (user.completedTasksDetailed || []).filter((c: TaskCompletion) => c.completedAt.startsWith(today));
  };

  const calculateGoalProgress = (goal: DailyGoal) => {
    const completions = getTodayCompletions();
    if (goal.type === 'tasks') {
      return completions.length;
    } else if (goal.type === 'time') {
      // Estimate 5 mins per task if not specified
      return completions.length * 5;
    }
    return 0;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-app-surface rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="p-3 rounded-2xl bg-app-primary/10 shrink-0">
            <Map className="text-app-primary" size={28} />
          </div>
          <h2 className="text-2xl font-black text-app-text uppercase tracking-tight sm:hidden">Roadmap</h2>
        </div>
        <div className="flex-1 hidden sm:block">
          <h2 className="text-2xl font-black text-app-text uppercase tracking-tight">Your Roadmap</h2>
        </div>
        <div className="flex bg-app-surface p-1 rounded-xl border border-app-border w-full sm:w-auto overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveView('roadmap')}
            className={cn(
              "flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
              activeView === 'roadmap' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text"
            )}
          >
            Path
          </button>
          <button 
            onClick={() => setActiveView('schedule')}
            className={cn(
              "flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
              activeView === 'schedule' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text"
            )}
          >
            Schedule
          </button>
          <button 
            onClick={() => setActiveView('goals')}
            className={cn(
              "flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
              activeView === 'goals' ? "bg-app-primary text-app-bg" : "text-app-text-muted hover:text-app-text"
            )}
          >
            Goals
          </button>
        </div>
      </div>

      {activeView === 'roadmap' && (
        <div className="space-y-8 relative">
          {/* Connecting Line */}
          <div className="absolute left-8 top-10 bottom-10 w-0.5 bg-gradient-to-b from-app-primary via-app-primary/20 to-transparent" />
          
          {milestones.map((milestone, index) => (
            <motion.div 
              key={milestone.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "relative pl-14 md:pl-20 group",
                !milestone.isUnlocked && "opacity-50"
              )}
            >
              <div className={cn(
                "absolute left-4 top-0 w-8 h-8 rounded-full border-4 border-app-bg z-10 flex items-center justify-center transition-all duration-500",
                milestone.isUnlocked ? "bg-app-primary shadow-[0_0_15px_rgba(69,162,158,0.5)]" : "bg-app-surface"
              )}>
                {milestone.isUnlocked ? <Check size={14} className="text-app-bg" /> : <Lock size={12} className="text-app-text-muted" />}
              </div>
              
              <div className={cn(
                "bg-gradient-to-br from-app-surface to-app-bg p-6 rounded-3xl border transition-all duration-300",
                milestone.isUnlocked ? "border-app-primary/30 hover:border-app-primary hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]" : "border-app-border"
              )}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-app-text">{milestone.title}</h3>
                    <p className="text-xs text-app-primary font-bold uppercase tracking-widest">Target: {milestone.targetScore}</p>
                  </div>
                  {milestone.isUnlocked && milestone.id === currentMilestone.id && (
                    <span className="px-3 py-1 bg-app-primary/10 text-app-primary rounded-full text-[10px] font-bold uppercase tracking-widest animate-pulse">
                      Current Level
                    </span>
                  )}
                </div>
                <p className="text-sm text-app-text-muted leading-relaxed">{milestone.description}</p>
                
                {milestone.isUnlocked && (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => onStartTask(allTasks[0])}
                      className="py-2 bg-app-bg text-app-text rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-app-primary hover:text-app-bg transition-all"
                    >
                      Practice Now
                    </button>
                    <button
                      onClick={() => setSelectedMilestoneId(milestone.id)}
                      className="py-2 border border-app-border text-app-text-muted rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-app-primary/10 hover:border-app-primary hover:text-app-primary transition-all"
                    >
                      View Details
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Belt Details Modal */}
      <AnimatePresence>
        {selectedMilestoneId && (() => {
          const details = BELT_DETAILS[selectedMilestoneId];
          const milestone = milestones.find(m => m.id === selectedMilestoneId);
          if (!details || !milestone) return null;
          const completedTasks = user?.completedTasks || [];
          const completedCategories = new Set(
            allTasks.filter(t => completedTasks.includes(t.id)).map(t => t.category)
          );
          const totalSectionTasks = details.sections.reduce((acc, s) => acc + s.tasks.length, 0);
          const firstTask = allTasks.length > 0 ? allTasks[0] : null;

          return (
            <motion.div
              key="belt-modal-wrapper"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden"
            >
              {/* Backdrop */}
              <div
                onClick={() => setSelectedMilestoneId(null)}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              />

              {/* Modal Panel */}
              <motion.div
                key="modal"
                initial={{ opacity: 0, scale: 0.95, y: 25 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                className="relative z-10 w-full max-w-2xl max-h-[85vh] sm:max-h-[88vh] bg-app-bg rounded-2xl sm:rounded-3xl border border-app-border shadow-2xl overflow-hidden flex flex-col"
              >
                {/* Header gradient banner */}
                <div className={cn("relative p-5 sm:p-7 bg-gradient-to-br", details.gradient, "shrink-0")}>
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_white_0%,_transparent_60%)]" />
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">{details.emoji}</span>
                        <div>
                          <h2 className="text-2xl font-black text-white tracking-tight">{milestone.title}</h2>
                          <p className="text-white/70 text-xs font-bold uppercase tracking-widest">Score Target: {details.scoreRange}</p>
                        </div>
                      </div>
                      <p className="text-white/80 text-sm leading-relaxed max-w-sm">{milestone.description}</p>
                    </div>
                    <button
                      onClick={() => setSelectedMilestoneId(null)}
                      className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white shrink-0 ml-4"
                      aria-label="Close modal"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-5 relative z-10">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-white/70 text-[11px] font-bold uppercase tracking-widest">Your Progress</span>
                      <span className="text-white text-[11px] font-black">{currentScore} / {milestone.targetScore}</span>
                    </div>
                    <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (currentScore / milestone.targetScore) * 100)}%` }}
                        transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
                        className="h-full bg-white rounded-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 min-h-0 p-5 sm:p-7 space-y-6 overscroll-contain">
                  {/* Key Skills */}
                  <div>
                    <h3 className="text-[11px] font-black text-app-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Star size={12} /> Key Skills to Develop
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {details.keySkills.map((skill, i) => (
                        <div key={i} className="flex items-start gap-2 bg-app-surface rounded-xl p-3 border border-app-border">
                          <CheckCircle size={14} className="text-app-primary shrink-0 mt-0.5" />
                          <span className="text-sm text-app-text leading-snug">{skill}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tasks by section */}
                  <div>
                    <h3 className="text-[11px] font-black text-app-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Target size={12} /> Tasks to Complete ({totalSectionTasks} total)
                    </h3>
                    <div className="space-y-3">
                      {details.sections.map((sec, si) => (
                        <div key={si} className="bg-app-surface rounded-2xl border border-app-border overflow-hidden">
                          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-app-border bg-app-bg/50">
                            <span className="text-base">{sec.icon}</span>
                            <span className="font-bold text-sm text-app-text">{sec.name}</span>
                          </div>
                          <div className="p-4 space-y-2">
                            {sec.tasks.map((task, ti) => {
                              const isDone = completedCategories.has(task.category);
                              return (
                                <div key={ti} className={cn(
                                  "flex items-start gap-2.5 rounded-xl p-2.5 transition-colors",
                                  isDone ? "bg-app-primary/10" : "bg-transparent"
                                )}>
                                  <div className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                                    isDone ? "bg-app-primary border-app-primary" : "border-app-border"
                                  )}>
                                    {isDone && <Check size={10} className="text-app-bg" />}
                                  </div>
                                  <span className={cn(
                                    "text-sm leading-snug",
                                    isDone ? "text-app-text line-through opacity-60" : "text-app-text"
                                  )}>{task.label}</span>
                                </div>
                              );
                            })}
                            <div className="mt-3 pt-3 border-t border-app-border flex items-start gap-2">
                              <Info size={13} className="text-app-primary shrink-0 mt-0.5" />
                              <p className="text-xs text-app-text-muted italic leading-relaxed">{sec.tip}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pro tips */}
                  <div>
                    <h3 className="text-[11px] font-black text-app-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Zap size={12} /> Pro Tips
                    </h3>
                    <div className="space-y-2">
                      {details.tips.map((tip, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-app-primary/5 border border-app-primary/20 rounded-xl">
                          <span className="text-app-primary font-black text-sm shrink-0">{i + 1}.</span>
                          <p className="text-sm text-app-text leading-relaxed">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer CTA */}
                <div className="shrink-0 p-4 sm:p-5 border-t border-app-border bg-app-surface/95 backdrop-blur-md flex items-center gap-3 z-10 shadow-lg">
                  {firstTask && (
                    <button
                      onClick={() => { setSelectedMilestoneId(null); onStartTask(firstTask); }}
                      className="flex-1 py-3.5 bg-app-primary text-white rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider hover:bg-app-accent hover:text-slate-900 transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2"
                    >
                      <Zap size={15} className="fill-current" />
                      Practice Now
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedMilestoneId(null)}
                    className="px-6 py-3.5 border border-app-border bg-app-bg text-app-text font-bold rounded-xl text-xs sm:text-sm uppercase tracking-wider hover:bg-app-surface transition-all active:scale-[0.99]"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {activeView === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-app-surface p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] border border-app-primary/10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-xl font-bold text-app-text">Study Schedule</h3>
                <p className="text-sm text-app-text-muted">Align your study time with specific tasks.</p>
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto">
                {user.schedule && user.schedule.length > 0 && (
                  <button 
                    onClick={handleClearSchedule}
                    className="p-3 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all border border-red-500/20"
                    title="Clear All Tasks"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
                <button 
                  onClick={() => setShowAddSchedule(!showAddSchedule)}
                  className="p-3 bg-app-primary text-app-bg rounded-2xl hover:bg-app-accent transition-all shadow-lg"
                >
                  <Plus size={24} className={cn("transition-transform", showAddSchedule && "rotate-45")} />
                </button>
              </div>
            </div>

            {showAddSchedule && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-6 bg-app-bg rounded-3xl border border-app-primary/30 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Show unique task categories only, not individual questions */}
                  <select 
                    value={newSchedule.category}
                    onChange={(e) => setNewSchedule({ ...newSchedule, category: e.target.value })}
                    className="bg-app-surface text-app-text border border-app-border rounded-xl p-3 outline-none focus:border-app-primary"
                  >
                    <option value="">Select Task Type</option>
                    {(() => {
                      const seen = new Set<string>();
                      return allTasks.filter(t => {
                        if (seen.has(t.category)) return false;
                        seen.add(t.category);
                        return true;
                      });
                    })().map(t => (
                      <option key={t.category} value={t.category}>
                        {t.section.charAt(0).toUpperCase() + t.section.slice(1)} — {t.category}
                      </option>
                    ))}
                  </select>
                  <input 
                    type="time"
                    value={newSchedule.time}
                    onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
                    className="bg-app-surface text-app-text border border-app-border rounded-xl p-3 outline-none focus:border-app-primary"
                  />
                  <input 
                    type="number"
                    placeholder="Duration (min)"
                    value={newSchedule.duration}
                    onChange={(e) => setNewSchedule({ ...newSchedule, duration: parseInt(e.target.value) || 0 })}
                    className="bg-app-surface text-app-text border border-app-border rounded-xl p-3 outline-none focus:border-app-primary"
                  />
                </div>
                <button 
                  onClick={async () => {
                    try {
                      await handleAddSchedule();
                    } catch (e) {
                      console.error("Failed to add schedule:", e);
                    }
                  }}
                  className="w-full py-3 bg-app-primary text-app-bg rounded-xl font-bold uppercase tracking-widest hover:bg-app-accent transition-all"
                >
                  Add to Schedule
                </button>
              </motion.div>
            )}

            <div className="space-y-4">
              {(!user.schedule || user.schedule.length === 0) ? (
                <div className="text-center py-12 bg-app-bg rounded-3xl border border-dashed border-app-border">
                  <Calendar className="mx-auto text-app-text-muted/20 mb-4" size={48} />
                  <p className="text-app-text-muted">No tasks scheduled yet.</p>
                </div>
              ) : (
                user.schedule.sort((a: ScheduledTask, b: ScheduledTask) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).map((item: ScheduledTask) => {
                  // Support both new (category field) and legacy (taskId = specific task ID) schedule items
                  const displayCategory = item.category || allTasks.find(t => t.id === item.taskId)?.category || 'Unknown Task';
                  const displaySection = item.section || allTasks.find(t => t.id === item.taskId)?.section || 'N/A';
                  const scheduledDate = new Date(item.scheduledAt);
                  const isToday = scheduledDate.toDateString() === new Date().toDateString();
                  const timeStr = scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const dateStr = scheduledDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

                  return (
                    <div key={item.id} className={cn(
                      "flex items-center gap-3 md:gap-6 p-4 rounded-2xl border group transition-all",
                      item.isCompleted
                        ? "bg-app-primary/5 border-app-primary/20 opacity-60"
                        : "bg-app-bg border-app-border hover:border-app-primary/30"
                    )}>
                      <div className="text-center min-w-[70px] md:min-w-[80px]">
                        <p className="text-sm font-bold text-app-text">{timeStr}</p>
                        {!isToday && <p className="text-[10px] text-app-text-muted/50 font-bold uppercase">{dateStr}</p>}
                        <p className="text-[10px] text-app-primary font-bold uppercase">{item.duration}m</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={cn("font-bold text-app-text", item.isCompleted && "line-through")}>{displayCategory}</h4>
                          {item.isCompleted ? (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-app-primary/10 text-app-primary rounded text-[8px] font-black uppercase tracking-widest">
                              <Check size={8} />
                              Done
                            </div>
                          ) : item.reminderSet && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-500/10 text-orange-500 rounded text-[8px] font-black uppercase tracking-widest">
                              <Bell size={8} fill="currentColor" />
                              Alert
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-app-text-muted uppercase tracking-widest">{displaySection}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!item.isCompleted && (
                          <button 
                            onClick={() => {
                              // Re-resolve best unattempted task at play time
                              const taskToStart = resolveTaskForCategory(displayCategory)
                                || allTasks.find(t => t.id === item.taskId);
                              if (taskToStart) {
                                onStartTask(taskToStart);
                              } else {
                                toast.error('No task found for this category.');
                              }
                            }}
                            className="p-2 text-app-primary hover:bg-app-primary/10 rounded-lg transition-all"
                          >
                            <Play size={18} />
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            try {
                              await handleDeleteSchedule(item.id);
                            } catch (e) {
                              console.error("Failed to delete schedule:", e);
                            }
                          }}
                          className="p-2 text-app-text-muted hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-app-primary/5 p-6 rounded-3xl border border-app-primary/20 flex items-center gap-4">
            <div className="w-12 h-12 bg-app-primary/10 rounded-2xl flex items-center justify-center">
              <Bell className="text-app-primary" size={24} />
            </div>
            <div>
              <h4 className="font-bold text-app-text">Enable Notifications</h4>
              <p className="text-xs text-app-text-muted">Get reminded before your scheduled study sessions.</p>
            </div>
            <button 
              onClick={onRequestPermission}
              disabled={notificationPermission === 'granted'}
              className={cn(
                "ml-auto px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                notificationPermission === 'granted' 
                  ? "bg-green-500/20 text-green-500 cursor-default" 
                  : "bg-app-primary text-app-bg hover:bg-app-accent"
              )}
            >
              {notificationPermission === 'granted' ? 'Enabled' : 'Enable'}
            </button>
          </div>
        </div>
      )}

      {activeView === 'goals' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-app-surface p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] border border-app-primary/10">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="text-app-primary" size={24} />
                <h3 className="text-xl font-bold text-app-text">Daily Goals</h3>
              </div>
              
              <div className="space-y-6">
                {(!user.goals || user.goals.length === 0) ? (
                  <div className="text-center py-8">
                    <p className="text-app-text-muted text-sm">No goals set for today.</p>
                  </div>
                ) : (
                  user.goals.map((goal: DailyGoal) => (
                    <div key={goal.id} className="relative group">
                      <GoalItem 
                        label={goal.type === 'tasks' ? 'Tasks Completed' : 'Study Time (min)'} 
                        current={calculateGoalProgress(goal)} 
                        target={goal.target} 
                      />
                      <button 
                        onClick={async () => {
                          try {
                            await handleDeleteGoal(goal.id);
                          } catch (e) {
                            console.error("Failed to delete goal:", e);
                          }
                        }}
                        className="absolute -right-2 -top-2 p-1 bg-red-500/20 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-app-bg p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] border border-app-primary/10 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-app-text mb-2">Set New Goal</h3>
                <p className="text-sm text-app-text-muted mb-6">Challenge yourself to improve faster.</p>
                
                <div className="space-y-4">
                  <select 
                    value={newGoal.type}
                    onChange={(e) => setNewGoal({ ...newGoal, type: e.target.value as 'tasks' | 'time' })}
                    className="w-full bg-app-surface text-app-text border border-app-border rounded-xl p-3 outline-none focus:border-app-primary"
                  >
                    <option value="tasks">Tasks per day</option>
                    <option value="time">Minutes per day</option>
                  </select>
                  <input 
                    type="number" 
                    placeholder="Enter target value"
                    value={newGoal.target}
                    onChange={(e) => setNewGoal({ ...newGoal, target: parseInt(e.target.value) || 0 })}
                    className="w-full bg-app-surface text-app-text border border-app-border rounded-xl p-3 outline-none focus:border-app-primary"
                  />
                </div>
              </div>
              <button 
                onClick={async () => {
                  try {
                    await handleAddGoal();
                  } catch (e) {
                    console.error("Failed to add goal:", e);
                  }
                }}
                className="mt-8 w-full py-4 bg-app-primary text-app-bg rounded-2xl font-bold uppercase tracking-widest hover:bg-app-accent transition-all"
              >
                Add Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function GoalItem({ label, current, target }: { label: string, current: number, target: number }) {
  const percent = Math.min(100, (current / target) * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold text-app-text-muted uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-app-text">{current} / {target}</span>
      </div>
      <div className="h-2 bg-app-bg rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          className="h-full bg-gradient-to-r from-app-primary to-app-accent"
        />
      </div>
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<PTESection | 'dashboard' | 'profile' | 'roadmap' | 'vocabulary' | 'shuriken' | 'help' | 'pattern' | 'mock-tests' | 'faq' | 'privacy' | 'terms'>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [supportBotOpen, setSupportBotOpen] = useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const userToggled = localStorage.getItem('user_manual_theme_toggle');
      if (userToggled === 'true') {
        const saved = localStorage.getItem('isDarkMode');
        if (saved !== null) {
          return JSON.parse(saved);
        }
      }
      const hour = new Date().getHours();
      // Default: Light Mode during Day (6 AM to 6 PM), Dark Mode during Night (6 PM to 6 AM)
      return hour < 6 || hour >= 18;
    }
    return false;
  });

  const handleToggleDarkMode = (value?: boolean) => {
    localStorage.setItem('user_manual_theme_toggle', 'true');
    setIsDarkMode((prev) => (typeof value === 'boolean' ? value : !prev));
  };
  
  useEffect(() => {
    localStorage.setItem('isDarkMode', JSON.stringify(isDarkMode));
    if (!isDarkMode) {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [isDarkMode]);
  const [progress, setProgress] = useState<UserProgress>(INITIAL_PROGRESS);
  const [tasks, setTasks] = useState<PTETask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [selectedTask, setSelectedTask] = useState<PTETask | null>(null);
  const [activeMockTest, setActiveMockTest] = useState<MockTest | null>(null);
  // When resuming a test, this holds the saved session to restore from.
  const [resumeSession, setResumeSession] = useState<MockTestSavedSession | null>(null);
  const [currentCategoryTasks, setCurrentCategoryTasks] = useState<PTETask[]>([]);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [isSyncingPortal, setIsSyncingPortal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const sentNotifications = useRef<Set<string>>(new Set());
  const [upgradeReason, setUpgradeReason] = useState<'expired' | 'limit' | null>(null);
  const { user, loading, login, continueAsGuest, logout, showSubscriptionModal, setShowSubscriptionModal, showAuthModal, isAccessRestricted, authError, setAuthError, formatPrice, currency, pendingGuestWriteRef, isEmailVerified, resendEmailVerification, checkEmailVerification } = useSubscription();

  // Remaining days in the current trial / guest period (recalculated whenever user changes)
  const trialRemainingDays = React.useMemo(() => {
    if (!user) return 0;
    // Compare whole calendar days in the user's local timezone so the count
    // decrements at local midnight, not at the UTC boundary.
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    if (user.subscriptionStatus === 'trial' && user.trialEndsAt) {
      const endsAt = new Date(user.trialEndsAt);
      const endsMidnight = new Date(endsAt.getFullYear(), endsAt.getMonth(), endsAt.getDate());
      return Math.max(0, Math.round((endsMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));
    }

    if (user.subscriptionStatus === 'guest') {
      const createdAt = new Date(user.createdAt);
      // Expiry = local calendar date of creation + 3 days (at local midnight)
      const expiryMidnight = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate() + 3);
      return Math.max(0, Math.round((expiryMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));
    }

    return 0;
  }, [user]);

  // Use bundled tasks directly — avoids reading the entire tasks collection from Firestore
  // on every page load for every user, which was burning through the 50k/day free-tier quota.
  // Admins can still push updated tasks to Firestore via the "Seed Tasks" button when needed.
  useEffect(() => {
    setTasks(PTE_TASKS);
    setIsLoadingTasks(false);

    // Unsubscribe URL query param handler
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const e = params.get('e');
      const t = params.get('t');
      const action = params.get('action');
      if (action === 'unsubscribe' || (e && t)) {
        if (e && t) {
          window.location.href = `/api/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`;
        }
      }
    }
  }, []);

  const handleRequestNotificationPermission = async () => {
    try {
      const granted = await NotificationService.requestPermission();
      if (granted) {
        setNotificationPermission('granted');
      } else {
        setNotificationPermission(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
      }
    } catch (e) {
      console.error("Failed to request notification permission:", e);
      setNotificationPermission('denied');
    }
  };

  useEffect(() => {
    if (user?.targetScore) {
      setProgress(prev => ({ ...prev, targetScore: user.targetScore }));
    }
  }, [user]);

  useEffect(() => {
    if (isAccessRestricted && !loading && !pendingGuestWriteRef.current) {
      setUpgradeReason('expired');
      setShowSubscriptionModal(true);
    }
  }, [isAccessRestricted, loading, setShowSubscriptionModal, pendingGuestWriteRef]);

  // Auto-sync subscription state when returning from the Stripe Customer Portal.
  // handleManageBilling appends ?fromPortal=1 to the return URL so we can detect the return.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('fromPortal')) return;
    // Need at least one Stripe identifier to sync
    if (!user?.stripeSubscriptionId && !user?.stripeCustomerId) return;

    // Remove the param from the URL without triggering a navigation
    params.delete('fromPortal');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState(null, '', newUrl);

    setIsSyncingPortal(true);
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken().catch(() => null);
        const res = await fetch('/api/sync-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
          body: JSON.stringify({
            subscriptionId: user.stripeSubscriptionId || undefined,
            customerId: user.stripeCustomerId || undefined,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const updates: Record<string, unknown> = {
            cancelAtPeriodEnd: data.cancelAtPeriodEnd,
            subscriptionEndsAt: new Date(data.currentPeriodEnd * 1000).toISOString(),
          };
          if (data.status === 'active') {
            updates.subscriptionStatus = 'active';
          } else if (data.status === 'canceled' || data.status === 'unpaid' || data.status === 'past_due') {
            updates.subscriptionStatus = 'inactive';
          }
          // Persist subscriptionId if it wasn't already saved
          if (data.subscriptionId && !user?.stripeSubscriptionId) {
            updates.stripeSubscriptionId = data.subscriptionId;
          }
          await updateDoc(doc(db, 'users', user.uid), updates);
        }
      } catch (err) {
        // Non-critical: Firestore will be updated by the webhook anyway
        console.error("Portal return subscription sync failed:", err);
      } finally {
        setIsSyncingPortal(false);
      }
    })();
  // Only re-run when the user's identity or Stripe IDs change, not on every
  // onSnapshot update to the user document.  Broad [user] dep would re-execute
  // this effect on every real-time Firestore change, adding unnecessary overhead.
  }, [user?.uid, user?.stripeSubscriptionId, user?.stripeCustomerId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (user?.schedule && notificationPermission !== 'unsupported') {
        const now = new Date();
        user.schedule.forEach((item: any) => {
          const scheduledTime = new Date(item.scheduledAt);
          const timeDiff = now.getTime() - scheduledTime.getTime();
          
          // If within 1 minute of scheduled time (up to 1 minute after) and not completed
          // AND we haven't sent a notification for this specific schedule ID yet
          if (!item.isCompleted && timeDiff >= 0 && timeDiff < 60000 && !sentNotifications.current.has(item.id)) {
            NotificationService.send(`Study Time: ${item.category || item.taskId}`, {
              body: `It's time for your scheduled ${item.category || item.taskId} session!`,
              icon: '/favicon.ico'
            });
            sentNotifications.current.add(item.id);
          }
        });
      }
    }, 10000); // Check every 10 seconds for better precision
    return () => clearInterval(interval);
  }, [user?.schedule, notificationPermission]);

  const handleSetTargetScore = async (score: number) => {
    if (user?.uid) {
      try {
        const cappedScore = Math.min(90, Math.max(0, score));
        await updateDoc(doc(db, 'users', user.uid), { targetScore: cappedScore });
        setProgress(prev => ({ ...prev, targetScore: cappedScore }));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    } else {
      const cappedScore = Math.min(90, Math.max(0, score));
      setProgress(prev => ({ ...prev, targetScore: cappedScore }));
    }
  };

  const handleSetTestDate = async (date: string) => {
    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { testDate: date });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const handleSaveToSchedule = async () => {
    if (!user?.uid || !user?.testDate || !progress.targetScore) {
      toast.error('Please set your target score and test date first.');
      return;
    }

    const plan = calculateStudyPlan();
    if (!plan || plan.daysLeft <= 0) {
      toast.error('Invalid study plan. Please check your test date.');
      return;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const testDate = new Date(user.testDate);
      testDate.setHours(0, 0, 0, 0);

      const newScheduledTasks: ScheduledTask[] = [];
      const totalDays = plan.daysLeft;

      // For each day until the test date
      for (let i = 0; i < totalDays; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + i);

        // Pick tasks for this day
        // We'll pick tasks randomly from different sections for variety
        const availableTasks = [...tasks];
        for (let j = 0; j < plan.tasksPerDay; j++) {
          if (availableTasks.length === 0) break;
          
          const randomIndex = Math.floor(Math.random() * availableTasks.length);
          const task = availableTasks.splice(randomIndex, 1)[0];

          // Set a random time during the day (e.g., between 9 AM and 9 PM)
          const scheduledTime = new Date(currentDate);
          scheduledTime.setHours(9 + Math.floor(Math.random() * 12), 0, 0, 0);

          newScheduledTasks.push({
            id: Math.random().toString(36).substr(2, 9),
            taskId: task.id,
            category: task.category,
            section: task.section,
            scheduledAt: scheduledTime.toISOString(),
            duration: 15, // Default duration
            isCompleted: false,
            reminderSet: true
          });
        }
      }

      await updateDoc(doc(db, 'users', user.uid), {
        schedule: newScheduledTasks
      });

      toast.success(`Successfully saved ${newScheduledTasks.length} tasks to your schedule!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleResetTarget = async () => {
    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { targetScore: 0, testDate: null });
        setProgress(prev => ({ ...prev, targetScore: 0 }));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    } else {
      setProgress(prev => ({ ...prev, targetScore: 0 }));
    }
  };

  const handleSelectTask = (task: PTETask, allTasks: PTETask[]) => {
    setSelectedTask(task);
    setCurrentCategoryTasks(allTasks);
    // Kick off TTS generation now so audio is cached and ready by the time the
    // prep-phase countdown finishes.  Also pre-fetch the next task in the list
    // so back-to-back practice feels seamless.
    if (task.hasAudio) {
      preFetchAudio(task);
    }
    const nextTask = allTasks[allTasks.indexOf(task) + 1];
    if (nextTask?.hasAudio) {
      preFetchAudio(nextTask);
    }
  };

  const handleHoverTask = (_task: PTETask) => {
    // Pre-fetching on hover was moved to handleSelectTask to avoid flooding the
    // Gemini quota while the user is still browsing the task list.
  };

  const currentStreak = calculateStreak(user?.activityLog);

  const calculateAverageScore = () => {
    if (!user?.taskScores || Object.keys(user.taskScores).length === 0) return 0;
    
    let totalScore = 0;
    let totalAttempts = 0;
    
    Object.values(user.taskScores).forEach(scores => {
      if (Array.isArray(scores)) {
        scores.forEach(score => {
          totalScore += score;
          totalAttempts++;
        });
      }
    });
    
    return totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0;
  };

  const calculateStudyPlan = () => {
    if (!progress.targetScore || !user?.testDate) return null;
    
    const today = new Date();
    const testDate = new Date(user.testDate);
    const diffTime = testDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return { tasksPerDay: 0, daysLeft: 0 };
    
    // Simple heuristic: higher target score = more tasks
    // Base tasks: 5. Additional tasks based on target score gap.
    const baseTasks = 5;
    const scoreGap = Math.max(0, progress.targetScore - calculateAverageScore());
    const totalRequiredTasks = (scoreGap * 5) + 20; // Rough estimate
    const tasksPerDay = Math.ceil(totalRequiredTasks / diffDays);
    
    return {
      tasksPerDay: Math.max(2, tasksPerDay),
      daysLeft: diffDays
    };
  };

  const calculateSectionAverage = (section: PTESection) => {
    if (!user?.taskScores) return 0;
    
    const sectionTasks = tasks.filter(t => t.section === section).map(t => t.id);
    let totalScore = 0;
    let totalAttempts = 0;
    
    sectionTasks.forEach(taskId => {
      const scores = user.taskScores?.[taskId];
      if (Array.isArray(scores) && scores.length > 0) {
        scores.forEach(score => {
          totalScore += score;
          totalAttempts++;
        });
      }
    });
    
    return totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0;
  };

  const handleTaskFinish = async (taskId: string, score: number, response?: string) => {
    if (!user?.uid) return;
    
    const userRef = doc(db, 'users', user.uid);
    const currentTaskScores = user.taskScores || {};
    const taskScoresForId = currentTaskScores[taskId] || [];
    
    const newTaskScores = {
      ...currentTaskScores,
      [taskId]: [...taskScoresForId, score]
    };

    const smallResponse = response?.length && response.length < 5000 ? response : undefined;
    const newTaskCompletion: TaskCompletion = {
      taskId,
      score,
      completedAt: new Date().toISOString(),
      ...(smallResponse !== undefined && { response: smallResponse }) // Only store small responses in user doc
    };

    // Auto-mark any schedule items for the same category as done.
    // Handles both new items (item.category) and legacy items (item.taskId = specific task ID).
    const completedTask = tasks.find(t => t.id === taskId);
    let updatedSchedule = user.schedule;
    if (completedTask && user.schedule?.length) {
      updatedSchedule = user.schedule.map((item: ScheduledTask) => {
        if (item.isCompleted) return item;
        const itemCategory = item.category || tasks.find((t: PTETask) => t.id === item.taskId)?.category;
        if (itemCategory === completedTask.category) {
          return { ...item, isCompleted: true };
        }
        return item;
      });
    }

    try {
      // Save detailed attempt to a separate collection for large responses
      if (response) {
        await addDoc(collection(db, 'task_attempts'), {
          userId: user.uid,
          taskId,
          score,
          response,
          completedAt: new Date().toISOString()
        });
      }

      await updateDoc(userRef, { 
        taskScores: newTaskScores,
        completedTasks: Array.from(new Set([...(user.completedTasks || []), taskId])),
        completedTasksDetailed: [...(user.completedTasksDetailed || []), newTaskCompletion],
        ...(updatedSchedule !== user.schedule && { schedule: updatedSchedule })
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleMockTestFinish = async (result: MockTestResult) => {
    if (!user?.uid) return;
    
    const userRef = doc(db, 'users', user.uid);
    
    // Create a copy without taskResponses for the user document to save space
    const resultForUserDoc = { ...result };
    delete resultForUserDoc.taskResponses;
    
    const newResults = [...(user.mockTestResults || []), resultForUserDoc];
    
    try {
      // Save full result with responses to a separate collection
      await addDoc(collection(db, 'mock_test_attempts'), {
        userId: user.uid,
        ...result
      });

      await updateDoc(userRef, { mockTestResults: newResults });
      toast.success(`Mock Test Completed! Overall Score: ${result.overallScore}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
    // Do NOT close the session here. The scorecard inside MockTestSession is still
    // visible. The user will dismiss it via the "Back to Dojo" button, which calls
    // onClose() and sets activeMockTest to null.
  };

  const handleSaveMockSession = async (session: MockTestSavedSession | null, testId?: string) => {
    if (!user?.uid) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      if (session !== null) {
        // Save/update this specific test's session in the map
        await updateDoc(userRef, { [`savedMockSessions.${session.testId}`]: session });
      } else if (testId) {
        // Clear only this test's session from the map
        await updateDoc(userRef, { [`savedMockSessions.${testId}`]: deleteField() });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center relative overflow-hidden">
        {/* Background Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-app-primary/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-app-accent/5 blur-[120px] rounded-full animate-pulse delay-700" />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 flex flex-col items-center"
        >
          <motion.div
            animate={{ 
              y: [0, -10, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="mb-8"
          >
            <Logo size={100} />
          </motion.div>
          
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    scale: [1, 1.5, 1],
                    opacity: [0.3, 1, 0.3]
                  }}
                  transition={{ 
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                  className="w-2 h-2 bg-app-primary rounded-full"
                />
              ))}
            </div>
            <span className="text-sm font-bold tracking-widest text-app-primary/60 uppercase">Entering the Dojo</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <LandingPage 
        onLogin={login} 
        onGuest={continueAsGuest} 
        authError={authError} 
        onClearError={() => setAuthError(null)} 
        isDarkMode={isDarkMode}
        setIsDarkMode={handleToggleDarkMode}
      />
    );
  }

  if (user && user.accessType !== 'guest' && !!user.email && !isEmailVerified && !showAuthModal) {
    return (
      <div className="min-h-screen bg-app-bg text-app-text font-sans flex items-center justify-center p-6">
        <div className="bg-app-surface border border-app-primary/20 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center relative overflow-hidden">
          <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-amber-500" />
          </div>
          <h3 className="text-2xl font-black text-app-text mb-2">Verify Your Email Address</h3>
          <p className="text-sm text-app-text-muted mb-6 leading-relaxed">
            We sent a verification link to <span className="font-bold text-app-text">{user.email}</span>. Please click the link in your inbox to activate your account and enter the Dojo.
          </p>
          <div className="space-y-3">
            <button
              onClick={async () => {
                const verified = await checkEmailVerification();
                if (!verified) {
                  alert("Email not verified yet. Please check your inbox and click the verification link.");
                }
              }}
              className="w-full py-3.5 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all shadow-lg text-sm"
            >
              I've Verified My Email
            </button>
            <button
              onClick={async () => {
                try {
                  await resendEmailVerification();
                  alert("Verification email resent! Check your inbox.");
                } catch (e: any) {
                  alert(e.message || "Failed to resend email.");
                }
              }}
              className="w-full py-3 bg-app-surface border border-app-border text-app-text rounded-xl font-bold hover:bg-app-primary/10 transition-all text-xs"
            >
              Resend Verification Link
            </button>
            <button
              onClick={logout}
              className="w-full py-2.5 text-xs text-app-text-muted hover:text-app-text font-semibold transition-colors"
            >
              Sign Out / Try Another Email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans selection:bg-app-primary/30 transition-colors duration-300">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-app-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-app-accent/5 blur-[120px] rounded-full" />
      </div>

      <CookieBanner />
      <div className="relative z-10 flex flex-col h-dvh">
        {/* Diwali Festive Announcement Banner - hidden for annual users, visible for trial, guest, expired, and weekly/monthly/quarterly users */}
        {!(user?.subscriptionStatus === 'active' && ((user?.planId || (user as any)?.plan || (user as any)?.subscriptionPlan || '').toLowerCase().trim() === 'annual')) && (
          <DiwaliBanner onClaim={() => setShowSubscriptionModal(true)} />
        )}
        {/* Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-app-border bg-app-bg/80 backdrop-blur-md">
          <Logo showText={true} size={40} className="shadow-[0_0_20px_rgba(69,162,158,0.3)]" />
          
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => handleToggleDarkMode()}
              className="p-2 hover:bg-app-surface rounded-full transition-colors text-app-text-muted hover:text-app-primary"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <button 
              onClick={() => setShowStreakModal(true)}
              className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-app-surface rounded-full border border-app-primary/20 hover:border-app-primary/50 transition-all"
            >
              <Flame className="text-orange-500" size={16} />
              <span className="text-xs md:text-sm font-bold text-app-text">{currentStreak}<span className="hidden sm:inline"> DAY STREAK</span></span>
            </button>

            {user && (
              <div className="hidden sm:flex items-center gap-2">
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest",
                  user.subscriptionStatus === 'active' ? "text-green-500 bg-green-500/10 border-green-500/20" :
                  user.subscriptionStatus === 'trial' ? "text-blue-500 bg-blue-500/10 border-blue-500/20" :
                  "text-orange-500 bg-orange-500/10 border-orange-500/20"
                )}>
                  <Shield size={12} className="fill-current" />
                  {user.subscriptionStatus === 'active' ? 'Premium' : 
                   user.subscriptionStatus === 'trial' ? 'Trial' : 'Guest'}
                </div>
                {(user.subscriptionStatus === 'trial' || user.subscriptionStatus === 'guest') && (
                  <>
                    <span className="text-[10px] text-app-text-muted/70 font-medium">
                      {trialRemainingDays} day{trialRemainingDays !== 1 ? 's' : ''} remaining
                    </span>
                    <button
                      onClick={() => setShowSubscriptionModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-app-primary text-app-bg text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-app-accent transition-all shadow-sm shadow-app-primary/30"
                    >
                      <Zap size={10} className="fill-current" />
                      Upgrade
                    </button>
                  </>
                )}
              </div>
            )}
            
            {user?.role === 'admin' && (
              <button 
                onClick={() => setIsAdminDashboardOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-black uppercase tracking-widest text-purple-500 hover:bg-purple-500/20 transition-all"
              >
                <Shield size={12} className="fill-current" />
                Admin
              </button>
            )}
            
            <button
              onClick={() => setActiveTab('help')}
              className="hidden md:flex p-2 hover:bg-app-surface rounded-full transition-colors text-app-text-muted hover:text-app-primary"
              title="Help & Settings"
            >
              <Settings size={20} />
            </button>

            <button 
              onClick={() => setActiveTab('profile')}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-app-primary to-app-accent p-[2px]"
            >
              <div className="w-full h-full rounded-full bg-app-bg flex items-center justify-center overflow-hidden">
                {user?.displayName ? (
                  <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=45A29E&color=0B0C10`} alt="User" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-app-primary" />
                )}
              </div>
            </button>

            <button 
              onClick={() => setIsMenuOpen(prev => !prev)}
              className="p-2 hover:bg-app-surface rounded-full transition-colors text-app-text-muted hover:text-app-primary flex items-center justify-center"
              title="Menu"
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <Dashboard 
                key="dashboard" 
                progress={progress} 
                user={user}
                allTasks={tasks}
                onStartTask={(task) => {
                  if (task.hasAudio) preFetchAudio(task);
                  setSelectedTask(task);
                  setCurrentCategoryTasks(tasks.filter(t => t.section === task.section));
                  setActiveTab(task.section);
                }} 
                onHoverTask={handleHoverTask}
                onSelectSection={setActiveTab}
                onViewRoadmap={() => setActiveTab('roadmap')}
                onViewVocabulary={() => setActiveTab('vocabulary')}
                onViewShuriken={() => setActiveTab('shuriken')}
                onViewPattern={() => setActiveTab('pattern')}
                onViewMockTests={() => setActiveTab('mock-tests')}
                calculateAverageScore={calculateAverageScore}
                setUpgradeReason={setUpgradeReason}
                calculateSectionAverage={calculateSectionAverage}
                calculateStudyPlan={calculateStudyPlan}
                onSetTargetScore={handleSetTargetScore}
                onSetTestDate={handleSetTestDate}
                onSaveToSchedule={handleSaveToSchedule}
                onResetTarget={handleResetTarget}
                onUpgrade={() => setShowSubscriptionModal(true)}
              />
            ) : activeTab === 'mock-tests' ? (
              <MockTestView 
                key="mock-tests"
                user={user}
                onBack={() => setActiveTab('dashboard')}
                onStartTest={(test) => { setResumeSession(null); setActiveMockTest(test); }}
                savedSessions={user?.savedMockSessions ?? null}
                onResumeTest={(test, session) => { setResumeSession(session); setActiveMockTest(test); }}
                setShowSubscriptionModal={setShowSubscriptionModal}
                setUpgradeReason={setUpgradeReason}
              />
            ) : activeTab === 'roadmap' ? (
              <RoadmapView 
                key="roadmap"
                user={user}
                allTasks={tasks}
                onBack={() => setActiveTab('dashboard')}
                onStartTask={(task) => {
                  if (task.hasAudio) preFetchAudio(task);
                  setSelectedTask(task);
                  setCurrentCategoryTasks(tasks.filter(t => t.section === task.section));
                  setActiveTab(task.section);
                }}
                notificationPermission={notificationPermission}
                onRequestPermission={async () => {
                  try {
                    await handleRequestNotificationPermission();
                  } catch (e) {
                    console.error("Permission request failed:", e);
                  }
                }}
              />
            ) : activeTab === 'vocabulary' ? (
              <VocabularyBuilder 
                key="vocabulary"
                user={user}
                onBack={() => setActiveTab('dashboard')}
              />
            ) : activeTab === 'shuriken' ? (
              <DailyShurikenView 
                key="shuriken"
                user={user}
                allTasks={tasks}
                onBack={() => setActiveTab('dashboard')}
                onStartTask={(task) => {
                  if (task.hasAudio) preFetchAudio(task);
                  setSelectedTask(task);
                  setCurrentCategoryTasks(tasks.filter(t => t.section === task.section));
                  setActiveTab(task.section);
                }}
              />
            ) : activeTab === 'profile' ? (
              <ProfileView 
                key="profile" 
                user={user} 
                onLogout={logout} 
                onLogin={login}
                onUpgrade={() => setShowSubscriptionModal(true)}
                isDarkMode={isDarkMode}
                onOpenAdminDashboard={() => setIsAdminDashboardOpen(true)}
                onNavigate={setActiveTab}
                isSyncingPortal={isSyncingPortal}
              />
            ) : activeTab === 'help' ? (
              <HelpView 
                key="help"
                onBack={() => setActiveTab('dashboard')}
                onNavigate={(tab) => setActiveTab(tab as any)}
                onOpenSupportChat={() => setSupportBotOpen(true)}
              />
            ) : activeTab === 'pattern' ? (
              <PatternView 
                key="pattern"
                onBack={() => setActiveTab('dashboard')}
              />
            ) : activeTab === 'faq' ? (
              <FAQView 
                key="faq"
                onBack={() => setActiveTab('dashboard')}
              />
            ) : activeTab === 'privacy' ? (
              <PrivacyPolicy 
                key="privacy"
                onBack={() => setActiveTab('dashboard')}
              />
            ) : activeTab === 'terms' ? (
              <TermsOfService 
                key="terms"
                onBack={() => setActiveTab('dashboard')}
              />
            ) : (
              <SectionView 
                key={activeTab} 
                section={activeTab as PTESection} 
                user={user}
                allTasks={tasks}
                onBack={() => setActiveTab('dashboard')} 
                onSelectTask={handleSelectTask}
                onHoverTask={handleHoverTask}
                setShowSubscriptionModal={setShowSubscriptionModal}
                setUpgradeReason={setUpgradeReason}
              />
            )}
          </AnimatePresence>
        </main>

        {/* Navigation Bar */}
        <nav className="flex items-center justify-between md:justify-around px-2 md:px-4 py-3 border-t border-app-border bg-app-bg/90 backdrop-blur-xl sticky bottom-0 z-50">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={BarChart3} label="Dojo" />
          <NavButton active={activeTab === 'mock-tests'} onClick={() => setActiveTab('mock-tests')} icon={Trophy} label="Mock" />
          <NavButton active={activeTab === 'vocabulary'} onClick={() => setActiveTab('vocabulary')} icon={Book} label="Vocab" />
          <NavButton active={activeTab === 'roadmap'} onClick={() => setActiveTab('roadmap')} icon={Map} label="Roadmap" className="hidden md:flex" />
          <NavButton active={activeTab === 'speaking'} onClick={() => setActiveTab('speaking')} icon={Mic} label="Speaking" />
          <NavButton active={activeTab === 'writing'} onClick={() => setActiveTab('writing')} icon={PenTool} label="Writing" />
          <NavButton active={activeTab === 'reading'} onClick={() => setActiveTab('reading')} icon={BookOpen} label="Reading" />
          <NavButton active={activeTab === 'listening'} onClick={() => setActiveTab('listening')} icon={Headphones} label="Listening" />
          <NavButton active={activeTab === 'faq'} onClick={() => setActiveTab('faq')} icon={AlertCircle} label="FAQ" className="hidden md:flex" />
        </nav>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 z-[120] flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            {/* Drawer Panel */}
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full max-w-sm sm:max-w-md h-full bg-app-bg border-l border-app-border shadow-2xl flex flex-col z-10"
            >
              <div className="flex items-center justify-between p-5 border-b border-app-border bg-app-surface/30">
                <Logo showText={true} size={36} />
                <button 
                  onClick={() => setIsMenuOpen(false)} 
                  className="p-2 hover:bg-app-surface rounded-full text-app-text-muted hover:text-app-text transition-colors"
                  aria-label="Close menu"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-1.5">
                <MenuLink icon={BarChart3} label="Dojo" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMenuOpen(false); }} />
                <MenuLink icon={Trophy} label="Mock Tests" active={activeTab === 'mock-tests'} onClick={() => { setActiveTab('mock-tests'); setIsMenuOpen(false); }} />
                <MenuLink icon={Book} label="Vocabulary" active={activeTab === 'vocabulary'} onClick={() => { setActiveTab('vocabulary'); setIsMenuOpen(false); }} />
                <MenuLink icon={Map} label="Roadmap" active={activeTab === 'roadmap'} onClick={() => { setActiveTab('roadmap'); setIsMenuOpen(false); }} />
                <MenuLink icon={Mic} label="Speaking" active={activeTab === 'speaking'} onClick={() => { setActiveTab('speaking'); setIsMenuOpen(false); }} />
                <MenuLink icon={PenTool} label="Writing" active={activeTab === 'writing'} onClick={() => { setActiveTab('writing'); setIsMenuOpen(false); }} />
                <MenuLink icon={BookOpen} label="Reading" active={activeTab === 'reading'} onClick={() => { setActiveTab('reading'); setIsMenuOpen(false); }} />
                <MenuLink icon={Headphones} label="Listening" active={activeTab === 'listening'} onClick={() => { setActiveTab('listening'); setIsMenuOpen(false); }} />
                <MenuLink icon={AlertCircle} label="FAQ" active={activeTab === 'faq'} onClick={() => { setActiveTab('faq'); setIsMenuOpen(false); }} />
                
                <div className="pt-3 mt-2 border-t border-app-border space-y-1.5">
                  <MenuLink icon={Settings} label="Settings & Help" active={activeTab === 'help'} onClick={() => { setActiveTab('help'); setIsMenuOpen(false); }} />
                  <MenuLink icon={User} label="Profile & Referral" active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setIsMenuOpen(false); }} />
                  {user?.role === 'admin' && (
                    <MenuLink icon={Shield} label="Admin Dashboard" active={false} onClick={() => { setIsAdminDashboardOpen(true); setIsMenuOpen(false); }} />
                  )}
                  {(user?.subscriptionStatus === 'trial' || user?.subscriptionStatus === 'guest') && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        setShowSubscriptionModal(true);
                      }}
                      className="w-full mt-2 flex items-center justify-between p-3.5 bg-gradient-to-r from-app-primary/10 to-app-accent/10 border border-app-primary/30 rounded-2xl text-app-primary font-bold text-xs uppercase tracking-wider hover:bg-app-primary/20 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <Zap size={16} className="fill-current text-app-accent" />
                        <span>Upgrade to Pro</span>
                      </div>
                      <span className="text-[10px] bg-app-accent text-app-bg px-2 py-0.5 rounded-full font-black">
                        PRO
                      </span>
                    </button>
                  )}
                  {user && (
                    <button
                      onClick={async () => {
                        setIsMenuOpen(false);
                        await logout();
                      }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-xs uppercase tracking-wider font-black text-red-400 hover:bg-red-500/10 transition-colors mt-1"
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {activeMockTest && (
          <MockTestSession 
            key={activeMockTest.id + (resumeSession?.savedAt ?? '')}
            test={activeMockTest}
            allTasks={tasks}
            onFinish={handleMockTestFinish}
            onClose={() => { setActiveMockTest(null); setResumeSession(null); setActiveTab('mock-tests'); }}
            onSaveAndExit={handleSaveMockSession}
            savedSession={resumeSession}
          />
        )}
        {selectedTask && (
          <TaskModal 
            key={selectedTask.id} 
            task={selectedTask} 
            onClose={() => { releaseGlobalMicStream(); setSelectedTask(null); }} 
            onFinish={(score) => handleTaskFinish(selectedTask.id, score)}
            onPrev={currentCategoryTasks.length > 1 && currentCategoryTasks.findIndex(t => t.id === selectedTask.id) > 0 ? () => {
              const idx = currentCategoryTasks.findIndex(t => t.id === selectedTask.id);
              const prevTask = currentCategoryTasks[idx - 1];
              if (prevTask?.hasAudio) preFetchAudio(prevTask);
              setSelectedTask(prevTask);
            } : undefined}
            onNext={currentCategoryTasks.length > 1 && currentCategoryTasks.findIndex(t => t.id === selectedTask.id) < currentCategoryTasks.length - 1 ? () => {
              const idx = currentCategoryTasks.findIndex(t => t.id === selectedTask.id);
              const nextTask = currentCategoryTasks[idx + 1];
              if (nextTask?.hasAudio) preFetchAudio(nextTask);
              setSelectedTask(nextTask);
            } : undefined}
          />
        )}
        {showSubscriptionModal && (
          <SubscriptionModal 
            key="subscription-modal"
            user={user}
            onClose={() => {
              setShowSubscriptionModal(false);
              setUpgradeReason(null);
            }}
            onLogin={login}
            isAccessRestricted={isAccessRestricted}
            isDarkMode={isDarkMode}
            upgradeReason={upgradeReason}
          />
        )}
        {showStreakModal && (
          <StreakCalendarModal 
            key="streak-modal"
            activityLog={user?.activityLog || []}
            onClose={() => setShowStreakModal(false)}
          />
        )}
        {isAdminDashboardOpen && user?.role === 'admin' && (
          <AdminDashboard onClose={() => setIsAdminDashboardOpen(false)} />
        )}
      </AnimatePresence>
      <SupportBot isOpen={supportBotOpen} setIsOpen={setSupportBotOpen} userName={user?.displayName} userEmail={user?.email} />
    </div>
  );
}

function StreakCalendarModal({ activityLog, onClose }: { activityLog: string[], onClose: () => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);
  
  const monthName = currentMonth.toLocaleString('default', { month: 'long' });
  
  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  
  const isLogged = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return activityLog.includes(dateStr);
  };

  const todayStr = getLocalDateStr();

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 bg-app-bg/90 backdrop-blur-md overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-md bg-app-surface border border-app-primary/20 rounded-3xl p-6 shadow-2xl my-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-app-text flex items-center gap-2">
            <Flame className="text-orange-500" size={24} />
            Training Streak
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-app-text-muted hover:text-app-primary">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1 hover:text-app-primary transition-colors"><ChevronRight className="rotate-180" /></button>
          <span className="font-bold text-app-text">{monthName} {year}</span>
          <button onClick={nextMonth} className="p-1 hover:text-app-primary transition-colors"><ChevronRight /></button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[10px] font-bold text-app-text-muted/50 py-2">{d}</div>
          ))}
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1;
            const logged = isLogged(day);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            
            return (
              <div 
                key={day} 
                className={cn(
                  "aspect-square flex items-center justify-center rounded-lg text-sm font-bold transition-all relative",
                  logged ? "bg-app-primary text-app-bg shadow-[0_0_10px_rgba(69,162,158,0.3)]" : "bg-app-bg text-app-text-muted/30",
                  isToday && !logged && "border border-app-primary/50"
                )}
              >
                {day}
                {isToday && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-app-accent rounded-full" />
                )}
              </div>
            );
          })}
        </div>
        
        <div className="mt-6 p-4 bg-app-bg rounded-2xl border border-app-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <Flame className="text-orange-500" size={20} />
            </div>
            <div>
              <p className="text-xs text-app-text-muted/50 uppercase font-bold tracking-widest">Current Streak</p>
              <p className="text-xl font-black text-app-text">{calculateStreak(activityLog)} Days</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-app-text-muted/50 uppercase font-bold tracking-widest">Total Days</p>
            <p className="text-xl font-black text-app-primary">{activityLog.length}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}



import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { CheckoutForm } from './components/CheckoutForm';

// Initialize Stripe
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function SubscriptionModal({ user, onClose, onLogin, isAccessRestricted, isDarkMode, upgradeReason }: { user: any, onClose: () => void, onLogin: () => void, isAccessRestricted: boolean, isDarkMode: boolean, upgradeReason: 'expired' | 'limit' | null }) {
  const { formatPrice, currency } = useSubscription();
  const isPremiumUser = user?.subscriptionStatus === 'active';
  const rawPlanId = (user?.planId || (user as any)?.plan || (user as any)?.subscriptionPlan || '').toLowerCase().trim();
  const currentPlanIndex = isPremiumUser && rawPlanId
    ? SUBSCRIPTION_PLANS.findIndex(p => p.id.toLowerCase() === rawPlanId)
    : -1;
  const isAnnualUser = isPremiumUser && (rawPlanId === 'annual' || currentPlanIndex === 3);

  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [razorpayKeyId, setRazorpayKeyId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // Stripe subscription details returned from the server
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<string | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [pendingPeriodEnd, setPendingPeriodEnd] = useState<number | null>(null);

  // Auto-apply pending referral code if available and none currently applied (skip if already annual)
  useEffect(() => {
    if (isAnnualUser) return;
    const applyPendingReferral = async () => {
      try {
        const pendingRef = localStorage.getItem('pte_pending_referral');
        if (pendingRef && !appliedPromo) {
          const res = await PromoService.validateDetailed(pendingRef, user?.uid);
          if (res.promo) {
            setAppliedPromo(res.promo);
            setPromoInput(res.promo.code);
            if (res.promo.isReferral) {
              toast.info(`Referral code ${res.promo.code} applied! 10% discount included.`);
            } else {
              toast.info(`Voucher code ${res.promo.code} applied! ${res.promo.discountPercent}% discount included.`);
            }
          }
        }
      } catch (e) {}
    };
    applyPendingReferral();
  }, [user?.uid]);

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) {
      toast.error('Please enter a referral or promo code.');
      return;
    }
    const res = await PromoService.validateDetailed(promoInput, user?.uid);
    if (res.promo) {
      setAppliedPromo(res.promo);
      if (res.promo.isReferral) {
        toast.success(`Referral code applied! 10% discount from ${res.promo.referrerName || 'your friend'}.`);
      } else {
        toast.success(`Promo code ${res.promo.code} applied! ${res.promo.discountPercent}% off.`);
      }
    } else {
      toast.error(res.error || 'Invalid referral or promo code');
      setAppliedPromo(null);
    }
  };

  const handleSelectPlan = async (plan: any) => {
    if (!user?.email && !emailInput) {
      setShowEmailPrompt(true);
      setSelectedPlan(plan);
      return;
    }

    setSelectedPlan(plan);
    setIsProcessing(true);
    
    try {
      // If user is guest, we strongly recommend signing up first
      if (user?.accessType === 'guest' && !user?.emailVerified) {
        toast.info("We recommend signing up with Google before upgrading to keep your progress safe across devices.", {
          duration: 5000,
          action: {
            label: "Sign Up Now",
            onClick: onLogin
          }
        });
      }

      let basePrice = plan.price;
      if (appliedPromo) {
        basePrice = PromoService.calculateDiscount(basePrice, appliedPromo.discountPercent);
      }

      const convertedAmount = CurrencyService.convert(basePrice);
      const amountInCents = Math.round((convertedAmount ?? basePrice) * 100);
      if (!amountInCents || amountInCents <= 0 || !Number.isFinite(amountInCents)) {
        toast.error("Could not calculate payment amount. Please try again.");
        return;
      }

      const receiptEmail = (emailInput || user?.email || "").trim() || undefined;
      const _subToken = await auth.currentUser?.getIdToken().catch(() => null);
      const response = await fetch('/api/create-razorpay-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(_subToken ? { Authorization: `Bearer ${_subToken}` } : {}) },
        body: JSON.stringify({ 
          planId: plan.id,
          planName: plan.name,
          amount: amountInCents / 100,
          currency: currency.code,
          email: receiptEmail,
          promoCode: appliedPromo?.code || undefined,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Payment server error text:", errorText);
        
        let errorMessage = "Failed to initialize payment";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          if (errorText.includes("FUNCTION_INVOCATION_FAILED")) {
            errorMessage = "Payment server is currently unavailable. Please check Vercel logs.";
          } else if (errorText.includes("Internal Server Error")) {
            errorMessage = "Server error occurred. Please check your STRIPE_SECRET_KEY configuration.";
          }
        }
        
        toast.error(errorMessage);
        return;
      }
      const data = await response.json();
      if (data.id) {
        setClientSecret(data.id);
        if (data.razorpayKeyId) setRazorpayKeyId(data.razorpayKeyId);
      } else if (data.immediatelyActive) {
        setPendingSubscriptionId(data.subscriptionId ?? null);
        setPendingCustomerId(data.customerId ?? null);
        setPendingPeriodEnd(data.currentPeriodEnd ?? null);
        await handlePaymentSuccess({
          subscriptionId: data.subscriptionId ?? null,
          customerId: data.customerId ?? null,
          periodEnd: data.currentPeriodEnd ?? null,
        });
      } else {
        toast.error(data.error || "Failed to initialize payment");
      }
    } catch (error) {
      console.error("Payment initialization error:", error);
      toast.error("Could not connect to payment server");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = async (overrides?: { subscriptionId?: string | null; customerId?: string | null; periodEnd?: number | null }) => {
    if (!user?.uid) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      // Prefer explicitly-passed values (e.g. from immediatelyActive flow where
      // React state may not have flushed yet) then fall back to state.
      const resolvedSubscriptionId = overrides?.subscriptionId !== undefined ? overrides.subscriptionId : pendingSubscriptionId;
      const resolvedCustomerId     = overrides?.customerId     !== undefined ? overrides.customerId     : pendingCustomerId;
      const resolvedPeriodEnd      = overrides?.periodEnd      !== undefined ? overrides.periodEnd      : pendingPeriodEnd;

      // Use Stripe's authoritative period end if available, otherwise fall back
      const periodEnd = resolvedPeriodEnd
        ? new Date(resolvedPeriodEnd * 1000).toISOString()
        : new Date(Date.now() + selectedPlan.durationDays * 24 * 60 * 60 * 1000).toISOString();

      const updateData: any = {
        subscriptionStatus: 'active',
        planId: selectedPlan.id,
        subscriptionEndsAt: periodEnd,
        cancelAtPeriodEnd: false,
      };

      if (resolvedSubscriptionId) updateData.stripeSubscriptionId = resolvedSubscriptionId;
      if (resolvedCustomerId)     updateData.stripeCustomerId    = resolvedCustomerId;
      if (emailInput && !user.email) updateData.email = emailInput.trim();

      await updateDoc(userRef, updateData);

      if (appliedPromo?.isReferral && appliedPromo.referrerUid) {
        PromoService.recordReferralUse(
          appliedPromo.referrerUid,
          user.uid,
          selectedPlan.id,
          appliedPromo.code
        ).catch(() => {});
        try { localStorage.removeItem('pte_pending_referral'); } catch (e) {}
      }
      
      setShowSuccess(true);
      toast.success(`Successfully subscribed to ${selectedPlan.name}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-app-bg/95 backdrop-blur-xl overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-4xl bg-app-surface border border-app-primary/20 rounded-3xl p-8 shadow-2xl my-auto"
      >
        {(isAccessRestricted || upgradeReason === 'expired') && !selectedPlan && !showSuccess && (
          <div className="w-full text-left bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 mb-6 rounded-r-md shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <Info className="h-5 w-5 text-amber-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200">
                  Your free access has ended
                </h3>
                <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  <p>
                    We hope you enjoyed your free access! Please choose a plan below to continue accessing your dashboard and all premium features.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        {upgradeReason === 'limit' && !selectedPlan && !showSuccess && (
          <div className="w-full text-left bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 mb-6 rounded-r-md shadow-sm">
            <div className="flex">
              <div className="flex-shrink-0">
                <Lock className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-blue-800 dark:text-blue-200">
                  Free Content Limit Reached
                </h3>
                <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                  <p>
                    You've practiced all the free questions for this task type. Upgrade to Pro to unlock all {PTE_TASKS.length}+ questions and mock tests!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col items-center text-center space-y-6">
          {showSuccess ? (
            <div className="w-full max-w-md space-y-8 py-12">
              <div className="relative">
                <div className="w-24 h-24 bg-app-accent/20 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <CheckCircle className="text-app-accent" size={48} />
                </div>
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-8 h-8 bg-app-primary rounded-full flex items-center justify-center text-app-bg"
                >
                  <Star size={16} className="fill-current" />
                </motion.div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-4xl font-black text-app-text tracking-tighter">SUBSCRIPTION ACTIVE!</h2>
                <div className="space-y-2">
                  <p className="text-app-text-muted text-lg">Welcome to the Pro Ninja family.</p>
                  <div className="p-4 bg-app-bg/50 border border-app-primary/10 rounded-2xl inline-block">
                    <p className="text-xs text-app-text-muted uppercase tracking-widest font-bold mb-1">Confirmation sent to</p>
                    <p className="text-app-primary font-bold">{emailInput || user?.email}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="p-4 bg-app-surface border border-app-primary/5 rounded-2xl">
                  <p className="text-[10px] text-app-text-muted uppercase font-bold">Plan</p>
                  <p className="text-sm font-bold text-app-text">{selectedPlan?.name}</p>
                </div>
                <div className="p-4 bg-app-surface border border-app-primary/5 rounded-2xl">
                  <p className="text-[10px] text-app-text-muted uppercase font-bold">Amount</p>
                  <p className="text-sm font-bold text-app-text">{formatPrice(appliedPromo ? PromoService.calculateDiscount(selectedPlan?.price, appliedPromo.discountPercent) : selectedPlan?.price)}</p>
                </div>
                <div className="p-4 bg-app-surface border border-app-primary/5 rounded-2xl">
                  <p className="text-[10px] text-app-text-muted uppercase font-bold">Next Renewal</p>
                  <p className="text-sm font-bold text-app-text">
                    {pendingPeriodEnd
                      ? new Date(pendingPeriodEnd * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
                <div className="p-4 bg-app-surface border border-app-primary/5 rounded-2xl">
                  <p className="text-[10px] text-app-text-muted uppercase font-bold">Billing</p>
                  <p className="text-sm font-bold text-app-text capitalize">{selectedPlan?.interval}</p>
                </div>
              </div>

              <button 
                onClick={onClose}
                className="w-full py-4 bg-app-primary text-app-bg font-black text-lg rounded-2xl hover:bg-app-accent transition-all shadow-xl shadow-app-primary/20"
              >
                START TRAINING NOW
              </button>
              
              {pendingSubscriptionId && (
                <p className="text-[10px] text-app-text-muted/40">
                  Subscription ID: {pendingSubscriptionId}
                </p>
              )}
            </div>
          ) : showEmailPrompt ? (
            <div className="w-full max-w-md space-y-6 py-8">
              <div className="w-16 h-16 bg-app-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                <Mail className="text-app-primary" size={32} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-app-text">Email Required</h2>
                <p className="text-app-text-muted">Please provide your email to receive payment confirmation and secure your account.</p>
              </div>
              <div className="space-y-4">
                <input 
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = emailInput.trim();
                      if (trimmed.includes('@') && trimmed.includes('.')) {
                        setEmailInput(trimmed);
                        setShowEmailPrompt(false);
                        handleSelectPlan(selectedPlan);
                      }
                    }
                  }}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-app-bg border border-app-primary/20 rounded-xl focus:ring-2 focus:ring-app-primary outline-none transition-all"
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setShowEmailPrompt(false);
                      setSelectedPlan(null);
                    }}
                    disabled={isProcessing}
                    className="flex-1 py-3 px-6 bg-app-surface border border-app-primary/10 text-app-text-muted font-bold rounded-xl hover:bg-app-primary/5 transition-all disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button 
                    disabled={isProcessing}
                    onClick={() => {
                      const trimmed = emailInput.trim();
                      if (trimmed.includes('@') && trimmed.includes('.')) {
                        setEmailInput(trimmed);
                        setShowEmailPrompt(false);
                        handleSelectPlan(selectedPlan);
                      } else {
                        toast.error("Please enter a valid email address");
                      }
                    }}
                    className="flex-1 py-3 px-6 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={16} /> : null}
                    Continue
                  </button>
                </div>
              </div>
              <p className="text-xs text-app-text-muted/50">
                Or <button onClick={onLogin} className="text-app-primary hover:underline">Sign in with Google</button> for a faster experience.
              </p>
            </div>
          ) : !selectedPlan ? (
            <>
              {/* Diwali Festive 20% Voucher Card - only shown if user does not already have an active Annual plan */}
              {!isAnnualUser && (
                <DiwaliBanner
                  variant="card"
                  className="w-full mb-3"
                  isApplied={appliedPromo?.code === 'DIWALI20'}
                  onApply={async () => {
                    setPromoInput('DIWALI20');
                    const res = await PromoService.validateDetailed('DIWALI20', user?.uid);
                    if (res.promo) {
                      setAppliedPromo(res.promo);
                      toast.success('🪔 Diwali 20% discount voucher applied!');
                    }
                  }}
                />
              )}

              <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
                <ShieldCheck className="text-white" size={32} />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-app-text tracking-tight">
                  {user?.subscriptionStatus === 'expired' 
                    ? 'Subscription Expired' 
                    : isAnnualUser 
                      ? 'Your Pro Subscription' 
                      : isPremiumUser 
                        ? 'Upgrade or Change Plan' 
                        : 'Upgrade to Pro'}
                </h2>
                <p className="text-app-text-muted text-lg">
                  {isAnnualUser 
                    ? 'You have unlimited access on our top-tier Annual Plan'
                    : isPremiumUser 
                      ? `You are currently on the ${SUBSCRIPTION_PLANS.find(p => p.id.toLowerCase() === rawPlanId)?.name || 'Pro'} plan`
                      : 'Master the PTE with our premium AI-powered practice platform'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full pt-4">
                {SUBSCRIPTION_PLANS.map((plan, planIdx) => {
                  const isCurrentPlan = isPremiumUser && (
                    rawPlanId === plan.id.toLowerCase() || 
                    (currentPlanIndex !== -1 && planIdx === currentPlanIndex)
                  );
                  const isUpgrade = isPremiumUser && !isCurrentPlan && currentPlanIndex !== -1 && planIdx > currentPlanIndex;
                  const isChangePlan = isPremiumUser && !isCurrentPlan && !isUpgrade;

                  return (
                    <div 
                      key={plan.id}
                      onClick={async () => {
                        if (isCurrentPlan) {
                          toast.info(`You are currently subscribed to the ${plan.name} plan.`);
                          return;
                        }
                        try {
                          await handleSelectPlan(plan);
                        } catch (e) {
                          console.error("Failed to select plan:", e);
                        }
                      }}
                      className={`relative bg-app-bg border ${
                        isCurrentPlan 
                          ? 'border-green-500 ring-2 ring-green-500/20 shadow-[0_0_25px_rgba(34,197,94,0.15)]' 
                          : isUpgrade
                            ? 'border-app-accent shadow-[0_0_20px_rgba(102,252,241,0.15)] hover:border-app-accent'
                            : plan.isSpecial 
                              ? 'border-app-accent/60 shadow-[0_0_20px_rgba(102,252,241,0.08)]' 
                              : 'border-app-primary/20'
                      } rounded-2xl p-6 flex flex-col items-center space-y-4 hover:border-app-primary transition-all group ${
                        isCurrentPlan ? 'cursor-default' : 'cursor-pointer'
                      } overflow-hidden`}
                    >
                      {isCurrentPlan ? (
                        <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-xl bg-green-500 text-white flex items-center gap-1 shadow-sm">
                          <Check size={11} className="stroke-[3]" /> Current Plan
                        </div>
                      ) : isUpgrade ? (
                        <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-xl bg-app-accent text-slate-950 flex items-center gap-1 shadow-sm">
                          <Zap size={10} className="fill-current text-slate-950" /> Upgrade
                        </div>
                      ) : plan.badge ? (
                        <div className={`absolute top-0 right-0 px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-bl-xl ${plan.isSpecial ? 'bg-app-accent text-app-bg' : 'bg-app-primary text-app-bg'}`}>
                          {plan.badge}
                        </div>
                      ) : null}
                      
                      <h3 className="text-lg font-bold text-app-text">{plan.name}</h3>
                      
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-app-text-muted/40 line-through font-medium">{formatPrice(plan.originalPrice)}</span>
                          <div className="flex flex-col items-center">
                            {appliedPromo ? (
                              <>
                                <span className="text-xs text-app-text-muted/40 line-through">{formatPrice(plan.price)}</span>
                                <span className="text-3xl font-bold text-app-accent">{formatPrice(PromoService.calculateDiscount(plan.price, appliedPromo.discountPercent))}</span>
                              </>
                            ) : (
                              <span className="text-3xl font-bold text-app-accent">{formatPrice(plan.price)}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-app-text-muted/50">/{plan.interval}</span>
                      </div>

                      <ul className="text-xs text-app-text-muted space-y-2 text-left w-full">
                        <li className="flex items-center gap-2"><Check size={12} className="text-app-primary" /> Full Question Bank</li>
                        <li className="flex items-center gap-2"><Check size={12} className="text-app-primary" /> AI Scoring</li>
                        <li className="flex items-center gap-2"><Check size={12} className="text-app-primary" /> Detailed Feedback</li>
                      </ul>

                      {isCurrentPlan ? (
                        <div className="w-full py-2.5 font-bold rounded-xl text-center bg-green-500/15 border border-green-500/30 text-green-500 dark:text-green-400 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider select-none">
                          <Check size={14} className="stroke-[3]" />
                          <span>Current Plan</span>
                        </div>
                      ) : isUpgrade ? (
                        <button className="w-full py-2.5 font-extrabold rounded-xl transition-all shadow-md bg-gradient-to-r from-app-primary to-app-accent text-slate-950 hover:brightness-110 active:scale-95 flex items-center justify-center gap-1.5 text-sm">
                          <span>Upgrade to this</span>
                          <ArrowRight size={14} />
                        </button>
                      ) : isChangePlan ? (
                        <button className="w-full py-2.5 font-bold rounded-xl transition-all border border-app-primary/30 text-app-text hover:bg-app-primary/10 hover:border-app-primary active:scale-95 text-sm">
                          Change Plan
                        </button>
                      ) : (
                        <button className={`w-full py-2.5 font-bold rounded-xl transition-all shadow-sm ${
                          plan.isSpecial
                            ? 'bg-app-accent text-slate-900 group-hover:brightness-110 group-hover:shadow-md'
                            : 'bg-app-primary text-white group-hover:bg-app-accent group-hover:text-slate-900 group-hover:shadow-md'
                        }`}>
                          Select Plan
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {!isAnnualUser && (
                <div className="w-full max-w-md mx-auto space-y-2">
                  {appliedPromo && (
                    <div className="flex items-center justify-between bg-app-accent/10 border border-app-accent/30 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="shrink-0 text-app-accent" size={14} />
                        <span className="text-app-accent text-xs font-bold uppercase tracking-wide truncate" title={appliedPromo.code}>{appliedPromo.code}</span>
                        <span className="text-app-accent/80 text-xs font-medium shrink-0">
                          — {appliedPromo.discountPercent}% off {appliedPromo.isReferral ? `(Referral: ${appliedPromo.referrerName || 'Friend'})` : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => { setAppliedPromo(null); setPromoInput(''); }}
                        className="shrink-0 ml-3 text-app-text-muted/40 hover:text-app-text-muted transition-colors"
                        aria-label="Remove promo code"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div className="bg-app-bg border border-app-primary/10 rounded-2xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <input 
                        type="text" 
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo(); } }}
                        placeholder="Referral or Gift Code"
                        className="w-full bg-transparent border-none focus:ring-0 text-app-text placeholder:text-app-text-muted/40 text-sm font-medium outline-none"
                      />
                    </div>
                    <button 
                      onClick={handleApplyPromo}
                      className="shrink-0 bg-app-primary/10 hover:bg-app-primary/20 text-app-primary px-4 py-1.5 rounded-xl text-xs font-bold transition-all"
                    >
                      Apply
                    </button>
                  </div>
                  <p className="text-[11px] text-app-text-muted/60 text-center">
                    Only one referral or promo code can be applied at a time.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="w-full space-y-8">
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <h3 className="text-2xl font-bold text-app-text">{selectedPlan.name} Plan</h3>
                  <p className="text-app-text-muted text-sm">Secure Checkout</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-sm text-app-text-muted/40 line-through">{formatPrice(selectedPlan.originalPrice)}</span>
                    <div className="flex flex-col items-end">
                      {appliedPromo ? (
                        <>
                          <span className="text-xs text-app-text-muted/40 line-through">{formatPrice(selectedPlan.price)}</span>
                          <div className="text-3xl font-bold text-app-accent">{formatPrice(PromoService.calculateDiscount(selectedPlan.price, appliedPromo.discountPercent))}</div>
                        </>
                      ) : (
                        <div className="text-3xl font-bold text-app-accent">{formatPrice(selectedPlan.price)}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-app-text-muted/50">{currency.code} Total</div>
                </div>
              </div>

              {clientSecret ? (
                <CheckoutForm 
                  amount={appliedPromo ? PromoService.calculateDiscount(selectedPlan.price, appliedPromo.discountPercent) : selectedPlan.price} 
                  clientSecret={clientSecret}
                  selectedPlanId={selectedPlan.id}
                  keyId={razorpayKeyId}
                  isSubscription={true}
                  onCancel={() => {
                    setSelectedPlan(null);
                    setClientSecret(null);
                    setRazorpayKeyId('');
                  }}
                  onSuccess={async () => {
                    try {
                      await handlePaymentSuccess();
                    } catch (e) {
                      console.error("Payment success error", e);
                    }
                  }}
                />
              ) : (
                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="animate-spin text-app-primary" size={40} />
                  <p className="text-app-text-muted animate-pulse">Initializing secure payment gateway...</p>
                </div>
              )}
            </div>
          )}

          {!selectedPlan && user?.accessType === 'guest' && (
            <div className={cn(
              "w-full p-4 border rounded-2xl flex items-center gap-4 text-left transition-colors",
              isAccessRestricted 
                ? "bg-orange-500/10 border-orange-500/20" 
                : "bg-app-primary/10 border-app-primary/20"
            )}>
              <User className={isAccessRestricted ? "text-orange-500" : "text-app-primary"} size={24} />
              <div>
                <p className={cn("font-bold", isAccessRestricted ? "text-orange-500" : "text-app-primary")}>
                  {isAccessRestricted ? 'Guest Access Expired' : 'Guest Access Active'}
                </p>
                <p className="text-xs text-app-text-muted">
                  {isAccessRestricted 
                    ? 'Sign up now to get a 7-day free trial!' 
                    : 'You have 3 days of free access. Sign up to save your progress!'}
                </p>
              </div>
              <button 
                onClick={onLogin}
                className={cn(
                  "ml-auto px-4 py-2 font-bold rounded-xl transition-all",
                  isAccessRestricted ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-app-primary text-app-bg hover:bg-app-accent"
                )}
              >
                Sign Up
              </button>
            </div>
          )}

          {!isAccessRestricted && (
            <button 
              onClick={onClose}
              className="text-app-text-muted/50 hover:text-app-text transition-colors"
            >
              Maybe later
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  return (
    <SubscriptionProvider>
      <AppContent />
      <Toaster position="top-center" richColors />
    </SubscriptionProvider>
  );
}

function HelpView({ onBack, onNavigate, onOpenSupportChat }: { onBack: () => void, onNavigate: (tab: string) => void, onOpenSupportChat: () => void }) {
  const helpOptions = [
    { 
      title: 'Getting Started', 
      description: 'Learn the basics of PTE Ninja and how to use the AI trainer.',
      icon: Play,
      action: () => {
        onNavigate('dashboard');
        toast.success("Welcome! Start by setting your target score and test date in the Dojo to generate your personalized study plan.");
      }
    },
    { 
      title: 'Study Roadmap', 
      description: 'View your personalized path to PTE mastery.',
      icon: Map,
      action: () => onNavigate('roadmap')
    },
    { 
      title: 'Vocabulary Tips', 
      description: 'How to effectively use the vocabulary builder.',
      icon: Book,
      action: () => onNavigate('vocabulary')
    },
    { 
      title: 'Frequently Asked Questions', 
      description: 'Find answers to common questions about the PTE exam and our platform.',
      icon: AlertCircle,
      action: () => onNavigate('faq')
    },
    { 
      title: 'Customer Support', 
      description: 'Need help? Chat with our support team directly.',
      icon: MessageCircle,
      action: onOpenSupportChat
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-app-surface rounded-full transition-colors shrink-0">
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div className="p-3 rounded-2xl bg-app-primary/10 shrink-0">
          <Settings className="text-app-primary" size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-app-text uppercase tracking-tight">Help & Support</h2>
          <p className="text-sm text-app-text-muted">How can we help you today?</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {helpOptions.map((option, index) => (
          <motion.button
            key={option.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={option.action}
            className="flex items-start gap-4 p-6 bg-app-surface border border-app-primary/10 rounded-3xl hover:border-app-primary/40 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-app-bg rounded-2xl flex items-center justify-center group-hover:bg-app-primary transition-colors shrink-0">
              <option.icon size={24} className="text-app-primary group-hover:text-app-bg transition-colors" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-app-text group-hover:text-app-accent transition-colors">{option.title}</h3>
              <p className="text-sm text-app-text-muted leading-relaxed mt-1">{option.description}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="bg-app-primary/5 p-8 rounded-[2.5rem] border border-app-primary/10 text-center space-y-4">
        <h3 className="text-xl font-bold text-app-text">Still have questions?</h3>
        <p className="text-app-text-muted max-w-md mx-auto">Check out our comprehensive FAQ for detailed answers about the PTE Academic exam.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button 
            onClick={() => onNavigate('faq')}
            className="px-8 py-3 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all"
          >
            View FAQ
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function FAQView({ onBack }: { onBack: () => void }) {
  const faqs = [
    {
      q: "What is the PTE Academic exam?",
      a: "PTE Academic is a computer-based English language test accepted by educational institutions and governments around the world. It measures your listening, reading, speaking, and writing skills."
    },
    {
      q: "How is the PTE exam scored?",
      a: "PTE Academic is scored on a scale of 10-90. The overall score is based on your performance in all sections of the test. You also receive scores for each of the four communicative skills."
    },
    {
      q: "What is the latest PTE exam pattern?",
      a: "The PTE Academic exam was shortened in late 2021. It now takes approximately 2 hours and consists of three main parts: Speaking & Writing, Reading, and Listening."
    },
    {
      q: "How can PTE Ninja help me prepare?",
      a: "PTE Ninja provides an AI-powered training platform with realistic practice tasks, personalized study plans, and instant feedback on your performance to help you reach your target score efficiently."
    },
    {
      q: "Is there a difference between PTE Academic and PTE Core?",
      a: "Yes, PTE Academic is primarily for study and migration to Australia, New Zealand, and the UK. PTE Core is a newer version designed for general migration to Canada."
    },
    {
      q: "How often can I take the PTE exam?",
      a: "You can take the PTE Academic exam as many times as you like, but you must wait until you receive your scores from one test before booking another."
    }
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-3xl mx-auto space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-app-surface rounded-full transition-colors">
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div>
          <h2 className="text-3xl font-black text-app-text tracking-tight uppercase">FAQ</h2>
          <p className="text-app-text-muted/50 font-bold uppercase tracking-widest text-xs">Frequently Asked Questions</p>
        </div>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-app-surface rounded-2xl border border-app-primary/10 overflow-hidden">
            <button 
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full p-6 flex items-center justify-between text-left hover:bg-app-primary/5 transition-colors"
            >
              <span className="font-bold text-app-text">{faq.q}</span>
              {openIndex === index ? <ChevronUp className="text-app-primary" /> : <ChevronDown className="text-app-text-muted" />}
            </button>
            <AnimatePresence>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-6"
                >
                  <p className="text-sm text-app-text-muted leading-relaxed border-t border-app-primary/5 pt-4">
                    {faq.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ProfileView({ user, onLogout, onLogin, onUpgrade, isDarkMode, onOpenAdminDashboard, onNavigate, isSyncingPortal = false }: { 
  user: any, 
  onLogout: () => void, 
  onLogin: () => void,
  onUpgrade: () => void, 
  isDarkMode: boolean, 
  onOpenAdminDashboard?: () => void,
  onNavigate: (tab: any) => void,
  isSyncingPortal?: boolean
}) {
  const isTrial = user?.subscriptionStatus === 'trial';
  const isGuest = user?.subscriptionStatus === 'guest';
  const isActive = user?.subscriptionStatus === 'active';
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelStep, setCancelStep] = useState<'offer' | 'confirm'>('offer');
  const [isCanceling, setIsCanceling] = useState(false);
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [changePlanTarget, setChangePlanTarget] = useState<typeof SUBSCRIPTION_PLANS[number] | null>(null);
  const [showChangePlanConfirm, setShowChangePlanConfirm] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Personal Info Form State
  const [profileName, setProfileName] = useState(user?.displayName || '');
  const [profilePhone, setProfilePhone] = useState(user?.phoneNumber || '');
  const [isPhoneVerified, setIsPhoneVerified] = useState(Boolean(user?.phoneVerified));
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [phoneOtpStep, setPhoneOtpStep] = useState<'idle' | 'otp'>('idle');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);

  // Referral states
  const userReferralCode = user?.referralCode || (user?.uid ? generateUserReferralCode(user?.displayName, user?.uid) : '');
  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}?ref=${userReferralCode}` : '';
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = async () => {
    if (!userReferralCode) return;
    try {
      await navigator.clipboard.writeText(userReferralCode);
      setCopiedCode(true);
      toast.success("Referral code copied to clipboard!");
      setTimeout(() => setCopiedCode(false), 2500);
    } catch (e) {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      toast.success("Referral link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleWhatsAppShare = () => {
    const text = `Hey! I'm practicing for my PTE exam on PTE Ninja. Use my referral code ${userReferralCode} (or sign up using my link: ${referralLink}) to get an extra 10% off any plan! 🎯🥋`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  useEffect(() => {
    if (user) {
      setProfileName(user.displayName || '');
      setProfilePhone(user.phoneNumber || '');
      setIsPhoneVerified(Boolean(user.phoneVerified));
    }
  }, [user?.displayName, user?.phoneNumber, user?.phoneVerified]);

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user?.uid) return;
    if (!profileName.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    setIsSavingProfile(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const isNewPhone = profilePhone.trim() !== (user.phoneNumber || '').trim();
      const updatedVerified = isNewPhone ? false : isPhoneVerified;

      await updateDoc(userRef, {
        displayName: profileName.trim(),
        phoneNumber: profilePhone.trim() || null,
        phoneVerified: updatedVerified,
      });

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: profileName.trim()
        });
      }

      if (isNewPhone) {
        setIsPhoneVerified(false);
        setPhoneOtpStep('idle');
      }

      toast.success("Profile updated successfully!");
    } catch (err: any) {
      console.error("Failed to update profile:", err);
      toast.error(formatAuthError(err));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendProfilePhoneOTP = async () => {
    if (!profilePhone.trim()) {
      toast.error("Please enter a valid phone number with country code.");
      return;
    }
    if (!auth.currentUser) {
      toast.error("You must be signed in to verify your phone number.");
      return;
    }
    setIsSendingPhoneOtp(true);
    try {
      const verifier = new RecaptchaVerifier(auth, 'profile-recaptcha-container', {
        size: 'invisible'
      });
      let result: ConfirmationResult;
      try {
        result = await linkWithPhoneNumber(auth.currentUser, profilePhone.trim(), verifier);
      } catch (err: any) {
        if (err.code === 'auth/provider-already-linked') {
          await unlink(auth.currentUser, 'phone').catch(() => {});
          result = await linkWithPhoneNumber(auth.currentUser, profilePhone.trim(), verifier);
        } else {
          throw err;
        }
      }
      setPhoneConfirmation(result);
      setPhoneOtpStep('otp');
      toast.success("Verification code sent to your phone!");
    } catch (err: any) {
      console.error("Send phone OTP failed:", err);
      toast.error(formatAuthError(err));
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  const handleVerifyProfilePhoneOTP = async () => {
    if (!phoneOtpCode.trim() || !phoneConfirmation || !user?.uid) {
      toast.error("Please enter the 6-digit code.");
      return;
    }
    setIsVerifyingPhoneOtp(true);
    try {
      await phoneConfirmation.confirm(phoneOtpCode.trim());
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        phoneNumber: profilePhone.trim(),
        phoneVerified: true,
      });
      setIsPhoneVerified(true);
      setPhoneOtpStep('idle');
      setPhoneOtpCode('');
      toast.success("Phone number verified successfully!");
    } catch (err: any) {
      console.error("Verify phone OTP failed:", err);
      toast.error(formatAuthError(err));
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };
  
  const getStatusColor = () => {
    if (isActive && user?.cancelAtPeriodEnd) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (isActive) return 'text-green-500 bg-green-500/10 border-green-500/20';
    if (isTrial) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    if (isGuest) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return 'text-red-500 bg-red-500/10 border-red-500/20';
  };

  const getRemainingDays = () => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (isTrial && user.trialEndsAt) {
      const endsAt = new Date(user.trialEndsAt);
      const endsMidnight = new Date(endsAt.getFullYear(), endsAt.getMonth(), endsAt.getDate());
      return Math.max(0, Math.round((endsMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));
    }
    if (isGuest) {
      const createdAt = new Date(user.createdAt);
      const expiryMidnight = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate() + 3);
      return Math.max(0, Math.round((expiryMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return 0;
  };

  const handleManageBilling = async () => {
    if (!user?.stripeCustomerId) return;
    setIsOpeningPortal(true);
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch('/api/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          customerId: user.stripeCustomerId,
          returnUrl: (() => {
            const url = new URL(window.location.href);
            url.searchParams.set('fromPortal', '1');
            return url.toString();
          })(),
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Could not open billing portal');
      }
    } catch {
      toast.error('Could not connect to billing portal');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleApplyRetentionDiscount = async () => {
    if (!user?.stripeSubscriptionId) return;
    setIsApplyingDiscount(true);
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch('/api/apply-retention-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ subscriptionId: user.stripeSubscriptionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCancelDialog(false);
        toast.success('🎉 10% discount applied to your next billing cycle. Thanks for staying!');
      } else {
        toast.error(data.error || 'Could not apply discount');
      }
    } catch {
      toast.error('Could not connect to server');
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (user?.paymentProvider === 'razorpay') {
      setIsCanceling(true);
      try {
        await updateDoc(doc(db, 'users', user.uid), { cancelAtPeriodEnd: true });
        setShowCancelDialog(false);
        setCancelStep('offer');
        toast.success('Subscription cancelled. You keep full access until the end of your billing period.');
      } catch (err) {
        toast.error('Failed to update subscription settings');
      } finally {
        setIsCanceling(false);
      }
      return;
    }

    if (!user?.stripeSubscriptionId && !user?.stripeCustomerId) {
      toast.error('Subscription information not found. Please contact support to cancel your subscription.');
      return;
    }
    setIsCanceling(true);
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          subscriptionId: user.stripeSubscriptionId || undefined,
          customerId: user.stripeCustomerId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const updates: Record<string, unknown> = { cancelAtPeriodEnd: true };
        // If the server discovered the subscriptionId via customerId, persist it
        if (data.subscriptionId && !user?.stripeSubscriptionId) {
          updates.stripeSubscriptionId = data.subscriptionId;
        }
        await updateDoc(doc(db, 'users', user.uid), updates);
        setShowCancelDialog(false);
        setCancelStep('offer');
        toast.success('Subscription cancelled. You keep full access until the end of your billing period.');
      } else {
        toast.error(data.error || 'Failed to cancel subscription');
      }
    } catch {
      toast.error('Could not connect to server');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleReactivate = async () => {
    if (!user?.stripeSubscriptionId) return;
    setIsReactivating(true);
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch('/api/reactivate-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ subscriptionId: user.stripeSubscriptionId }),
      });
      const data = await res.json();
      if (res.ok) {
        await updateDoc(doc(db, 'users', user.uid), { cancelAtPeriodEnd: false });
        toast.success('Subscription reactivated! Your plan will continue to renew automatically.');
      } else {
        toast.error(data.error || 'Failed to reactivate subscription');
      }
    } catch {
      toast.error('Could not connect to server');
    } finally {
      setIsReactivating(false);
    }
  };

  const handleChangePlan = async () => {
    if (!changePlanTarget || !user?.stripeSubscriptionId) return;
    setIsChangingPlan(true);
    try {
      const basePrice = changePlanTarget.price;
      const convertedAmount = CurrencyService.convert(basePrice);
      const amountInCents = Math.round((convertedAmount ?? basePrice) * 100);
      const currency = CurrencyService.getCurrentCurrency().code.toLowerCase();

      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      const res = await fetch('/api/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          subscriptionId: user.stripeSubscriptionId,
          planId: changePlanTarget.id,
          planName: changePlanTarget.name,
          amount: amountInCents,
          currency,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const periodEnd = data.currentPeriodEnd
          ? new Date(data.currentPeriodEnd * 1000).toISOString()
          : new Date(Date.now() + changePlanTarget.durationDays * 24 * 60 * 60 * 1000).toISOString();
        await updateDoc(doc(db, 'users', user.uid), {
          planId: changePlanTarget.id,
          subscriptionEndsAt: periodEnd,
        });
        setShowChangePlanConfirm(false);
        setChangePlanTarget(null);
        toast.success(`Successfully switched to the ${changePlanTarget.name} plan!`);
      } else {
        toast.error(data.error || 'Failed to change plan');
      }
    } catch {
      toast.error('Could not connect to server');
    } finally {
      setIsChangingPlan(false);
    }
  };

  return (
    <>
    {/* Cancel / Retention Dialog */}
    <AnimatePresence>
      {showCancelDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            key={cancelStep}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-md bg-app-surface border border-app-primary/20 rounded-3xl p-8 shadow-2xl space-y-6"
          >
            {cancelStep === 'offer' ? (
              <>
                <div className="w-14 h-14 bg-app-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                  <span className="text-3xl">🎁</span>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-app-text">Wait! Before you cancel…</h3>
                  <p className="text-app-text-muted text-sm leading-relaxed">
                    We'd hate to see you go. As a valued member, we'd like to offer you{' '}
                    <span className="font-bold text-app-primary">10% off your next billing cycle</span>{' '}
                    to keep your PTENinja subscription.
                  </p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleApplyRetentionDiscount}
                    disabled={isApplyingDiscount}
                    className="w-full py-3 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isApplyingDiscount ? <Loader2 className="animate-spin" size={18} /> : '🎉'}
                    {isApplyingDiscount ? 'Applying discount…' : 'Keep Plan & Save 10%'}
                  </button>
                  <button
                    onClick={() => setCancelStep('confirm')}
                    disabled={isApplyingDiscount}
                    className="w-full py-3 bg-transparent text-app-text-muted text-sm font-medium rounded-xl hover:text-app-text transition-all"
                  >
                    No thanks, still cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
                  <AlertCircle className="text-red-500" size={28} />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-app-text">Cancel Subscription?</h3>
                  <p className="text-app-text-muted text-sm leading-relaxed">
                    Your subscription will remain active until{' '}
                    <span className="font-bold text-app-text">
                      {user?.subscriptionEndsAt
                        ? new Date(user.subscriptionEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                        : 'the end of your billing period'}
                    </span>. No further charges will be made after that date.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowCancelDialog(false); setCancelStep('offer'); }}
                    className="flex-1 py-3 bg-app-bg border border-app-primary/20 text-app-text font-bold rounded-xl hover:border-app-primary transition-all"
                  >
                    Keep Subscription
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={isCanceling}
                    className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCanceling ? <Loader2 className="animate-spin" size={18} /> : 'Yes, Cancel'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* Change Plan Confirmation Dialog */}
    <AnimatePresence>
      {showChangePlanConfirm && changePlanTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-md bg-app-surface border border-app-primary/20 rounded-3xl p-8 shadow-2xl space-y-6"
          >
            {(() => {
              const currentIndex = SUBSCRIPTION_PLANS.findIndex(p => p.id === user?.planId);
              const targetIndex = SUBSCRIPTION_PLANS.findIndex(p => p.id === changePlanTarget.id);
              const isUpgrade = targetIndex > currentIndex;
              return (
                <>
                  <div className="w-14 h-14 bg-app-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                    <span className="text-3xl">{isUpgrade ? '🚀' : '🔄'}</span>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold text-app-text">
                      {isUpgrade ? 'Upgrade' : 'Downgrade'} to {changePlanTarget.name}?
                    </h3>
                    <p className="text-app-text-muted text-sm leading-relaxed">
                      {isUpgrade
                        ? `You'll be charged a prorated amount for the remainder of your current billing period, then ${changePlanTarget.name} pricing going forward.`
                        : `Your plan will switch to ${changePlanTarget.name} immediately. Any unused time will be credited toward your next invoice.`}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowChangePlanConfirm(false); setChangePlanTarget(null); }}
                      className="flex-1 py-3 bg-app-bg border border-app-primary/20 text-app-text font-bold rounded-xl hover:border-app-primary transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleChangePlan}
                      disabled={isChangingPlan}
                      className="flex-1 py-3 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isChangingPlan ? <Loader2 className="animate-spin" size={18} /> : `Confirm ${isUpgrade ? 'Upgrade' : 'Downgrade'}`}
                    </button>
                  </div>
                </>
              );
            })()}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-center gap-6 bg-app-surface p-6 md:p-8 rounded-3xl border border-app-primary/20">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-app-primary to-app-accent p-1 shrink-0">
          <div className="w-full h-full rounded-full bg-app-bg flex items-center justify-center overflow-hidden">
            {user?.displayName ? (
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&size=128&background=${isDarkMode ? '45A29E' : '0D9488'}&color=${isDarkMode ? '0B0C10' : 'FFFFFF'}`} alt="User" className="w-full h-full object-cover" />
            ) : (
              <User size={40} className="text-app-primary md:w-12 md:h-12" />
            )}
          </div>
        </div>
        <div className="flex-1 text-center sm:text-left min-w-0">
          <h2 className="text-2xl md:text-3xl font-bold text-app-text truncate">{user?.displayName || 'Sensei'}</h2>
          <p className="text-app-text-muted truncate text-sm md:text-base">{user?.email || 'Guest User'}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 md:gap-3 mt-3">
            <span className={cn("px-3 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase tracking-widest", getStatusColor())}>
              {user?.subscriptionStatus}
            </span>
            {(isTrial || isGuest) && (
              <>
                <span className="text-[10px] md:text-xs text-app-text-muted/70 font-medium">
                  {getRemainingDays()} day{getRemainingDays() !== 1 ? 's' : ''} remaining
                </span>
                <button
                  onClick={onUpgrade}
                  className="flex items-center gap-1.5 px-3 py-1 bg-app-primary text-app-bg text-[10px] md:text-xs font-black uppercase tracking-widest rounded-full hover:bg-app-accent transition-all shadow-sm shadow-app-primary/20"
                >
                  <Zap size={10} className="fill-current" />
                  Upgrade
                </button>
              </>
            )}
          </div>
        </div>
        <button 
          onClick={async () => {
            if(window.confirm('Are you sure you want to delete your account? This action cannot be undone.')){
              try {
                if(auth.currentUser) await deleteUser(auth.currentUser);
                onLogout();
              } catch(e) {
                alert('Account deletion requires a recent login. Please log out, log back in, and try again.');
              }
            }
          }}
          className="p-3 md:p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all shrink-0"
          title="Delete Account"
        >
          <Trash2 className="w-5 h-5 md:w-6 md:h-6" />
        </button>
        <button 
          onClick={onLogout}
          className="p-3 md:p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all shrink-0"
        >
          <LogOut className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-app-surface p-6 md:p-8 rounded-3xl border border-app-primary/20 space-y-4 md:space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h3 className="text-lg md:text-xl font-bold text-app-text flex items-center gap-2">
              <CreditCard className="text-app-primary" size={20} /> Subscription
            </h3>
            {!isActive && (
              <button 
                onClick={onUpgrade}
                className="w-full sm:w-auto px-4 py-2 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all text-sm"
              >
                Upgrade
              </button>
            )}
          </div>

          {/* Syncing banner — shown while refreshing state after returning from Stripe portal */}
          {isSyncingPortal && (
            <div className="p-4 bg-app-primary/10 border border-app-primary/20 rounded-2xl flex items-center gap-3">
              <Loader2 className="text-app-primary shrink-0 animate-spin" size={16} />
              <p className="text-sm font-medium text-app-primary">Refreshing subscription status…</p>
            </div>
          )}

          {/* Cancels-at-period-end warning */}
          {isActive && user?.cancelAtPeriodEnd && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-start gap-3">
              <AlertCircle className="text-orange-400 shrink-0 mt-0.5" size={18} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-orange-400">Subscription Cancels Soon</p>
                <p className="text-xs text-app-text-muted mt-0.5">
                  Your access continues until{' '}
                  <span className="font-bold text-app-text">
                    {user.subscriptionEndsAt
                      ? new Date(user.subscriptionEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'the end of your billing period'}
                  </span>. No further charges will be made.
                </p>
              </div>
              <button
                onClick={handleReactivate}
                disabled={isReactivating}
                className="shrink-0 px-3 py-1.5 bg-app-primary text-app-bg text-xs font-bold rounded-lg hover:bg-app-accent transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {isReactivating ? <Loader2 className="animate-spin" size={12} /> : null}
                Reactivate
              </button>
            </div>
          )}
          
          <div className="space-y-3 md:space-y-4">
            <div className="p-4 bg-app-bg rounded-2xl border border-app-primary/10">
              <p className="text-[10px] md:text-xs text-app-text-muted/50 uppercase tracking-widest font-bold">Current Plan</p>
              <p className="text-base md:text-lg font-bold text-app-text mt-1">
                {isActive ? `${SUBSCRIPTION_PLANS.find(p => p.id === user.planId)?.name ?? user.planId} Plan` : isTrial ? '7-Day Free Trial' : isGuest ? '3-Day Guest Access' : 'No Active Plan'}
              </p>
            </div>
            
            {isActive && user?.subscriptionEndsAt && (
              <div className="p-4 bg-app-bg rounded-2xl border border-app-primary/10">
                <p className="text-[10px] md:text-xs text-app-text-muted/50 uppercase tracking-widest font-bold">
                  {user?.cancelAtPeriodEnd ? 'Expiry Date' : 'Next Renewal'}
                </p>
                <p className="text-base md:text-lg font-bold text-app-text mt-1">
                  {new Date(user.subscriptionEndsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>

          {/* Change Plan – shown for active subscribers not in a cancellation state */}
          {isActive && user?.stripeSubscriptionId && !user?.cancelAtPeriodEnd && (() => {
            const currentIndex = SUBSCRIPTION_PLANS.findIndex(p => p.id === user.planId);
            const otherPlans = SUBSCRIPTION_PLANS.filter((_, i) => i !== currentIndex);
            if (!otherPlans.length) return null;
            return (
              <div className="space-y-2">
                <p className="text-[10px] md:text-xs text-app-text-muted/50 uppercase tracking-widest font-bold px-1">Change Plan</p>
                <div className="space-y-2">
                  {otherPlans.map((plan) => {
                    const planIndex = SUBSCRIPTION_PLANS.findIndex(p => p.id === plan.id);
                    const isUpgrade = planIndex > currentIndex;
                    return (
                      <button
                        key={plan.id}
                        onClick={() => { setChangePlanTarget(plan); setShowChangePlanConfirm(true); }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-app-bg border border-app-primary/10 rounded-xl hover:border-app-primary/40 hover:bg-app-primary/5 transition-all text-sm"
                      >
                        <span className="font-bold text-app-text">{plan.name}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isUpgrade ? 'bg-green-500/10 text-green-500' : 'bg-app-primary/10 text-app-primary'}`}>
                          {isUpgrade ? '↑ Upgrade' : '↓ Downgrade'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Subscription management actions */}
          {isActive && (
            <div className="space-y-3 pt-2">
              {user?.stripeCustomerId && (
                <button
                  onClick={handleManageBilling}
                  disabled={isOpeningPortal}
                  aria-label={isOpeningPortal ? 'Opening billing portal…' : 'Manage billing and invoices'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-app-primary/10 text-app-primary font-bold rounded-xl hover:bg-app-primary hover:text-app-bg transition-all text-sm disabled:opacity-50"
                >
                  {isOpeningPortal ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
                  {isOpeningPortal ? <span>Opening Portal…</span> : <span>Manage Billing &amp; Invoices</span>}
                </button>
              )}
              {!user?.cancelAtPeriodEnd && (
                <button
                  onClick={() => { setCancelStep('offer'); setShowCancelDialog(true); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-500 font-bold rounded-xl hover:bg-red-500/20 transition-all text-sm"
                >
                  <X size={16} />
                  Cancel Subscription
                </button>
              )}
            </div>
          )}

          {/* Legal notice about card storage */}
          {isActive && (
            <p className="text-[10px] text-app-text-muted/40 leading-relaxed">
              Payments and card details are managed securely by Stripe. PTENinja does not store your card number.{' '}
              <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-app-text-muted">Stripe Privacy Policy</a>
            </p>
          )}
        </div>

        <div className="bg-app-surface p-6 md:p-8 rounded-3xl border border-app-primary/20 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-bold text-app-text flex items-center gap-2">
              <User className="text-app-primary" size={20} /> Personal Information
            </h3>
            {user?.phoneVerified && (
              <span className="px-2.5 py-1 bg-green-500/10 text-green-500 border border-green-500/20 text-xs font-bold rounded-lg flex items-center gap-1">
                <CheckCircle size={13} /> Verified Member
              </span>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-app-text-muted uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Your Full Name"
                className="w-full px-4 py-3 bg-app-bg border border-app-primary/20 rounded-xl focus:border-app-primary outline-none text-app-text text-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-app-text-muted uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="flex items-center justify-between px-4 py-3 bg-app-bg/50 border border-app-primary/10 rounded-xl text-sm">
                <span className="text-app-text truncate">{user?.email || 'Guest User'}</span>
                <span className="flex items-center gap-1 text-xs font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20 shrink-0">
                  <CheckCircle size={12} /> Verified
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-app-text-muted uppercase tracking-wider">
                  Contact Number
                </label>
                {isPhoneVerified && profilePhone.trim() === (user?.phoneNumber || '').trim() ? (
                  <span className="text-xs font-bold text-green-500 flex items-center gap-1">
                    <CheckCircle size={12} /> Verified
                  </span>
                ) : profilePhone.trim().length > 0 ? (
                  <span className="text-xs font-semibold text-amber-500">
                    Unverified
                  </span>
                ) : null}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => {
                    setProfilePhone(e.target.value);
                    if (isPhoneVerified) setIsPhoneVerified(false);
                    if (phoneOtpStep === 'otp') setPhoneOtpStep('idle');
                  }}
                  placeholder="Please add your phone number here"
                  className="flex-1 px-4 py-3 bg-app-bg border border-app-primary/20 rounded-xl focus:border-app-primary outline-none text-app-text text-sm transition-all"
                />
                {profilePhone.trim().length > 6 && (!isPhoneVerified || profilePhone.trim() !== (user?.phoneNumber || '').trim()) && phoneOtpStep === 'idle' && (
                  <button
                    type="button"
                    onClick={handleSendProfilePhoneOTP}
                    disabled={isSendingPhoneOtp}
                    className="px-3.5 py-2.5 bg-app-primary/10 text-app-primary hover:bg-app-primary hover:text-app-bg text-xs font-bold rounded-xl transition-all border border-app-primary/20 whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSendingPhoneOtp ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                    <span>Verify SMS</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-app-text-muted/60 mt-1">
                Enter your mobile number with country code. If updated, click Verify SMS to confirm.
              </p>

              {/* OTP Confirmation Step */}
              {phoneOtpStep === 'otp' && (
                <div className="mt-3 p-4 bg-app-primary/5 rounded-2xl border border-app-primary/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-app-primary">
                      Enter 6-Digit SMS Verification Code
                    </label>
                    <button
                      type="button"
                      onClick={() => setPhoneOtpStep('idle')}
                      className="text-xs text-app-text-muted hover:text-app-text"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={phoneOtpCode}
                      onChange={(e) => setPhoneOtpCode(e.target.value)}
                      placeholder="123456"
                      className="flex-1 px-3 py-2 bg-app-bg border border-app-primary/30 rounded-xl text-center tracking-widest font-mono text-sm font-bold text-app-text outline-none focus:border-app-primary"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyProfilePhoneOTP}
                      disabled={phoneOtpCode.length < 6 || isVerifyingPhoneOtp}
                      className="px-4 py-2 bg-app-primary text-app-bg font-bold text-xs rounded-xl disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isVerifyingPhoneOtp ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      <span>Confirm</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div id="profile-recaptcha-container"></div>

            <button
              type="submit"
              disabled={isSavingProfile}
              className="w-full py-3 bg-app-primary text-app-bg font-bold rounded-xl hover:bg-app-accent transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-app-primary/10"
            >
              {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              <span>Save Profile Changes</span>
            </button>
          </form>

          {/* Referral & Invite Section */}
          <div className="pt-6 border-t border-app-primary/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/30">
                  <Gift className="text-amber-400" size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-app-text">Invite Friends & Earn</h3>
                  <p className="text-xs text-app-text-muted">Give friends an extra 10% off when they upgrade</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-bold text-amber-500">
                <Sparkles size={12} />
                <span>10% OFF</span>
              </div>
            </div>

            <div className="bg-app-bg/60 border border-app-primary/10 rounded-2xl p-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-app-text-muted uppercase tracking-wider mb-1.5">
                  Your Unique Referral Code
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-3 bg-app-surface border border-app-primary/20 rounded-xl font-mono text-base font-extrabold text-app-primary tracking-wider select-all">
                    {userReferralCode || 'Generating...'}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    disabled={!userReferralCode}
                    className="px-4 py-3 bg-app-primary text-app-bg font-bold text-xs rounded-xl hover:bg-app-accent transition-all flex items-center gap-1.5 shrink-0 shadow-md shadow-app-primary/10 disabled:opacity-50"
                  >
                    {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={!userReferralCode}
                  className="w-full py-2.5 px-3 bg-app-surface border border-app-primary/20 text-app-text font-bold text-xs rounded-xl hover:border-app-primary transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {copiedLink ? <Check size={14} className="text-green-500" /> : <Share2 size={14} className="text-app-primary" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Invite Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  disabled={!userReferralCode}
                  className="w-full py-2.5 px-3 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold text-xs rounded-xl hover:bg-[#25D366]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <MessageCircle size={14} />
                  <span>Share on WhatsApp</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-app-primary/10 text-xs">
                <span className="text-app-text-muted">Friends Successfully Joined & Upgraded</span>
                <span className="font-bold text-app-text bg-app-surface px-2.5 py-1 rounded-lg border border-app-primary/10">
                  {user?.referralCount || 0}
                </span>
              </div>
            </div>
          </div>
          
          {/* Admin Section */}
          {user?.role === 'admin' && (
            <div className="pt-6 border-t border-app-primary/10">
              <h3 className="text-lg font-bold text-app-text flex items-center gap-2 mb-4">
                <Database className="text-app-primary" size={20} /> Admin Tools
              </h3>
              <button
                onClick={async () => {
                  const success = await seedTasksToFirestore();
                  if (success) toast.success("Tasks seeded to Firestore!");
                  else toast.error("Failed to seed tasks.");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-app-primary/10 text-app-primary font-bold rounded-xl hover:bg-app-primary hover:text-app-bg transition-all"
              >
                <Database size={18} />
                Seed Tasks to Firestore
              </button>
              <button
                onClick={onOpenAdminDashboard}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-app-primary/10 text-app-primary font-bold rounded-xl hover:bg-app-primary hover:text-app-bg transition-all mt-3"
              >
                <Shield size={18} />
                Open Admin Dashboard
              </button>
            </div>
          )}

          {/* Legal Section */}
          <div className="pt-6 border-t border-app-primary/10">
            <h3 className="text-lg font-bold text-app-text flex items-center gap-2 mb-4">
              <ShieldCheck className="text-app-primary" size={20} /> Legal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="/?policy=privacy"
                onClick={(e) => { e.preventDefault(); onNavigate('privacy'); }}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-app-surface border border-app-primary/10 text-app-text-muted font-bold rounded-xl hover:border-app-primary hover:text-app-primary transition-all cursor-pointer"
              >
                Privacy Policy
              </a>
              <a
                href="/?policy=terms"
                onClick={(e) => { e.preventDefault(); onNavigate('terms'); }}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-app-surface border border-app-primary/10 text-app-text-muted font-bold rounded-xl hover:border-app-primary hover:text-app-primary transition-all cursor-pointer"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
    </>
  );
}

function NavButton({ active, onClick, icon: Icon, label, className }: { active: boolean, onClick: () => void, icon: any, label: string, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all duration-300 relative group flex-1 md:flex-none py-1",
        active ? "text-app-primary" : "text-app-text-muted hover:text-app-text",
        className
      )}
    >
      <div className={cn(
        "p-1.5 md:p-2 rounded-xl transition-all",
        active ? "bg-app-primary/10" : "group-hover:bg-app-surface"
      )}>
        <Icon size={20} className="md:w-6 md:h-6" />
      </div>
      <span className="text-[10px] uppercase tracking-widest font-bold hidden md:block">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-indicator"
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-app-primary rounded-full"
        />
      )}
    </button>
  );
}

function MenuLink({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between p-3.5 rounded-2xl transition-all font-bold text-sm text-left group",
        active 
          ? "bg-app-primary/10 text-app-primary border border-app-primary/20 shadow-sm" 
          : "hover:bg-app-surface text-app-text-muted hover:text-app-text border border-transparent"
      )}
    >
      <div className="flex items-center gap-3.5">
        <Icon size={18} className={active ? "text-app-primary" : "text-app-text-muted group-hover:text-app-primary transition-colors"} />
        <span className="uppercase tracking-wider text-xs font-black">{label}</span>
      </div>
      {active && (
        <span className="w-1.5 h-1.5 rounded-full bg-app-primary"></span>
      )}
    </button>
  );
}
const MOCK_TESTS_PAGE_SIZE = 20;

function MockTestView({
  user,
  onStartTest,
  onBack,
  savedSessions,
  onResumeTest,
  setShowSubscriptionModal,
  setUpgradeReason
}: {
  user: UserData,
  onStartTest: (test: MockTest) => void,
  onBack: () => void,
  savedSessions?: Record<string, MockTestSavedSession> | null,
  onResumeTest: (test: MockTest, session: MockTestSavedSession) => void,
  setShowSubscriptionModal: (show: boolean) => void,
  setUpgradeReason: (reason: 'limit' | 'expired' | null) => void
}) {
  const [visibleCount, setVisibleCount] = useState(MOCK_TESTS_PAGE_SIZE);
  // Also include legacy single-session for backward compat
  const allSavedSessions: Record<string, MockTestSavedSession> = {
    ...(user.savedMockSession ? { [user.savedMockSession.testId]: user.savedMockSession } : {}),
    ...(savedSessions ?? {}),
  };
  const visibleTests = MOCK_TESTS.slice(0, visibleCount);
  const completedTestsCount = (user.mockTestResults || []).length;
  const guestLimitReached = user?.accessType === 'guest' && completedTestsCount >= 10;

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-app-text font-display tracking-tight">Mock Tests</h2>
          <p className="text-sm text-app-text-muted">{MOCK_TESTS.length} Full-length PTE Academic practice tests</p>
        </div>
        <button 
          onClick={onBack}
          className="w-full sm:w-auto p-3 bg-app-surface border border-app-primary/10 rounded-xl flex items-center justify-center gap-2 hover:bg-app-primary/10 transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="sm:hidden font-bold uppercase tracking-widest text-xs">Back to Dojo</span>
        </button>
      </div>

      {/* Resume banners for all in-progress tests */}
      {Object.values(allSavedSessions).map((savedSession) => {
        const savedTest = MOCK_TESTS.find(t => t.id === savedSession.testId);
        if (!savedTest) return null;
        const totalTasks = savedTest.sections.reduce((s, sec) => s + sec.taskIds.length, 0);
        const completedTasks = Object.keys(savedSession.taskResponses).length;
        const savedAt = new Date(savedSession.savedAt).toLocaleString();
        return (
          <motion.div
            key={savedSession.testId}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-app-primary/10 border border-app-primary/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-app-primary/20 rounded-xl flex items-center justify-center shrink-0">
                <RotateCcw className="text-app-primary" size={20} />
              </div>
              <div>
                <p className="font-bold text-app-text text-sm">{savedTest.title} — In Progress</p>
                <p className="text-xs text-app-text-muted mt-0.5">
                  {completedTasks} of {totalTasks} tasks completed · Saved {savedAt}
                </p>
              </div>
            </div>
            <button
              onClick={() => onResumeTest(savedTest, savedSession)}
              className="shrink-0 w-full sm:w-auto px-5 py-2.5 bg-app-primary text-app-bg rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-app-accent transition-all flex items-center justify-center gap-2"
            >
              <Play size={14} fill="currentColor" /> Resume Test
            </button>
          </motion.div>
        );
      })}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleTests.map((test, index) => {
          const isCompleted = user.mockTestResults?.some(r => r.testId === test.id);
          const bestScore = user.mockTestResults?.filter(r => r.testId === test.id).reduce((max, r) => Math.max(max, r.overallScore), 0) || 0;
          const isInProgress = !!allSavedSessions[test.id];
          const isLockedForGuest = guestLimitReached && !isCompleted && !isInProgress;

          return (
            <motion.div
              key={test.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(index, 4) * 0.05 }}
              className={cn(
                "group relative bg-app-surface border rounded-3xl p-6 transition-all overflow-hidden",
                isLockedForGuest ? "border-app-primary/10 opacity-60" : (isInProgress ? "border-app-primary/40 ring-1 ring-app-primary/20" : "border-app-primary/10 hover:border-app-primary/30")
              )}
            >
              <div className="absolute top-0 right-0 p-4">
                {isInProgress ? (
                  <div className="flex items-center gap-1 text-app-primary bg-app-primary/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                    <Save size={12} />
                    In Progress
                  </div>
                ) : isCompleted ? (
                  <div className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                    <Check size={12} />
                    Completed
                  </div>
                ) : (
                  <div className="text-app-primary/40 text-[10px] font-bold uppercase tracking-widest">
                    Test {index + 1}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="w-12 h-12 bg-app-primary/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Trophy className="text-app-primary" size={24} />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-app-text mb-1">{test.title}</h3>
                  <p className="text-xs text-app-text-muted line-clamp-2">{test.description}</p>
                </div>

                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-app-text-muted">
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-app-primary" />
                    {test.sections.reduce((sum, s) => sum + s.duration, 0)} MINS
                  </div>
                  <div className="flex items-center gap-1">
                    <Target size={12} className="text-app-primary" />
                    {test.sections.reduce((sum, s) => sum + s.taskIds.length, 0)} TASKS
                  </div>
                </div>

                {isCompleted && (
                  <div className="pt-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-1">
                      <span className="text-app-text-muted">Best Score</span>
                      <span className="text-app-primary">{bestScore}</span>
                    </div>
                    <div className="h-1 bg-app-bg rounded-full overflow-hidden">
                      <div className="h-full bg-app-primary" style={{ width: `${bestScore}%` }} />
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (isLockedForGuest) {
                      setUpgradeReason('limit');
                      setShowSubscriptionModal(true);
                    } else if (isInProgress) {
                      onResumeTest(test, allSavedSessions[test.id]);
                    } else {
                      onStartTest(test);
                    }
                  }}
                  disabled={isLockedForGuest}
                  className={cn(
                    "w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all shadow-lg",
                    isLockedForGuest ? "bg-gray-500/10 text-gray-400 cursor-not-allowed border border-gray-500/20" :
                    (isInProgress ? "bg-app-primary text-app-bg hover:bg-app-accent shadow-app-primary/10 flex items-center justify-center gap-2" : "bg-app-primary text-app-bg hover:bg-app-accent shadow-app-primary/10")
                  )}
                >
                  {isLockedForGuest ? <><Lock size={14} /> Limit Reached</> : (isInProgress ? <><RotateCcw size={14} /> Resume Test</> : isCompleted ? 'Retake Test' : 'Start Mock Test')}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
      {visibleCount < MOCK_TESTS.length && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setVisibleCount(c => c + MOCK_TESTS_PAGE_SIZE)}
            className="px-8 py-3 bg-app-surface border border-app-primary/20 rounded-2xl font-bold text-sm uppercase tracking-widest text-app-primary hover:bg-app-primary/10 transition-all"
          >
            Load More ({MOCK_TESTS.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

function MockTestSession({ 
  test, 
  allTasks,
  onFinish, 
  onClose,
  onSaveAndExit,
  savedSession,
}: { 
  test: MockTest, 
  allTasks: PTETask[],
  onFinish: (result: MockTestResult) => void, 
  onClose: () => void,
  onSaveAndExit: (session: MockTestSavedSession | null, testId?: string) => Promise<void>,
  savedSession?: MockTestSavedSession | null,
}) {
  const [phase, setPhase] = useState<'instructions' | 'personal-intro' | 'section-instructions' | 'testing' | 'calculating'>(
    savedSession ? 'section-instructions' : 'instructions'
  );
  const [currentSectionIndex, setCurrentSectionIndex] = useState(savedSession?.sectionIndex ?? 0);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(savedSession?.taskIndex ?? 0);
  const [sectionTimeLeft, setSectionTimeLeft] = useState(
    savedSession?.sectionTimeLeft ?? (test.sections[savedSession?.sectionIndex ?? 0]?.duration ?? 60) * 60
  );
  const [taskResponses, setTaskResponses] = useState<Record<string, string>>(savedSession?.taskResponses ?? {});
  // Ref mirrors taskResponses so handleCompleteTest always reads the latest value,
  // avoiding a stale-closure bug when the last task's setState hasn't flushed yet.
  const taskResponsesRef = useRef<Record<string, string>>(savedSession?.taskResponses ?? {});
  const [taskScores, setTaskScores] = useState<Record<string, number>>({});
  const [calculationProgress, setCalculationProgress] = useState(0);
  const [finalResult, setFinalResult] = useState<MockTestResult | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  // Ref flag set by the section timer so we can call handleNextSection outside the
  // setSectionTimeLeft updater (side-effects in state updaters are not safe).
  const timerExpiredRef = useRef(false);
  // Guard against double invocations of handleCompleteTest (e.g. timer + user click race).
  const isCompletingRef = useRef(false);
  // Debounce ref for auto-save
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build an O(1) lookup map to avoid scanning 10K+ tasks on every navigation.
  const taskMap = useMemo(() => {
    const map: Record<string, PTETask> = {};
    for (const t of allTasks) map[t.id] = t;
    return map;
  }, [allTasks]);

  const currentSection = test.sections[currentSectionIndex];
  const currentTaskId = currentSection.taskIds[currentTaskIndex];
  const currentTask = taskMap[currentTaskId]!;

  const personalIntroTask: PTETask = {
    id: 'personal-intro',
    title: 'Personal Introduction',
    category: 'Personal Introduction',
    description: 'Introduce yourself to the institutions. This is not scored.',
    section: 'speaking',
    type: 'speaking',
    prepTime: 25,
    recordingTime: 30,
    prompt: 'Please read the prompt below and give a personal introduction. You should speak about your reasons for taking the test, your interests, your future plans, and why you want to study or work in an English-speaking country.'
  };

  useEffect(() => {
    if (phase !== 'testing') return;
    timerExpiredRef.current = false;
    const timer = setInterval(() => {
      setSectionTimeLeft(prev => {
        if (prev <= 1) {
          // Mark expiry via ref so the effect below can advance the section safely.
          timerExpiredRef.current = true;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [currentSectionIndex, phase]);

  // Advance to the next section when the timer hits zero.
  // Keeping this in a separate effect avoids calling handleNextSection() inside the
  // setSectionTimeLeft updater, which is not safe for side-effects.
  // `phase` is included in deps so the check `phase === 'testing'` always reflects
  // the latest value.
  useEffect(() => {
    if (timerExpiredRef.current && sectionTimeLeft === 0 && phase === 'testing') {
      timerExpiredRef.current = false;
      handleNextSection();
    }
  // `handleNextSection` and `currentSectionIndex` are omitted because their values
  // are always in sync with the render that last set sectionTimeLeft to 0 — the
  // timer can only fire once per section (guarded by timerExpiredRef).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionTimeLeft, phase]);

  // Auto-save progress after every task or section change so the user can resume.
  useEffect(() => {
    if (isCompletingRef.current) return;
    if (phase !== 'testing' && phase !== 'section-instructions') return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const session: MockTestSavedSession = {
        testId: test.id,
        sectionIndex: currentSectionIndex,
        taskIndex: currentTaskIndex,
        taskResponses: taskResponsesRef.current,
        sectionTimeLeft,
        savedAt: new Date().toISOString(),
      };
      onSaveAndExit(session).catch(() => {});
    }, 800);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // Auto-save progress after every task or section change so the user can resume.
  // `test.id` and `onSaveAndExit` never change for a mounted session instance, so
  // omitting them from deps is safe. `sectionTimeLeft` is intentionally excluded —
  // we don't want to re-save on every timer tick, only on meaningful navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTaskIndex, currentSectionIndex]);

  const handleNextSection = () => {
    if (currentSectionIndex < test.sections.length - 1) {
      setCurrentSectionIndex(prev => prev + 1);
      setCurrentTaskIndex(0);
      setSectionTimeLeft(test.sections[currentSectionIndex + 1].duration * 60);
      setPhase('section-instructions');
    } else {
      handleCompleteTest();
    }
  };

  const handleNextTask = (score: number, response?: string) => {
    if (phase === 'personal-intro') {
      setPhase('section-instructions');
      return;
    }

    // score may actually be a response string when TaskModal passes the raw text/audio
    // (it uses `onFinish(response as any)` for mock-test objective tasks).
    const actualResponse = typeof score === 'string' ? score : (response ?? '');

    // Update the ref first (synchronous) so handleCompleteTest always has the very
    // latest responses even when it is invoked before the setState flush completes.
    taskResponsesRef.current = { ...taskResponsesRef.current, [currentTaskId]: actualResponse };
    setTaskResponses({ ...taskResponsesRef.current });

    if (currentTaskIndex < currentSection.taskIds.length - 1) {
      setCurrentTaskIndex(prev => prev + 1);
    } else {
      handleNextSection();
    }
  };

  const handleExitClick = () => {
    // In instructions phase nothing has been attempted yet — just close
    if (phase === 'instructions') {
      onClose();
      return;
    }
    setShowExitConfirm(true);
  };

  const handleSaveAndExit = async () => {
    setIsSavingSession(true);
    try {
      const session: MockTestSavedSession = {
        testId: test.id,
        sectionIndex: currentSectionIndex,
        taskIndex: currentTaskIndex,
        taskResponses: taskResponsesRef.current,
        sectionTimeLeft,
        savedAt: new Date().toISOString(),
      };
      await onSaveAndExit(session);
      toast.success('Progress saved! You can resume this test anytime.');
    } catch {
      toast.error('Could not save progress. Please try again.');
    } finally {
      setIsSavingSession(false);
    }
    releaseGlobalMicStream();
    setShowExitConfirm(false);
    onClose();
  };

  const handleCompleteTest = async (isPartial = false) => {
    // Guard against double invocations (e.g. simultaneous timer expiry + user click).
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;
    // Cancel any pending auto-save debounce; we'll clear the session properly below.
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setPhase('calculating');
    const sectionScores: Record<PTESection, number> = {
      speaking: 0,
      writing: 0,
      reading: 0,
      listening: 0
    };

    const allTaskIds = test.sections.flatMap(s => s.taskIds);
    const totalTasks = allTaskIds.length;
    const scores: Record<string, number> = {};

    // Score a single task and return its numeric score.
    const scoreOneTask = async (taskId: string): Promise<number> => {
      const task = taskMap[taskId]!;
      const response = taskResponsesRef.current[taskId];
      if (!response) return 10;

      try {
        if (task.section === 'speaking') {
          const result = await analyzeSpeaking(response, task.category, 'audio/webm', task.correctAnswers?.[0]);
          return (result as { overall?: number }).overall ?? 70;
        } else if (task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') {
          const result = await analyzeWriting(response, task.title);
          return result.overall ?? 70;
        } else {
          // Local scoring for objective tasks
          let score = 10;
          if (task.category.includes('Fill in the Blanks')) {
            const blankAnswers = JSON.parse(response);
            const answers = Object.values(blankAnswers);
            const correct = task.correctAnswers || [];
            const maxScore = Math.max(correct.length, 1);
            let correctCount = 0;
            correct.forEach((ans, j) => {
              if (answers[j]?.toString().toLowerCase().trim() === ans.toLowerCase().trim()) correctCount++;
            });
            score = correctCount === 0 ? 10 : Math.round((correctCount / maxScore) * 80) + 10;
          } else if (task.category.includes('Multiple Choice') || task.category === 'Highlight Correct Summary' || task.category === 'Select Missing Word') {
            const selectedOptions = JSON.parse(response);
            const correct = task.correctAnswers || [];
            const isMultiple = task.category.includes('Multiple Answer');
            const maxScore = isMultiple ? Math.max(correct.length, 1) : 1;
            let correctSelected = 0;
            let incorrectSelected = 0;
            selectedOptions.forEach((opt: string) => {
              if (correct.includes(opt)) correctSelected++;
              else incorrectSelected++;
            });
            const netCorrect = Math.max(0, correctSelected - (isMultiple ? incorrectSelected : 0));
            score = netCorrect === 0 ? 10 : Math.max(10, Math.min(90, Math.round((netCorrect / maxScore) * 80) + 10));
          }
          return score;
        }
      } catch (err) {
        console.error(`Analysis failed for task ${taskId}:`, err);
        return 10;
      }
    };

    // Run up to 3 scoring tasks concurrently.  Each worker pulls from a shared
    // queue until it is empty — this gives ~3× speedup over the previous
    // sequential approach while staying well within Gemini's rate limits.
    let completedCount = 0;
    const taskQueue = [...allTaskIds];
    const worker = async () => {
      while (taskQueue.length > 0) {
        const taskId = taskQueue.shift();
        if (!taskId) break;
        scores[taskId] = await scoreOneTask(taskId);
        completedCount++;
        setCalculationProgress(Math.round((completedCount / totalTasks) * 100));
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));

    setCalculationProgress(100);
    setTaskScores(scores);

    test.sections.forEach(s => {
      const sectionTaskScores = s.taskIds.map(id => scores[id] || 10);
      const avg = sectionTaskScores.length > 0 ? Math.round(sectionTaskScores.reduce((a, b) => a + b, 0) / sectionTaskScores.length) : 10;
      sectionScores[s.section] = avg;
    });

    const overallScore = Math.round(Object.values(sectionScores).reduce((a, b) => a + b, 0) / 4);

    const result: MockTestResult = {
      testId: test.id,
      completedAt: new Date().toISOString(),
      sectionScores,
      overallScore,
      taskResponses: taskResponsesRef.current,
      ...(isPartial && { partial: true })
    };

    releaseGlobalMicStream();
    // Clear the saved session now that the test is complete.
    onSaveAndExit(null, test.id).catch(() => {});
    // Save the result to the database (fire-and-forget; toast fires from onFinish).
    onFinish(result);
    // Show the scorecard. This must happen AFTER onFinish is called so that the
    // parent's handleMockTestFinish no longer closes the session on its own — the
    // user dismisses the scorecard themselves via the "Back to Dojo" button.
    setFinalResult(result);
  };

  if (finalResult) {
    return (
      <div className="fixed inset-0 z-[100] bg-app-bg/95 backdrop-blur-xl flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-app-surface rounded-[2.5rem] p-8 md:p-12 border border-app-primary/20 max-w-2xl w-full text-center space-y-8 shadow-2xl"
        >
          <div className="w-20 h-20 bg-app-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Trophy className="text-app-primary" size={40} />
          </div>
          
          <div>
            <h2 className="text-3xl font-black text-app-text uppercase tracking-tight mb-2">
              {finalResult.partial ? 'Test Ended Early' : 'Test Complete!'}
            </h2>
            <p className="text-app-text-muted">
              {finalResult.partial
                ? `Here are your results for the attempted portion of ${test.title}. Unattempted tasks received the minimum score (10/90).`
                : `You've completed ${test.title}. Here is your performance summary.`}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(finalResult.sectionScores).map(([section, score]) => (
              <div key={section} className="bg-app-bg p-4 rounded-2xl border border-app-primary/10">
                <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-1">{section}</p>
                <p className="text-2xl font-black text-app-text">{score}</p>
              </div>
            ))}
          </div>

          <div className="bg-app-bg p-8 rounded-3xl border border-app-primary/20">
            <p className="text-xs font-bold text-app-text-muted uppercase tracking-widest mb-2">Overall PTE Score</p>
            <p className="text-6xl font-black text-app-accent drop-shadow-lg shadow-app-accent/30">{finalResult.overallScore}</p>
          </div>

          <button 
            onClick={onClose}
            className="w-full py-5 bg-app-primary text-app-bg rounded-2xl font-black text-lg uppercase tracking-widest hover:bg-app-accent transition-all shadow-lg shadow-app-primary/20"
          >
            Back to Dojo
          </button>
        </motion.div>
      </div>
    );
  }

  if (phase === 'calculating') {
    return (
      <div className="fixed inset-0 z-[100] bg-app-bg flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-app-surface rounded-[2.5rem] p-8 md:p-12 border border-app-primary/20 max-w-md w-full text-center space-y-8 shadow-2xl"
        >
          <div className="w-20 h-20 bg-app-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Loader2 className="text-app-primary animate-spin" size={40} />
          </div>
          
          <div>
            <h2 className="text-2xl font-black text-app-text uppercase tracking-tight mb-2">Calculating Results</h2>
            <p className="text-app-text-muted text-sm">Sensei is analyzing your performance. This may take a moment.</p>
          </div>

          <div className="space-y-4">
            <div className="h-2 bg-app-bg rounded-full overflow-hidden border border-app-primary/10">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${calculationProgress}%` }}
                className="h-full bg-app-primary shadow-[0_0_15px_rgba(69,162,158,0.5)]"
              />
            </div>
            <p className="text-xs font-bold text-app-primary uppercase tracking-widest">{calculationProgress}% Complete</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === 'instructions') {
    return (
      <div className="fixed inset-0 z-[100] bg-app-bg flex items-center justify-center p-3 sm:p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-app-surface rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 md:p-12 border border-app-primary/20 max-w-2xl w-full shadow-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-5 sm:mb-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-16 sm:h-16 bg-app-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                <Info className="text-app-primary w-5 h-5 sm:w-8 sm:h-8" />
              </div>
              <div>
                <h2 className="text-base sm:text-2xl font-black text-app-text uppercase tracking-tight leading-tight">Test Instructions</h2>
                <p className="text-app-text-muted text-xs sm:text-sm">PTE Academic Mock Test</p>
              </div>
            </div>
            <button
              onClick={handleExitClick}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-app-text-muted hover:text-red-400 hover:bg-red-400/10 border border-app-border hover:border-red-400/30 transition-all uppercase tracking-widest"
            >
              <LogOut size={14} /> Exit
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 space-y-3 sm:space-y-4 text-app-text-muted text-sm leading-relaxed pr-1">
            <p>Welcome to the PTE Academic Mock Test. This test consists of three main parts:</p>
            <ul className="space-y-2 ml-2">
              {[
                'Part 1: Speaking & Writing (54–67 minutes)',
                'Part 2: Reading (29–30 minutes)',
                'Part 3: Listening (30–43 minutes)',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-app-primary shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p>Before Part 1, you will complete a non-scored Personal Introduction. This is your chance to introduce yourself to the institutions you are applying to.</p>
            <p>Please ensure your microphone and speakers are working correctly before starting.</p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-5 sm:mt-6 sm:gap-4 shrink-0">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-3.5 sm:px-6 sm:py-5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase tracking-widest border border-app-border text-app-text-muted hover:text-app-text hover:border-app-primary/40 transition-all"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button 
              onClick={() => setPhase('personal-intro')}
              className="flex-1 py-3.5 sm:py-5 bg-app-primary text-app-bg rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg uppercase tracking-widest hover:bg-app-accent transition-all shadow-lg shadow-app-primary/20 flex items-center justify-center gap-2"
            >
              Start Test <ArrowRight size={18} />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === 'section-instructions') {
    const sectionNames: Record<string, string> = {
      speaking: 'Speaking & Writing',
      reading: 'Reading',
      listening: 'Listening'
    };

    const sectionDetails: Record<string, string> = {
      speaking: 'This section tests your ability to speak and write in English in an academic environment. You will be asked to read aloud, repeat sentences, describe images, and write an essay.',
      reading: 'This section tests your ability to read and understand academic English. You will be asked to fill in blanks, re-order paragraphs, and answer multiple-choice questions.',
      listening: 'This section tests your ability to understand spoken English in an academic environment. You will be asked to summarize spoken text, fill in blanks, and answer multiple-choice questions.'
    };

    return (
      <div className="fixed inset-0 z-[100] bg-app-bg flex items-center justify-center p-3 sm:p-4">
        {/* Exit / Save Confirmation Modal — must be included here since this is an early return */}
        {showExitConfirm && (
          <div className="absolute inset-0 z-[110] bg-app-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-app-surface rounded-3xl p-8 border border-app-primary/20 max-w-sm w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-14 h-14 bg-app-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                <LogOut className="text-app-primary" size={28} />
              </div>
              <div>
                <h3 className="text-xl font-black text-app-text uppercase tracking-tight mb-2">Pause Test?</h3>
                <p className="text-app-text-muted text-sm leading-relaxed">
                  Choose how you'd like to proceed. You can save your progress and resume later, or end the test now and view your results.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest border border-app-border text-app-text-muted hover:bg-app-bg transition-all"
                >
                  Keep Going
                </button>
                <button
                  onClick={handleSaveAndExit}
                  disabled={isSavingSession}
                  className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-app-primary text-app-bg hover:bg-app-accent transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSavingSession ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> Save &amp; Exit (Resume Later)</>}
                </button>
                <button
                  onClick={() => { setShowExitConfirm(false); handleCompleteTest(true); }}
                  className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                >
                  End Test &amp; See Results
                </button>
              </div>
            </motion.div>
          </div>
        )}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-app-surface rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 md:p-12 border border-app-primary/20 max-w-2xl w-full shadow-2xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]"
        >
          <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6 shrink-0">
            <div className="w-10 h-10 sm:w-16 sm:h-16 bg-app-primary/10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <Layout className="text-app-primary w-5 h-5 sm:w-8 sm:h-8" />
            </div>
            <div>
              <h2 className="text-base sm:text-2xl font-black text-app-text uppercase tracking-tight leading-tight">Section {currentSectionIndex + 1}</h2>
              <p className="text-app-primary font-bold text-xs sm:text-sm uppercase tracking-widest">{sectionNames[currentSection.section]}</p>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 space-y-3 sm:space-y-4 text-app-text-muted text-sm leading-relaxed pr-1">
            {savedSession && (
              <div className="bg-app-primary/10 border border-app-primary/20 rounded-xl p-3 flex items-center gap-2 text-xs text-app-primary font-bold">
                <RotateCcw size={14} /> Resuming from task {currentTaskIndex + 1} of {currentSection.taskIds.length}
              </div>
            )}
            <p className="text-base font-bold text-app-text mb-2">Instructions:</p>
            <p>{sectionDetails[currentSection.section]}</p>
            <div className="bg-app-bg p-3 sm:p-4 rounded-xl border border-app-primary/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-app-primary" />
                <span className="font-bold uppercase tracking-widest text-[10px]">Time Remaining</span>
              </div>
              <span className="text-app-text font-black">
                {Math.floor(sectionTimeLeft / 60)}:{(sectionTimeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="flex gap-3 mt-5 sm:mt-6 sm:gap-4 shrink-0">
            <button
              onClick={() => { releaseGlobalMicStream(); handleExitClick(); }}
              className="flex items-center gap-2 px-4 py-3.5 sm:px-6 sm:py-5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase tracking-widest border border-app-border text-app-text-muted hover:text-app-primary hover:bg-app-primary/10 hover:border-app-primary/30 transition-all"
            >
              <Save size={14} /> Save &amp; Exit
            </button>
            <button 
              onClick={() => setPhase('testing')}
              className="flex-1 py-3.5 sm:py-5 bg-app-primary text-app-bg rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg uppercase tracking-widest hover:bg-app-accent transition-all shadow-lg shadow-app-primary/20 flex items-center justify-center gap-2"
            >
              {savedSession ? <>Resume from Task {currentTaskIndex + 1} <RotateCcw size={18} /></> : <>Begin Section <Play size={18} /></>}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-app-bg flex flex-col">
      {/* Exit / Save Confirmation Modal */}
      {showExitConfirm && (
        <div className="absolute inset-0 z-[110] bg-app-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-app-surface rounded-3xl p-8 border border-app-primary/20 max-w-sm w-full text-center space-y-6 shadow-2xl"
          >
            <div className="w-14 h-14 bg-app-primary/10 rounded-2xl flex items-center justify-center mx-auto">
              <LogOut className="text-app-primary" size={28} />
            </div>
            <div>
              <h3 className="text-xl font-black text-app-text uppercase tracking-tight mb-2">Pause Test?</h3>
              <p className="text-app-text-muted text-sm leading-relaxed">
                Choose how you'd like to proceed. You can save your progress and resume later, or end the test now and view your results.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest border border-app-border text-app-text-muted hover:bg-app-bg transition-all"
              >
                Keep Going
              </button>
              <button
                onClick={handleSaveAndExit}
                disabled={isSavingSession}
                className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-app-primary text-app-bg hover:bg-app-accent transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSavingSession ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> Save &amp; Exit (Resume Later)</>}
              </button>
              <button
                onClick={() => { setShowExitConfirm(false); handleCompleteTest(true); }}
                className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
              >
                End Test &amp; See Results
              </button>
            </div>
          </motion.div>
        </div>
      )}
      <div className="px-6 py-4 border-b border-app-border flex items-center justify-between bg-app-bg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-app-primary rounded-xl flex items-center justify-center">
            <Trophy className="text-app-bg" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-app-text uppercase tracking-tight">{test.title}</h2>
            <div className="flex items-center gap-2 text-[10px] font-bold text-app-primary uppercase tracking-widest">
              {phase === 'personal-intro' ? (
                <span>Personal Introduction</span>
              ) : (
                <>
                  <span>Section {currentSectionIndex + 1}: {currentSection.section === 'speaking' ? 'Speaking & Writing' : currentSection.section}</span>
                  <span className="text-app-border">|</span>
                  <span>Task {currentTaskIndex + 1} of {currentSection.taskIds.length}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {(phase === 'testing' || phase === 'personal-intro') && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest mb-1">Section Time Left</span>
              <div className={cn(
                "text-2xl font-mono font-bold",
                sectionTimeLeft < 300 ? "text-red-500 animate-pulse" : "text-app-accent"
              )}>
                {Math.floor(sectionTimeLeft / 60)}:{(sectionTimeLeft % 60).toString().padStart(2, '0')}
              </div>
            </div>
          )}
          <button 
            onClick={() => { releaseGlobalMicStream(); handleExitClick(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest border border-app-border text-app-text-muted hover:text-app-primary hover:bg-app-primary/10 hover:border-app-primary/30 transition-all"
          >
            <Save size={14} /> Save &amp; Exit
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <TaskModal 
          key={phase === 'personal-intro' ? 'personal-intro' : currentTaskId}
          task={phase === 'personal-intro' ? personalIntroTask : currentTask}
          onClose={onClose}
          onFinish={handleNextTask}
          isMockTest={true}
          onMockExit={handleExitClick}
        />
      </div>
    </div>
  );
}

function Dashboard({ progress, user, allTasks, onStartTask, onHoverTask, onSelectSection, onViewRoadmap, onViewVocabulary, onViewShuriken, onViewPattern, onViewMockTests, calculateAverageScore, calculateSectionAverage, calculateStudyPlan, onSetTargetScore, onSetTestDate, onSaveToSchedule, onResetTarget, onUpgrade, setUpgradeReason }: { 
  progress: UserProgress, 
  user: any,
  allTasks: PTETask[],
  onStartTask: (task: PTETask) => void,
  onHoverTask?: (task: PTETask) => void,
  onSelectSection: (section: PTESection) => void,
  onViewRoadmap: () => void,
  onViewVocabulary: () => void,
  onViewShuriken: () => void,
  onViewPattern: () => void,
  onViewMockTests: () => void,
  calculateAverageScore: () => number,
  calculateSectionAverage: (section: PTESection) => number,
  calculateStudyPlan: () => { tasksPerDay: number, daysLeft: number } | null,
  onSetTargetScore: (score: number) => void | Promise<void>,
  onSetTestDate: (date: string) => void | Promise<void>,
  onSaveToSchedule: () => void | Promise<void>,
  onResetTarget: () => void | Promise<void>,
  onUpgrade: () => void,
  setUpgradeReason: (reason: 'limit' | 'expired' | null) => void
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const isScheduleSaved = isSaved || !!(user?.schedule && user.schedule.length > 0);
  const averageScore = calculateAverageScore();
  const studyPlan = calculateStudyPlan();
  const [tempTarget, setTempTarget] = useState<string | number>(79);
  const [tempDate, setTempDate] = useState(user?.testDate || '');
  
  const currentStreak = calculateStreak(user?.activityLog || []);
  
  // Analysis logic
  const totalTasks = allTasks.length;
  const attemptedTasks = user?.completedTasks?.length || 0;
  
  const sectionAverages = (['speaking', 'writing', 'reading', 'listening'] as PTESection[]).map(s => {
    const sectionTaskIds = allTasks.filter(t => t.section === s).map(t => t.id);
    const attempts = (user?.completedTasks || []).filter((id: string) => sectionTaskIds.includes(id)).length;
    return {
      section: s,
      average: calculateSectionAverage(s),
      attempts
    };
  });
  
  const minAverage = Math.min(...sectionAverages.map(s => s.average));
  let weakestSections = sectionAverages.filter(s => s.average === minAverage);
  const attemptedWeakest = weakestSections.filter(s => s.attempts > 0);
  
  if (attemptedWeakest.length > 0) {
    weakestSections = attemptedWeakest;
  }

  const weakestSectionIds = weakestSections.map(s => s.section);
  const weakestSectionLabel = weakestSections.length === 4 
    ? "All Sections" 
    : weakestSections.length > 2
      ? "Multiple Sections"
      : weakestSections.map(s => s.section.charAt(0).toUpperCase() + s.section.slice(1)).join(" & ") + " Section" + (weakestSections.length > 1 ? "s" : "");
  
  const highPriorityTasks = allTasks.filter(t => weakestSectionIds.includes(t.section) && !user?.completedTasks?.includes(t.id)).slice(0, 2);
  const recommendedTasks = highPriorityTasks.length > 0 ? highPriorityTasks : allTasks.slice(0, 4);

  // Per-section task counts and completed counts
  const sectionData = (['speaking', 'writing', 'reading', 'listening'] as PTESection[]).map(s => {
    const sectionTasks = allTasks.filter(t => t.section === s);
    const completedCount = sectionTasks.filter(t => (user?.completedTasks || []).includes(t.id)).length;
    return { section: s, total: sectionTasks.length, completed: completedCount };
  });
  const completedMockTests = (user?.mockTestResults || []).length;
  const totalMockTests = MOCK_TESTS.length;
  const getBelt = (score: number) => {
    if (score >= 79) return { title: 'Black Belt', next: 'Mastery' };
    if (score >= 65) return { title: 'Blue Belt', next: 'Black Belt' };
    if (score >= 50) return { title: 'Green Belt', next: 'Blue Belt' };
    if (score >= 30) return { title: 'Yellow Belt', next: 'Green Belt' };
    return { title: 'White Belt', next: 'Yellow Belt' };
  };

  const belt = getBelt(averageScore);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 px-4 md:px-0"
    >
      {/* Trial / Guest Promo Banner */}
      {(user?.subscriptionStatus === 'trial' || user?.subscriptionStatus === 'guest') && (
        <motion.button
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onUpgrade}
          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border border-app-primary/30 bg-gradient-to-r from-app-primary/10 via-app-accent/10 to-app-primary/10 hover:from-app-primary/20 hover:via-app-accent/15 hover:to-app-primary/20 transition-all group cursor-pointer text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 w-8 h-8 rounded-full bg-app-primary/20 flex items-center justify-center">
              <Zap size={16} className="text-app-primary fill-current" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm font-bold text-app-text leading-snug">
                🔥 <span className="text-app-primary">Limited-Time Offer</span> — Save up to 50% on Premium
              </p>
              <p className="text-[10px] md:text-xs text-app-text-muted/70 leading-snug mt-0.5">
                Unlock all tasks, mock tests, AI feedback & more. Tap to claim your exclusive discount.
              </p>
            </div>
          </div>

        </motion.button>
      )}

      {/* Progress Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 relative items-start">
        <div className="md:col-span-2 bg-app-surface rounded-3xl p-6 md:p-8 border border-app-primary/10 relative group z-20">
          <div className="absolute top-0 right-0 w-full h-full overflow-hidden pointer-events-none rounded-3xl">
            <div className="absolute -top-4 -right-4 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Trophy size={180} className="text-app-primary" />
            </div>
          </div>
          <div className="relative z-10">
            {progress.targetScore === 0 ? (
              <div>
                <h2 className="text-xs md:text-sm font-bold text-app-primary uppercase tracking-[0.2em] mb-4">Set Your Goal</h2>
                <div className="space-y-4">
                  <div className="relative">
                    <p className="text-app-text-muted mb-2 text-xs md:text-sm">Target PTE Score (10-90)</p>
                    <div className="relative flex items-center">
                      <input 
                        type="number" 
                        value={tempTarget}
                        onChange={(e) => {
                          setTempTarget(e.target.value);
                        }}
                        className="w-full bg-app-bg border border-app-primary/30 rounded-xl px-4 py-3 pr-12 text-app-text font-bold text-xl focus:outline-none focus:border-app-primary transition-colors"
                        min="10"
                        max="90"
                        step="1"
                      />
                      <button 
                        onClick={() => setTempTarget(79)}
                        className="absolute right-4 p-1 text-app-text-muted/50 hover:text-app-primary transition-colors"
                        title="Reset to 79"
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-app-text-muted mb-2 text-xs md:text-sm font-bold uppercase tracking-wider">Test Date</p>
                    <DatePicker 
                      value={tempDate}
                      onChange={(date) => setTempDate(date)}
                      minDate={new Date().toISOString().split('T')[0]}
                      placeholder="Select your test date"
                    />
                  </div>
                  <button 
                    onClick={async () => {
                      const score = Number(tempTarget);
                      if (!tempTarget || isNaN(score) || score < 10 || score > 90) {
                        toast.error("Please enter a target score between 10 and 90");
                        return;
                      }
                      if (!tempDate) {
                        toast.error("Please select a test date");
                        return;
                      }
                      try {
                        await onSetTargetScore(score);
                        await onSetTestDate(tempDate);
                      } catch (error) {
                        // Error is already handled by handleFirestoreError in the parent
                        console.error("Goal setting error:", error);
                      }
                    }}
                    className="w-full py-4 bg-app-primary text-app-bg rounded-xl font-bold uppercase tracking-widest hover:bg-app-accent transition-all shadow-lg shadow-app-primary/20"
                  >
                    Create My Study Plan
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xs md:text-sm font-bold text-app-primary uppercase tracking-[0.2em] mb-2">Current Average</h2>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl md:text-6xl font-black text-app-text">{averageScore}</span>
                      <span className="text-lg md:text-xl text-app-text-muted">/ 90</span>
                    </div>
                  </div>
                  <button 
                    onClick={onResetTarget}
                    className="p-2 text-app-text-muted/50 hover:text-red-400 transition-colors"
                    title="Reset Goal"
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>

                <div className="w-full h-2 md:h-3 bg-app-bg rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(averageScore / 90) * 100}%` }}
                    className="h-full bg-gradient-to-r from-app-primary to-app-accent shadow-md shadow-app-primary/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-app-bg/50 rounded-2xl border border-app-primary/10">
                    <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-1">Target</p>
                    <p className="text-xl font-black text-app-text">{progress.targetScore}</p>
                  </div>
                  <div className="p-4 bg-app-bg/50 rounded-2xl border border-app-primary/10">
                    <p className="text-[10px] font-bold text-app-primary uppercase tracking-widest mb-1">Days Left</p>
                    <p className="text-xl font-black text-app-text">{studyPlan?.daysLeft || 0}</p>
                  </div>
                </div>

                {studyPlan && studyPlan.daysLeft > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-app-accent/5 border border-app-accent/20 rounded-2xl">
                      <div className="flex items-center gap-3 mb-2">
                        <Calendar className="text-app-accent" size={18} />
                        <p className="text-sm font-bold text-app-text">Daily Study Plan</p>
                      </div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-2xl font-black text-app-accent">{studyPlan.tasksPerDay}</span>
                        <span className="text-xs text-app-text-muted uppercase tracking-wider font-bold">Tasks / Day</span>
                      </div>
                      <p className="text-[10px] md:text-xs text-app-text-muted leading-relaxed">
                        Complete these tasks daily to reach your goal of {progress.targetScore} by {new Date(user.testDate).toLocaleDateString()}.
                      </p>
                      <button
                        onClick={async () => {
                          setIsSaving(true);
                          try {
                            await onSaveToSchedule();
                            setIsSaved(true);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        disabled={isSaving || isScheduleSaved}
                        className={cn(
                          "mt-3 w-full py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
                          isSaving || isScheduleSaved
                            ? "bg-app-primary/30 text-app-bg/40 cursor-not-allowed" 
                            : "bg-app-accent text-app-bg hover:bg-app-primary"
                        )}
                      >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
                        {isSaving ? 'Saving...' : isScheduleSaved ? 'Saved to Schedule' : 'Save to Schedule'}
                      </button>
                      {isScheduleSaved && (
                        <button
                          onClick={onViewRoadmap}
                          className={cn(
                            "mt-2 w-full py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2",
                            isSaved
                              ? "bg-app-accent text-app-bg hover:bg-app-primary border border-transparent"
                              : "bg-app-surface text-app-primary hover:bg-app-primary/10 border border-app-primary/20"
                          )}
                        >
                          <Map size={14} />
                          View Full Schedule
                        </button>
                      )}
                    </div>

                    <div className="p-4 bg-app-primary/5 border border-app-primary/20 rounded-2xl">
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Flame className="text-orange-500 shrink-0" size={18} />
                          <p className="text-sm font-bold text-app-text truncate">Study Streak</p>
                        </div>
                        <span className="text-xs font-bold text-app-primary shrink-0">{currentStreak} / {studyPlan.daysLeft + currentStreak} Days</span>
                      </div>
                      
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 7 }).map((_, i) => {
                          const date = new Date();
                          date.setDate(date.getDate() - (6 - i));
                          const dateStr = getLocalDateStr(date);
                          const isLogged = user?.activityLog?.includes(dateStr);
                          const isToday = i === 6;
                          
                          return (
                            <div key={i} className="flex flex-col items-center gap-1">
                              <div className={cn(
                                "w-full aspect-square rounded-lg flex items-center justify-center border transition-all",
                                isLogged 
                                  ? "bg-app-primary border-app-primary text-app-bg" 
                                  : "bg-app-bg border-app-primary/20 text-app-text-muted",
                                isToday && !isLogged && "border-dashed border-orange-500/50"
                              )}>
                                {isLogged ? <Check size={12} strokeWidth={3} /> : <span className="text-[10px] font-bold">{date.getDate()}</span>}
                              </div>
                              <span className="text-[8px] uppercase font-bold text-app-text-muted">
                                {date.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-app-primary via-app-surface to-app-bg rounded-3xl md:rounded-[2.5rem] p-6 md:p-10 flex flex-col justify-between border border-app-primary/20 shadow-xl shadow-app-primary/10 relative overflow-hidden group z-10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-app-primary/10 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:bg-app-primary/20 transition-all duration-700" />
          <div className="relative z-10">
            <div className="w-14 h-14 bg-app-bg/40 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 border border-app-primary/20">
              <Target size={32} className="text-app-primary" />
            </div>
            <h3 className="text-xl md:text-3xl font-black text-app-text leading-tight tracking-tight">
              Next Milestone: <br/>
              <span className="text-app-primary">{belt.next}</span>
            </h3>
            <p className="text-xs font-bold text-app-text-muted mt-3 uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-app-primary animate-pulse" />
              Current: {belt.title}
            </p>
          </div>
          <div className="relative z-10 space-y-3 mt-6 md:mt-8">
            <button 
              onClick={onViewRoadmap}
              className="w-full py-3 md:py-4 bg-app-text text-app-bg rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-app-accent hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-xl"
            >
              View Roadmap
            </button>
            <button 
              onClick={onViewPattern}
              className="w-full py-3 md:py-4 bg-app-bg/60 backdrop-blur-md text-app-text-muted border border-app-primary/20 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-app-bg hover:text-app-text transition-all duration-300"
            >
              Exam Pattern
            </button>
          </div>
        </div>
      </section>

      {/* Advanced Analysis & Vocabulary */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="bg-app-surface rounded-3xl p-6 border border-app-primary/10 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-app-text flex items-center gap-2">
              <BarChart3 className="text-app-primary" size={20} />
              Training Analysis
            </h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-app-bg rounded-2xl border border-app-primary/5">
              <p className="text-[10px] font-bold text-app-text-muted/50 uppercase tracking-widest mb-1">Attempted</p>
              <p className="text-2xl font-black text-app-text">{attemptedTasks} <span className="text-xs text-app-text-muted/30">/ {totalTasks}</span></p>
            </div>
            <div className="p-4 bg-app-bg rounded-2xl border border-app-primary/5">
              <p className="text-[10px] font-bold text-app-text-muted/50 uppercase tracking-widest mb-1">Available</p>
              <p className="text-2xl font-black text-app-primary">{totalTasks}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-app-text-muted/50 uppercase tracking-widest">Section Performance</h4>
            {/* Speaking */}
            <button
              onClick={() => onSelectSection('speaking')}
              className="w-full text-left group p-3 bg-teal-500/5 hover:bg-teal-500/10 border border-teal-500/20 hover:border-teal-500/40 rounded-2xl transition-all duration-200"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wide">Speaking</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-app-text-muted">
                    {sectionData.find(d => d.section === 'speaking')!.completed}/{sectionData.find(d => d.section === 'speaking')!.total} done
                  </span>
                  <span className="text-[10px] font-mono text-teal-500">
                    {sectionAverages.find(s => s.section === 'speaking')!.attempts > 0 ? `${Math.round(sectionAverages.find(s => s.section === 'speaking')!.average)}/90` : 'No attempts'}
                  </span>
                  <ChevronRight size={12} className="text-teal-500/40 group-hover:text-teal-400 transition-colors" />
                </div>
              </div>
              <div className="h-1.5 w-full bg-teal-500/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${sectionData.find(d => d.section === 'speaking')!.total > 0 ? Math.max((sectionData.find(d => d.section === 'speaking')!.completed / sectionData.find(d => d.section === 'speaking')!.total) * 100, sectionData.find(d => d.section === 'speaking')!.completed > 0 ? 2 : 0) : 0}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-teal-500"
                />
              </div>
            </button>
            {/* Writing */}
            <button
              onClick={() => onSelectSection('writing')}
              className="w-full text-left group p-3 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/20 hover:border-orange-500/40 rounded-2xl transition-all duration-200"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">Writing</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-app-text-muted">
                    {sectionData.find(d => d.section === 'writing')!.completed}/{sectionData.find(d => d.section === 'writing')!.total} done
                  </span>
                  <span className="text-[10px] font-mono text-orange-500">
                    {sectionAverages.find(s => s.section === 'writing')!.attempts > 0 ? `${Math.round(sectionAverages.find(s => s.section === 'writing')!.average)}/90` : 'No attempts'}
                  </span>
                  <ChevronRight size={12} className="text-orange-500/40 group-hover:text-orange-400 transition-colors" />
                </div>
              </div>
              <div className="h-1.5 w-full bg-orange-500/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${sectionData.find(d => d.section === 'writing')!.total > 0 ? Math.max((sectionData.find(d => d.section === 'writing')!.completed / sectionData.find(d => d.section === 'writing')!.total) * 100, sectionData.find(d => d.section === 'writing')!.completed > 0 ? 2 : 0) : 0}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-orange-500"
                />
              </div>
            </button>
            {/* Reading */}
            <button
              onClick={() => onSelectSection('reading')}
              className="w-full text-left group p-3 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 rounded-2xl transition-all duration-200"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">Reading</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-app-text-muted">
                    {sectionData.find(d => d.section === 'reading')!.completed}/{sectionData.find(d => d.section === 'reading')!.total} done
                  </span>
                  <span className="text-[10px] font-mono text-blue-400">
                    {sectionAverages.find(s => s.section === 'reading')!.attempts > 0 ? `${Math.round(sectionAverages.find(s => s.section === 'reading')!.average)}/90` : 'No attempts'}
                  </span>
                  <ChevronRight size={12} className="text-blue-400/40 group-hover:text-blue-400 transition-colors" />
                </div>
              </div>
              <div className="h-1.5 w-full bg-blue-500/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${sectionData.find(d => d.section === 'reading')!.total > 0 ? Math.max((sectionData.find(d => d.section === 'reading')!.completed / sectionData.find(d => d.section === 'reading')!.total) * 100, sectionData.find(d => d.section === 'reading')!.completed > 0 ? 2 : 0) : 0}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-blue-500"
                />
              </div>
            </button>
            {/* Listening */}
            <button
              onClick={() => onSelectSection('listening')}
              className="w-full text-left group p-3 bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/20 hover:border-purple-500/40 rounded-2xl transition-all duration-200"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wide">Listening</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-app-text-muted">
                    {sectionData.find(d => d.section === 'listening')!.completed}/{sectionData.find(d => d.section === 'listening')!.total} done
                  </span>
                  <span className="text-[10px] font-mono text-purple-400">
                    {sectionAverages.find(s => s.section === 'listening')!.attempts > 0 ? `${Math.round(sectionAverages.find(s => s.section === 'listening')!.average)}/90` : 'No attempts'}
                  </span>
                  <ChevronRight size={12} className="text-purple-400/40 group-hover:text-purple-400 transition-colors" />
                </div>
              </div>
              <div className="h-1.5 w-full bg-purple-500/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${sectionData.find(d => d.section === 'listening')!.total > 0 ? Math.max((sectionData.find(d => d.section === 'listening')!.completed / sectionData.find(d => d.section === 'listening')!.total) * 100, sectionData.find(d => d.section === 'listening')!.completed > 0 ? 2 : 0) : 0}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-purple-500"
                />
              </div>
            </button>
            {/* Mock Tests */}
            <button
              onClick={onViewMockTests}
              className="w-full text-left group p-3 bg-yellow-500/5 hover:bg-yellow-500/10 border border-yellow-500/20 hover:border-yellow-500/40 rounded-2xl transition-all duration-200"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Mock Tests</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-app-text-muted">
                    {completedMockTests}/{totalMockTests} done
                  </span>
                  <ChevronRight size={12} className="text-yellow-400/40 group-hover:text-yellow-400 transition-colors" />
                </div>
              </div>
              <div className="h-1.5 w-full bg-yellow-500/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${totalMockTests > 0 ? Math.max((completedMockTests / totalMockTests) * 100, completedMockTests > 0 ? 2 : 0) : 0}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full bg-yellow-500"
                />
              </div>
            </button>
          </div>

          <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-orange-500/50 uppercase tracking-widest">{attemptedTasks === 0 ? "Get Started" : "Needs Improvement"}</p>
              <p className="text-sm font-bold text-app-text capitalize">{weakestSectionLabel}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-app-surface rounded-3xl p-6 border border-app-primary/10 flex flex-col">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-app-text flex items-center gap-2">
                  <Book className="text-app-primary" size={20} />
                  Vocabulary Builder
                </h3>
                <span className="px-2 py-1 bg-app-primary/10 text-app-primary text-[10px] font-bold rounded-md uppercase tracking-widest">2000+ Words</span>
              </div>
              <p className="text-sm text-app-text-muted leading-relaxed">
                Master high-frequency academic words essential for PTE success. Includes meanings, context, and audio pronunciations.
              </p>
            </div>
            <button 
              onClick={onViewVocabulary}
              className="mt-6 w-full py-4 bg-app-primary text-app-bg rounded-2xl font-bold uppercase tracking-widest hover:bg-app-accent transition-all shadow-[0_0_20px_rgba(69,162,158,0.2)]"
            >
              Open Builder
            </button>
          </div>

          <div className="bg-app-surface rounded-3xl p-6 border border-app-primary/10 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-app-text flex items-center gap-2">
                <Zap className="text-app-primary" size={20} />
                Daily Shuriken
              </h3>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-orange-500/10 text-orange-500 text-[10px] font-bold rounded-md uppercase tracking-widest">High Priority</span>
                <button onClick={onViewShuriken} className="text-sm text-app-primary font-bold hover:underline">View All</button>
              </div>
            </div>
            <div className="space-y-4">
              {recommendedTasks.map((task) => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onClick={async () => {
                    try {
                      await onStartTask(task);
                    } catch (e) {
                      console.error("Failed to start task:", e);
                    }
                  }} 
                  onHover={() => onHoverTask?.(task)} 
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mock Tests Section */}
      <section className="bg-app-surface rounded-3xl p-8 border border-app-primary/10 relative overflow-hidden group">
        <div className="absolute -top-10 -right-10 p-10 opacity-10 group-hover:opacity-20 transition-opacity">
          <Trophy size={200} className="text-app-primary" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <Trophy className="text-app-primary" size={32} />
              <h2 className="text-3xl font-black text-app-text tracking-tight uppercase">Full Mock Tests</h2>
            </div>
            <p className="text-app-text-muted max-w-xl leading-relaxed">
              Experience the real PTE exam environment with our 500 full-length mock tests. 
              Timed sections, AI scoring, and detailed performance analysis.
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-[10px] font-bold text-app-primary uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <CheckCircle size={14} /> 500 Real Exam Papers
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} /> 2-Hour Simulation
              </div>
              <div className="flex items-center gap-2">
                <Zap size={14} /> Instant AI Results
              </div>
            </div>
          </div>
          <button 
            onClick={onViewMockTests}
            className="px-12 py-5 bg-app-primary text-app-bg rounded-2xl font-black text-lg uppercase tracking-widest hover:bg-app-accent hover:scale-105 transition-all shadow-2xl shadow-app-primary/20"
          >
            Take a Mock Test
          </button>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Speaking" value={calculateSectionAverage('speaking').toString()} color="text-app-accent" onClick={() => onSelectSection('speaking')} />
        <StatBox label="Writing" value={calculateSectionAverage('writing').toString()} color="text-orange-500" onClick={() => onSelectSection('writing')} />
        <StatBox label="Reading" value={calculateSectionAverage('reading').toString()} color="text-app-accent" onClick={() => onSelectSection('reading')} />
        <StatBox label="Listening" value={calculateSectionAverage('listening').toString()} color="text-yellow-500" onClick={() => onSelectSection('listening')} />
      </section>
    </motion.div>
  );
}

function DailyShurikenView({ user, allTasks, onBack, onStartTask, onHoverTask }: { user: any, allTasks: PTETask[], onBack: () => void, onStartTask: (task: PTETask) => void, onHoverTask?: (task: PTETask) => void }) {
  const highPriorityTasks = allTasks
    .filter(t => !user?.completedTasks?.includes(t.id))
    .slice(0, 100);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-app-surface rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="p-3 rounded-2xl bg-orange-500/10 shrink-0">
            <Zap className="text-orange-500" size={28} />
          </div>
          <h2 className="text-2xl font-bold text-app-text sm:hidden">Daily Shuriken</h2>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-app-text hidden sm:block">Daily Shuriken</h2>
          <p className="text-sm text-app-text-muted">100 High-priority tasks to boost your score across all sections</p>
        </div>
      </div>

      <div className="space-y-4">
        {highPriorityTasks.length === 0 ? (
          <div className="text-center py-20 bg-app-surface rounded-3xl border border-app-primary/10">
            <Check className="mx-auto text-app-primary mb-4" size={48} />
            <h3 className="text-xl font-bold text-app-text">All Tasks Completed!</h3>
            <p className="text-app-text-muted">You've mastered all current high-priority tasks.</p>
          </div>
        ) : (
          highPriorityTasks.map((task, index) => (
            <div key={task.id} className="flex items-center gap-2 md:gap-4 group">
              <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-app-surface border border-app-primary/20 flex items-center justify-center text-[10px] md:text-xs font-bold text-app-primary shrink-0">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <TaskCard 
                  task={task} 
                  onClick={async () => {
                    try {
                      await onStartTask(task);
                    } catch (e) {
                      console.error("Failed to start task:", e);
                    }
                  }} 
                  onHover={() => onHoverTask?.(task)} 
                />
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function WordDetailContent({ word, user, onToggleFavorite, onPlayPronunciation }: {
  word: VocabularyWord,
  user: any,
  onToggleFavorite: (id: string) => void,
  onPlayPronunciation: (word: string) => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-3xl font-black text-app-text tracking-tight">{word.word}</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => onToggleFavorite(word.id)}
            className={cn(
              "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all border",
              user?.favoriteWords?.includes(word.id)
                ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
                : "bg-white/5 border-white/10 text-app-text-muted hover:border-app-primary/50"
            )}
          >
            <Star size={20} className="md:w-6 md:h-6" fill={user?.favoriteWords?.includes(word.id) ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={() => onPlayPronunciation(word.word)}
            className="w-10 h-10 md:w-12 md:h-12 bg-app-primary/10 rounded-xl flex items-center justify-center text-app-primary hover:bg-app-primary hover:text-app-bg transition-all"
          >
            <Volume2 size={20} className="md:w-6 md:h-6" />
          </button>
        </div>
      </div>
      
      <div className="inline-block px-3 py-1 bg-app-primary/10 border border-app-primary/20 rounded-lg text-app-primary text-xs font-bold uppercase tracking-widest">
        {word.partOfSpeech}
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-bold text-app-text-muted/50 uppercase tracking-widest mb-2">Meaning</h4>
          <p className="text-app-text leading-relaxed">{word.meaning}</p>
        </div>
        <div>
          <h4 className="text-xs font-bold text-app-text-muted/50 uppercase tracking-widest mb-2">Context</h4>
          <p className="text-app-text-muted italic leading-relaxed">"{word.context}"</p>
        </div>
      </div>

      <div className="pt-6 border-t border-app-primary/10">
        <button 
          onClick={() => onToggleFavorite(word.id)}
          className={cn(
            "w-full py-4 font-bold rounded-2xl transition-all shadow-lg",
            user?.favoriteWords?.includes(word.id)
              ? "bg-app-surface text-app-primary border border-app-primary/20"
              : "bg-app-primary text-app-bg hover:bg-app-accent"
          )}
        >
          {user?.favoriteWords?.includes(word.id) ? 'Remove from Flashcards' : 'Add to Flashcards'}
        </button>
      </div>
    </div>
  );
}

function WordDetailModal({ word, user, onClose, onToggleFavorite, onPlayPronunciation }: {
  word: VocabularyWord,
  user: any,
  onClose: () => void,
  onToggleFavorite: (id: string) => void,
  onPlayPronunciation: (word: string) => void
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 bg-app-bg/90 backdrop-blur-md md:hidden overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-lg bg-app-surface border border-app-primary/20 rounded-3xl p-6 shadow-2xl relative my-auto"
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full transition-colors text-app-text-muted hover:text-app-primary z-10"
        >
          <X size={24} />
        </button>
        <div className="pt-4 pr-14">
          <WordDetailContent 
            word={word}
            user={user}
            onToggleFavorite={onToggleFavorite}
            onPlayPronunciation={onPlayPronunciation}
          />
        </div>
      </motion.div>
    </div>
  );
}

function VocabularyBuilder({ user, onBack }: { user: any, onBack: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWord, setSelectedWord] = useState<VocabularyWord | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const wordListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (wordListRef.current) {
      wordListRef.current.scrollTop = 0;
    }
  }, [searchTerm]);

  const filteredWords = PTE_VOCABULARY.filter(w => {
    const matchesSearch = !searchTerm ||
                         w.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         w.meaning.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFavorite = !showFavoritesOnly || user?.favoriteWords?.includes(w.id);
    return matchesSearch && matchesFavorite;
  }).sort((a, b) => {
    if (!searchTerm) return 0;
    const term = searchTerm.toLowerCase();
    const aStarts = a.word.toLowerCase().startsWith(term);
    const bStarts = b.word.toLowerCase().startsWith(term);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    const aWordMatch = a.word.toLowerCase().includes(term);
    const bWordMatch = b.word.toLowerCase().includes(term);
    if (aWordMatch && !bWordMatch) return -1;
    if (!aWordMatch && bWordMatch) return 1;
    return 0;
  });

  const playPronunciation = (word: string) => {
    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("Speech synthesis failed:", e);
    }
  };

  const handleToggleFavorite = async (wordId: string) => {
    if (!user?.uid) return;
    
    const currentFavorites = user.favoriteWords || [];
    const isFavorite = currentFavorites.includes(wordId);
    
    const newFavorites = isFavorite 
      ? currentFavorites.filter((id: string) => id !== wordId)
      : [...currentFavorites, wordId];

    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        favoriteWords: newFavorites 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-app-surface rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="p-3 rounded-2xl bg-app-primary/10 shrink-0">
            <BookOpen className="text-app-primary" size={28} />
          </div>
          <h2 className="text-2xl font-bold text-app-text sm:hidden">Vocabulary</h2>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-app-text hidden sm:block">Vocabulary Builder</h2>
          <p className="text-sm text-app-text-muted">Master 2000+ essential PTE words</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-muted/50" size={20} />
          <input 
            type="text" 
            placeholder="Search words or meanings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-app-surface border border-app-primary/20 rounded-2xl pl-12 pr-4 py-4 text-app-text focus:outline-none focus:border-app-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
          <button 
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all whitespace-nowrap flex items-center gap-2",
              showFavoritesOnly ? "bg-amber-500 text-app-bg border-amber-500" : "bg-app-surface text-app-text-muted border-app-primary/20 hover:border-app-primary/50"
            )}
          >
            <Star size={16} fill={showFavoritesOnly ? "currentColor" : "none"} />
            Favorites
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div ref={wordListRef} className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredWords.map(word => {
            const isFavorite = user?.favoriteWords?.includes(word.id);
            return (
              <div 
                key={word.id}
                onClick={() => setSelectedWord(word)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group cursor-pointer",
                  selectedWord?.id === word.id 
                    ? "bg-app-primary border-app-primary text-app-bg" 
                    : "bg-app-surface border-app-primary/10 text-app-text hover:border-app-primary/40"
                )}
              >
                <div className="flex items-center gap-3">
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await handleToggleFavorite(word.id);
                      } catch (err) {
                        console.error("Failed to toggle favorite:", err);
                      }
                    }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors hover:bg-white/5",
                      isFavorite ? "text-yellow-400" : "text-app-text-muted/30"
                    )}
                  >
                    <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                  <div>
                    <div className="font-bold text-lg">{word.word}</div>
                    <div className={cn("text-xs uppercase font-bold tracking-widest opacity-60", selectedWord?.id === word.id ? "text-app-bg" : "text-app-primary")}>
                      {word.partOfSpeech}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    playPronunciation(word.word);
                  }}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    selectedWord?.id === word.id ? "hover:bg-black/10" : "hover:bg-white/5"
                  )}
                >
                  <Volume2 size={20} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="bg-app-surface border border-app-primary/20 rounded-3xl p-8 sticky top-6 h-fit hidden md:block">
          {selectedWord ? (
            <WordDetailContent 
              word={selectedWord}
              user={user}
              onToggleFavorite={handleToggleFavorite}
              onPlayPronunciation={playPronunciation}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
              <div className="w-20 h-20 bg-app-bg rounded-3xl flex items-center justify-center text-app-primary/20">
                <Book size={40} />
              </div>
              <p className="text-app-text-muted/50 font-medium">Select a word to view details</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isMobile && selectedWord && (
          <WordDetailModal 
            word={selectedWord}
            user={user}
            onClose={() => setSelectedWord(null)}
            onToggleFavorite={handleToggleFavorite}
            onPlayPronunciation={playPronunciation}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PatternView({ onBack }: { onBack: () => void }) {
  const sections = [
    {
      title: "Speaking & Writing",
      duration: "54–67 minutes",
      color: "text-app-primary",
      tasks: [
        { name: "Personal Introduction", count: "1", description: "Not scored; used for security and identification." },
        { name: "Read Aloud", count: "6–7", description: "Read a short text aloud with natural fluency and pronunciation." },
        { name: "Repeat Sentence", count: "10–12", description: "Listen to a sentence and repeat it exactly." },
        { name: "Describe Image", count: "3–4", description: "Describe the information shown in an image." },
        { name: "Retell Lecture", count: "1–2", description: "Listen to a lecture and re-tell the lecture in your own words." },
        { name: "Respond to a Situation", count: "1–2", description: "Listen to a situation and give a spoken response." },
        { name: "Summarize Group Discussion", count: "1–2", description: "Listen to a group discussion and summarize it orally." },
        { name: "Answer Short Question", count: "5–6", description: "Answer a simple question with a single word or short phrase." },
        { name: "Summarize Written Text", count: "1–2", description: "Summarize a passage in one sentence (up to 75 words)." },
        { name: "Write Essay", count: "1–2", description: "Write a 200–300 word essay on a given topic in 20 minutes." }
      ]
    },
    {
      title: "Reading",
      duration: "29–30 minutes",
      color: "text-orange-500",
      tasks: [
        { name: "Reading & Writing: Fill in the Blanks", count: "5–6", description: "Select the correct words from dropdown menus in a text." },
        { name: "Multiple Choice, Multiple Answer", count: "1–2", description: "Select all correct responses from a list based on a text." },
        { name: "Re-order Paragraphs", count: "2–3", description: "Arrange text boxes in the correct logical order." },
        { name: "Reading: Fill in the Blanks", count: "4–5", description: "Drag and drop words to complete blanks in a text." },
        { name: "Multiple Choice, Single Answer", count: "1–2", description: "Select the one correct response from a list based on a text." }
      ]
    },
    {
      title: "Listening",
      duration: "30–43 minutes",
      color: "text-yellow-500",
      tasks: [
        { name: "Summarize Spoken Text", count: "1–2", description: "Listen to a lecture and write a 50–70 word summary." },
        { name: "Multiple Choice, Multiple Answer", count: "1–2", description: "Select all correct responses based on a recording." },
        { name: "Fill in the Blanks", count: "2–3", description: "Type missing words into blanks while listening to a recording." },
        { name: "Highlight Correct Summary", count: "1–2", description: "Select the paragraph that best summarizes a recording." },
        { name: "Multiple Choice, Single Answer", count: "1–2", description: "Select the one correct response based on a recording." },
        { name: "Select Missing Word", count: "1–2", description: "Select the missing word or phrase that completes a recording." },
        { name: "Highlight Incorrect Words", count: "2–3", description: "Identify words in a transcript that differ from a recording." },
        { name: "Write from Dictation", count: "3–4", description: "Listen to a sentence and type it exactly as heard." }
      ]
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-app-surface rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="p-3 rounded-2xl bg-app-primary/10 shrink-0">
            <Layout className="text-app-primary" size={28} />
          </div>
          <h2 className="text-2xl font-bold text-app-text sm:hidden">PTE Pattern</h2>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-app-text hidden sm:block">PTE Exam Pattern</h2>
          <p className="text-sm text-app-text-muted">Complete breakdown of the PTE Academic test structure</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-app-surface rounded-3xl border border-app-primary/10 overflow-hidden">
            <div className="p-6 border-b border-app-primary/10 bg-app-bg/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-8 rounded-full bg-current", section.color)} />
                <h3 className="text-xl font-bold text-app-text">{section.title}</h3>
              </div>
              <div className="px-3 py-1 bg-app-primary/10 rounded-full border border-app-primary/20">
                <span className="text-xs font-bold text-app-primary">{section.duration}</span>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {section.tasks.map((task, tIdx) => (
                  <div key={tIdx} className="flex items-start gap-4 p-4 bg-app-bg/50 rounded-2xl border border-app-primary/5 hover:border-app-primary/20 transition-all group">
                    <div className="min-w-[48px] h-12 px-2 rounded-xl bg-app-surface flex items-center justify-center font-black text-app-primary shrink-0 group-hover:bg-app-primary group-hover:text-app-bg transition-all text-[10px] whitespace-nowrap">
                      {task.count}
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-app-text group-hover:text-app-primary transition-colors">{task.name}</h4>
                      <p className="text-xs text-app-text-muted/60 leading-relaxed">{task.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-8 bg-gradient-to-br from-app-primary/20 to-transparent rounded-3xl border border-app-primary/20 text-center space-y-4">
        <ShieldCheck className="mx-auto text-app-primary" size={48} />
        <h3 className="text-2xl font-bold text-app-text">Ready to start your training?</h3>
        <p className="text-app-text-muted max-w-md mx-auto">Our AI-powered platform follows these exact patterns to ensure you are fully prepared for the actual exam.</p>
        <button 
          onClick={onBack}
          className="px-8 py-4 bg-app-primary text-app-bg font-bold rounded-2xl hover:bg-app-accent transition-all shadow-[0_0_30px_rgba(69,162,158,0.3)]"
        >
          Go to Dojo
        </button>
      </div>
    </motion.div>
  );
}

function SectionView({ section, user, allTasks, onBack, onSelectTask, onHoverTask, setShowSubscriptionModal, setUpgradeReason }: { section: PTESection, user: any, allTasks: PTETask[], onBack: () => void, onSelectTask: (task: PTETask, allTasks: PTETask[]) => void, onHoverTask?: (task: PTETask) => void, setShowSubscriptionModal: (show: boolean) => void, setUpgradeReason: (reason: 'limit') => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const tasks = allTasks.filter(t => t.section === section);
  
  // Group tasks by category
  const categories = Array.from(new Set(tasks.map(t => t.category)));
  
  const sectionInfo = {
    speaking: { icon: Mic, color: 'text-app-primary', bg: 'bg-app-primary/10' },
    writing: { icon: PenTool, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    reading: { icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    listening: { icon: Headphones, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  };

  const Icon = sectionInfo[section].icon;

  const handleBack = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else {
      onBack();
    }
  };

  const filteredTasks = selectedCategory 
    ? tasks.filter(t => t.category === selectedCategory)
    : [];

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-7xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={handleBack} className="p-2 hover:bg-app-surface rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className={cn("p-3 rounded-2xl shrink-0", sectionInfo[section].bg)}>
            <Icon className={sectionInfo[section].color} size={28} />
          </div>
          <h2 className="text-2xl font-bold text-app-text capitalize sm:hidden">
            {selectedCategory || `${section}`}
          </h2>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-app-text capitalize hidden sm:block">
            {selectedCategory || `${section} Dojo`}
          </h2>
          <p className="text-sm text-app-text-muted">
            {selectedCategory 
              ? `${filteredTasks.length} practice questions available`
              : `${categories.length} specialized task types`}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!selectedCategory ? (
          <motion.div 
            key="categories"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {categories.map(category => {
              const categoryTasks = tasks.filter(t => t.category === category);
              const completedInCategory = categoryTasks.filter(t => user?.completedTasks?.includes(t.id)).length;
              
              return (
                <button 
                  key={category}
                  onClick={() => {
                    setSelectedCategory(category);
                    // Precache only the first uncached task in this category.
                    // Subsequent tasks are precached when a task is selected.
                    // localStorage cache means this is free on repeat visits.
                    const firstUncached = categoryTasks.find(t => t.hasAudio && !globalAudioCache[t.id]);
                    if (firstUncached) preFetchAudio(firstUncached);
                  }}
                  className="flex items-center gap-4 p-6 bg-app-surface border border-app-primary/5 rounded-2xl hover:border-app-primary/40 transition-all group text-left relative overflow-hidden"
                >
                  <div className="w-12 h-12 rounded-xl bg-app-bg flex items-center justify-center group-hover:bg-app-primary transition-colors shrink-0">
                    <Icon size={24} className={cn("transition-colors", sectionInfo[section].color, "group-hover:text-app-bg")} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-app-text group-hover:text-app-accent transition-colors text-lg">{category}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-app-bg rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-app-primary" 
                          style={{ width: `${(completedInCategory / categoryTasks.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-app-text-muted font-bold">{completedInCategory}/{categoryTasks.length}</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-app-primary shrink-0" />
                </button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div 
            key="tasks"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {(() => {
              const completedTasksForCategory = (user.completedTasks || [])
                .map(taskId => allTasks.find(t => t.id === taskId && t.category === selectedCategory))
                .filter(Boolean);
              const guestLimitReached = user?.accessType === 'guest' && completedTasksForCategory.length >= 10;

              return filteredTasks.map(task => {
                  const isCompleted = user?.completedTasks?.includes(task.id);
                  const isLockedForGuest = guestLimitReached && !isCompleted;

                  return (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      isCompleted={isCompleted}
                      isLocked={isLockedForGuest}
                      onClick={() => {
                        if (isLockedForGuest) {
                          setUpgradeReason('limit');
                          setShowSubscriptionModal(true);
                        } else {
                          onSelectTask(task, filteredTasks);
                        }
                      }} 
                      onHover={() => onHoverTask?.(task)}
                    />
                  );
              });
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TaskCard({ task, isCompleted, onClick, onHover, isLocked }: { task: PTETask, isCompleted?: boolean, onClick: () => void, onHover?: () => void, isLocked?: boolean }) {
  const sectionColors = {
    speaking: "bg-rose-500/20 text-rose-500 border-rose-500/30",
    writing: "bg-sky-500/20 text-sky-500 border-sky-500/30",
    reading: "bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
    listening: "bg-violet-500/20 text-violet-500 border-violet-500/30"
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      // Speaking
      'Read Aloud': 'bg-rose-400/10 text-rose-400 border-rose-400/20',
      'Repeat Sentence': 'bg-orange-400/10 text-orange-400 border-orange-400/20',
      'Describe Image': 'bg-amber-400/10 text-amber-400 border-amber-400/20',
      'Retell Lecture': 'bg-rose-400/10 text-rose-400 border-rose-400/20',
      'Respond to a Situation': 'bg-lime-400/10 text-lime-400 border-lime-400/20',
      'Summarize Group Discussion': 'bg-green-400/10 text-green-400 border-green-400/20',
      'Answer Short Question': 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
      
      // Writing
      'Summarize Written Text': 'bg-sky-400/10 text-sky-400 border-sky-400/20',
      'Write Essay': 'bg-blue-400/10 text-blue-400 border-blue-400/20',
      
      // Reading
      'Reading & Writing: Fill in the Blanks': 'bg-teal-400/10 text-teal-400 border-teal-400/20',
      'Multiple Choice, Multiple Answer': 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20',
      'Multiple Choice, Single Answer': 'bg-indigo-400/10 text-indigo-400 border-indigo-400/20',
      'Re-order Paragraphs': 'bg-violet-400/10 text-violet-400 border-violet-400/20',
      'Reading: Fill in the Blanks': 'bg-purple-400/10 text-purple-400 border-purple-400/20',
      
      // Listening
      'Summarize Spoken Text': 'bg-fuchsia-400/10 text-fuchsia-400 border-fuchsia-400/20',
      'Fill in the Blanks': 'bg-pink-400/10 text-pink-400 border-pink-400/20',
      'Highlight Correct Summary': 'bg-rose-400/10 text-rose-400 border-rose-400/20',
      'Write from Dictation': 'bg-slate-400/10 text-slate-400 border-slate-400/20',
    };
    return colors[category] || 'bg-gray-400/10 text-gray-400 border-gray-400/20';
  };

  return (
    <button 
      onClick={() => {
        // Warm up AudioContext on user gesture
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume();
        }
        onClick();
      }}
      onMouseEnter={onHover}
      disabled={isLocked}
      className={cn(
        "flex items-center gap-3 md:gap-4 p-3 md:p-5 bg-app-surface border border-app-primary/5 rounded-2xl hover:border-app-primary/40 transition-all group text-left relative overflow-hidden w-full border-l-4",
        task.section === 'speaking' ? 'border-l-rose-500' :
        task.section === 'writing' ? 'border-l-sky-500' :
        task.section === 'reading' ? 'border-l-emerald-500' :
        'border-l-violet-500',
        isLocked && "opacity-60 cursor-not-allowed hover:border-app-primary/5"
      )}
    >
      <div className={cn(
        "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-colors shrink-0",
        isLocked ? "bg-gray-500/10 text-gray-400" :
        (isCompleted ? "bg-green-500/20 text-green-500" : "bg-app-bg text-app-primary group-hover:bg-app-primary group-hover:text-app-bg")
      )}>
        {isLocked ? <Lock size={20} /> : 
         (isCompleted ? <Check size={20} className="md:w-6 md:h-6" /> : <Play size={18} className="md:w-5 md:h-5" />)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="font-bold text-app-text group-hover:text-app-accent transition-colors truncate text-sm md:text-base">{task.title}</h4>
            {isCompleted && <span className="text-[9px] md:text-[10px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter shrink-0">Done</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              "text-[7px] md:text-[8px] px-1.5 md:px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border whitespace-nowrap",
              getCategoryColor(task.category)
            )}>
              {task.category}
            </span>
            <span className={cn(
              "text-[7px] md:text-[8px] px-1.5 md:px-2 py-0.5 rounded-full font-black uppercase tracking-widest border whitespace-nowrap",
              sectionColors[task.section]
            )}>
              {task.section}
            </span>
          </div>
        </div>
        <p className="text-[10px] md:text-xs text-app-text-muted line-clamp-1">{task.description}</p>
      </div>
      <ChevronRight size={14} className="text-app-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hidden sm:block" />
    </button>
  );
}

function StatBox({ label, value, color, onClick }: { label: string, value: string, color: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="bg-app-surface p-4 rounded-2xl border border-app-primary/5 flex flex-col items-center hover:border-app-primary/40 hover:bg-app-surface/80 transition-all group"
    >
      <span className="text-xs font-bold text-app-text-muted uppercase tracking-widest mb-1 group-hover:text-app-primary transition-colors">{label}</span>
      <span className={cn("text-2xl font-black", color)}>{value}</span>
    </button>
  );
}

const base64ToArrayBuffer = (base64: string) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Global Audio Cache and Context for near-instant playback
const globalAudioCache: Record<string, { base64: string, buffer: AudioBuffer }> = {};
let globalAudioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return globalAudioContext;
};

// --- Persistent localStorage audio cache ---
const LS_AUDIO_PREFIX = 'pte_audio_v1_';
const LS_AUDIO_MAX = 40; // maximum number of tasks to keep cached in localStorage

const lsGetAudio = (taskId: string): string | null => {
  try {
    return localStorage.getItem(LS_AUDIO_PREFIX + taskId);
  } catch { return null; }
};

const lsSetAudio = (taskId: string, base64: string) => {
  try {
    // Track insertion order in a separate LRU list so eviction is predictable
    const LRU_KEY = 'pte_audio_lru_v1';
    let lruList: string[] = [];
    try { lruList = JSON.parse(localStorage.getItem(LRU_KEY) || '[]'); } catch { lruList = []; }

    // Evict the least-recently-used (back of list) entry when at the limit
    if (lruList.length >= LS_AUDIO_MAX) {
      const evict = lruList.pop();
      if (evict) localStorage.removeItem(LS_AUDIO_PREFIX + evict);
    }
    // Insert at the front (most-recently-used)
    lruList = [taskId, ...lruList.filter(id => id !== taskId)];
    localStorage.setItem(LRU_KEY, JSON.stringify(lruList));
    localStorage.setItem(LS_AUDIO_PREFIX + taskId, base64);
  } catch { /* storage full – silently skip */ }
};

// Track in-flight prefetch promises so we never double-call Gemini for the same task
const preFetchInFlight: Record<string, Promise<void>> = {};

const preFetchAudio = (task: PTETask): Promise<void> => {
  if (!task.hasAudio) return Promise.resolve();
  // Already in memory – nothing to do
  if (globalAudioCache[task.id]) return Promise.resolve();
  // De-duplicate concurrent calls
  if (preFetchInFlight[task.id]) return preFetchInFlight[task.id];

  const work = (async () => {
    try {
      // 1. Check localStorage first – free (no API token)
      let base64 = lsGetAudio(task.id);

      // 2. Fall back to Gemini TTS only if not cached
      if (!base64) {
        const audioContent = task.transcript || task.prompt || "";
        base64 = await generateTTS(audioContent);
        if (base64) lsSetAudio(task.id, base64);
      }

      if (base64) {
        const ctx = getAudioContext();
        if (ctx) {
          try {
            const arrayBuffer = base64ToArrayBuffer(base64);
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            globalAudioCache[task.id] = { base64, buffer: audioBuffer };
            console.log(`[Audio] Global Cache: Pre-fetched and decoded task ${task.id}`);
          } catch (decodeErr) {
            // The stored base64 is corrupt — evict it so future loads don't re-use it.
            console.warn(`[Audio] Global Cache: Corrupt audio for task ${task.id}, evicting from localStorage`, decodeErr);
            try { localStorage.removeItem(LS_AUDIO_PREFIX + task.id); } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      console.error(`[Audio] Global Cache: Pre-fetch failed for task ${task.id}`, err);
    } finally {
      delete preFetchInFlight[task.id];
    }
  })();

  preFetchInFlight[task.id] = work;
  return work;
};

function TaskModal({ 
  task, 
  onClose, 
  onFinish,
  onPrev,
  onNext,
  isMockTest = false,
  onMockExit,
}: { 
  task: PTETask, 
  onClose: () => void, 
  onFinish: (score: number, response?: string) => void | Promise<void>,
  onPrev?: () => void,
  onNext?: () => void,
  isMockTest?: boolean,
  onMockExit?: () => void,
}) {
  const [phase, setPhase] = useState<'prep' | 'audio' | 'recording' | 'analyzing' | 'feedback'>(() => {
    const isListeningPrep = task.section === 'listening' || 
                           task.category === 'Repeat Sentence' || 
                           task.category === 'Answer Short Question' || 
                           task.category === 'Write from Dictation' ||
                           task.category === 'Respond to a Situation';
    
    if (isListeningPrep) return 'prep';
    return task.hasAudio ? 'audio' : (task.prepTime === 0 || task.section === 'reading' ? 'recording' : 'prep');
  });
  const [timeLeft, setTimeLeft] = useState(() => {
    if (task.category === 'Repeat Sentence' || task.category === 'Answer Short Question' || task.category === 'Write from Dictation' || task.category === 'Respond to a Situation') {
      return 3;
    }
    if (task.category === 'Summarize Spoken Text') return 12;
    if (task.section === 'listening' && task.hasAudio) return 7;
    
    if (task.hasAudio) return 0;
    if (task.prepTime === 0 || task.section === 'reading') {
      // Default recording/writing times based on latest PTE trends
      if (task.category === 'Summarize Written Text') return 600;
      if (task.category === 'Write Essay') return 1200;
      if (task.category === 'Summarize Spoken Text') return 600;
      if (task.section === 'reading') {
        if (task.category.includes('Fill in the Blanks')) return 120; // 2 mins
        if (task.category.includes('Multiple Choice')) return 90; // 1.5 mins
        if (task.category === 'Re-order Paragraphs') return 120; // 2 mins
        return 120;
      }
      if (task.section === 'listening') return 90;
      return task.recordingTime ?? 10;
    }
    return task.prepTime ?? 35;
  });
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [audioFinished, setAudioFinished] = useState(false);
  const [volume, setVolume] = useState(0);
  const [recordingStopped, setRecordingStopped] = useState(false);
  const [recordings, setRecordings] = useState<Array<{ id: string; base64: string; mimeType: string; attemptNum: number }>>([]);
  const recordingAnalyzerRef = useRef<AnalyserNode | null>(null);
  const recordingAnimationFrameRef = useRef<number | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const beepPlayedRef = useRef(false);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  // Always-current ref to handleFinish so the RAF silence-detection can call it
  const handleFinishRef = useRef<(() => void) | null>(null);

  const needsBeep = task.section === 'listening' || 
                   task.category === 'Repeat Sentence' || 
                   task.category === 'Answer Short Question' || 
                   task.category === 'Write from Dictation';
  const [hasAudioError, setHasAudioError] = useState(false);
  const [audioRetryCount, setAudioRetryCount] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showExample, setShowExample] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCut = async (e: React.MouseEvent) => {
    e.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = userInput.substring(start, end);
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        const newValue = userInput.substring(0, start) + userInput.substring(end);
        setUserInput(newValue);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start, start);
        }, 0);
      } catch (err) {
        console.error("Failed to cut:", err);
      }
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = userInput.substring(start, end);
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handlePaste = async (e: React.MouseEvent) => {
    e.preventDefault();
    const textarea = textareaRef.current;
    if (!textarea) return;
    try {
      const text = await navigator.clipboard.readText();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = userInput.substring(0, start) + text + userInput.substring(end);
      setUserInput(newValue);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + text.length, start + text.length);
      }, 0);
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [reorderedParagraphs, setReorderedParagraphs] = useState<string[]>(task.paragraphs || []);
  const [targetParagraphs, setTargetParagraphs] = useState<string[]>([]);
  const [blankAnswers, setBlankAnswers] = useState<{ [key: string]: string }>({});
  const [feedback, setFeedback] = useState<any>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(getAudioContext());

  // Speculative writing analysis: start a background Gemini call once the user
  // pauses typing for 5 s so that clicking "Submit" shows the result instantly.
  // Only used for practice mode (not mock tests which batch-score at the end).
  const speculativeWritingRef = useRef<{
    text: string;
    promise: Promise<WritingAnalysisResult | null>;
    result: WritingAnalysisResult | null;
  } | null>(null);
  const speculativeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isWritingTask = task.section === 'writing' || task.category === 'Summarize Spoken Text';

  // Helper to play a beep sound using a persistent AudioContext
  const playBeep = () => {
    return new Promise<void>((resolve) => {
      (async () => {
        try {
          const ctx = getAudioContext();
          if (!ctx) {
            resolve();
            return;
          }

          if (ctx.state === 'suspended') {
            await ctx.resume();
          }

          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);

          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, ctx.currentTime);
          gainNode.gain.setValueAtTime(0, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.01);
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

          oscillator.onended = () => {
            resolve();
          };

          oscillator.start(ctx.currentTime);
          oscillator.stop(ctx.currentTime + 0.3);
        } catch (e) {
          console.error("Beep failed", e);
          resolve();
        }
      })();
    });
  };

  useEffect(() => {
    // Reset phase and timer for new task
    const isListeningPrep = task.section === 'listening' || 
                           task.category === 'Repeat Sentence' || 
                           task.category === 'Answer Short Question' || 
                           task.category === 'Write from Dictation' ||
                           task.category === 'Respond to a Situation';
    
    const initialPhase = isListeningPrep ? 'prep' : (task.hasAudio ? 'audio' : (task.prepTime === 0 || task.section === 'reading' ? 'recording' : 'prep'));
    
    setPhase(initialPhase);
    setAudioFinished(false);
    
    let initialTime = 0;
    if (task.category === 'Repeat Sentence' || task.category === 'Answer Short Question' || task.category === 'Write from Dictation' || task.category === 'Respond to a Situation') {
      initialTime = 3; // Reset to 3s for better user experience
    } else if (task.category === 'Summarize Spoken Text') {
      initialTime = 12;
    } else if (task.section === 'listening' && task.hasAudio) {
      initialTime = 1; // Reduced from 7 to 1 for near-instant start
    } else if (task.hasAudio) {
      initialTime = 0;
    } else if (task.prepTime === 0 || task.section === 'reading') {
      if (task.category === 'Summarize Written Text') initialTime = 600;
      else if (task.category === 'Write Essay') initialTime = 1200;
      else if (task.category === 'Summarize Spoken Text') initialTime = 600;
      else if (task.section === 'reading') {
        if (task.category.includes('Fill in the Blanks')) initialTime = 120;
        else if (task.category.includes('Multiple Choice')) initialTime = 90;
        else if (task.category === 'Re-order Paragraphs') initialTime = 120;
        else initialTime = 120;
      }
      else if (task.section === 'listening') initialTime = 90;
      else initialTime = task.recordingTime ?? 10;
    } else {
      initialTime = task.prepTime ?? 35;
    }
    setTimeLeft(initialTime);

    // Shuffle paragraphs for Re-order tasks
    if (task.category === 'Re-order Paragraphs' && task.paragraphs) {
      setReorderedParagraphs([...task.paragraphs].sort(() => Math.random() - 0.5));
    } else {
      setReorderedParagraphs([]);
    }
    
    // For ROP, we also need a target list
    setTargetParagraphs([]);
    
    setHasAudioError(false);
    setAudioRetryCount(0);
    setSelectedOptions([]);
    setBlankAnswers({});
    setUserInput('');
    setRecordingStopped(false);
  }, [task.id, task.category, task.paragraphs, task.section, task.hasAudio, task.prepTime, task.recordingTime]);

  // Audio logic
  useEffect(() => {
    let isCancelled = false;
    let safetyTimeout: any = null;

    if (phase === 'audio' && task.hasAudio) {
      console.log(`[Audio] Starting audio logic for task ${task.id}`);
      
      const handleAudioEnd = () => {
        if (isCancelled) return;
        console.log("[Audio] Audio playback ended");
        setIsAudioPlaying(false);
        setIsPreparingAudio(false);
        setAudioFinished(true);
        // Pre-set timeLeft to the upcoming phase's value so there is no "0 sec" flash
        if (task.prepTime && task.prepTime > 0 && task.section === 'speaking') {
          setTimeLeft(task.prepTime);
        } else {
          if (task.category === 'Summarize Spoken Text') setTimeLeft(600);
          else if (task.section === 'listening') setTimeLeft(120);
          else setTimeLeft(task.recordingTime ?? 15);
        }
        // Small pause after audio before next phase
        setTimeout(() => {
          if (isCancelled) return;
          if (task.prepTime && task.prepTime > 0 && task.section === 'speaking') {
            setPhase('prep');
            setTimeLeft(task.prepTime);
          } else {
            setPhase('recording');
            // For listening tasks, recording time is usually until they finish typing
            if (task.category === 'Summarize Spoken Text') setTimeLeft(600);
            else if (task.section === 'listening') setTimeLeft(120);
            else setTimeLeft(task.recordingTime ?? 15);
          }
        }, 1000);
      };

      const speakFallback = (text: string) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
          handleAudioEnd();
          return;
        }
        
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        // Try to find a natural sounding English voice
        const englishVoice = voices.find(v => v.lang.startsWith('en-') && v.name.includes('Google')) || 
                            voices.find(v => v.lang.startsWith('en-')) || 
                            voices[0];
        
        if (englishVoice) utterance.voice = englishVoice;
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        
        utterance.onstart = () => {
          if (isCancelled) {
            window.speechSynthesis.cancel();
            return;
          }
          console.log("[Audio] Browser TTS started");
          setIsAudioPlaying(true);
          setIsPreparingAudio(false);
        };
        
        utterance.onend = () => {
          console.log("[Audio] Browser TTS ended");
          handleAudioEnd();
        };
        
        utterance.onerror = (err) => {
          console.error("[Audio] Browser TTS error:", err);
          handleAudioEnd();
        };
        
        window.speechSynthesis.speak(utterance);
      };

      const playAudio = async () => {
        try {
          if (isCancelled) return;
          
          setHasAudioError(false);
          setIsAudioPlaying(false);

          // --- HIGH-PERFORMANCE AUDIOBUFFER LOGIC ---
          if (globalAudioCache[task.id]) {
            console.log("[Audio] Using global cache for task ${task.id}");
            const cached = globalAudioCache[task.id];
            
            const ctx = getAudioContext();
            if (!ctx) throw new Error("AudioContext not available");
            if (ctx.state === 'suspended') await ctx.resume();
            
            const now = ctx.currentTime;
            let startTime = now;

            // Play beep if needed
            if (needsBeep && !beepPlayedRef.current) {
              console.log("[Audio] Scheduling beep and audio...");
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(1000, now);
              gain.gain.setValueAtTime(0, now);
              gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
              gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
              osc.start(now);
              osc.stop(now + 0.1);
              beepPlayedRef.current = true;
              startTime = now + 0.1; // Start audio exactly when beep ends
            }

            const source = ctx.createBufferSource();
            source.buffer = cached.buffer;
            source.connect(ctx.destination);
            audioSourceRef.current = source;
            
            source.onended = handleAudioEnd;

            source.start(startTime);
            setIsAudioPlaying(true);
            setIsPreparingAudio(false);
            if (source.buffer) {
              setTimeLeft(Math.ceil(source.buffer.duration));
            }
            return; // Exit early as we've handled playback
          }
          // --- END HIGH-PERFORMANCE LOGIC ---

          let audio = null;
          
          // If a background prefetch is already in-flight for this task, wait for it
          // before starting a second concurrent TTS call — the prefetch may populate
          // the cache and make the on-demand call unnecessary entirely.
          if (preFetchInFlight[task.id]) {
            console.log("[Audio] Background prefetch in-flight, awaiting before on-demand generation...");
            await preFetchInFlight[task.id].catch(() => {});
            if (isCancelled) return;
            // If the prefetch succeeded the cache is now populated — re-enter from top.
            if (globalAudioCache[task.id]) {
              return playAudio();
            }
          }

          console.log("[Audio] Audio not ready, setting isPreparingAudio = true");
          setIsPreparingAudio(true);

          // Resume AudioContext early so it's running before async TTS generation completes (mobile requirement)
          try {
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') await ctx.resume();
          } catch (resumeErr) {
            console.warn("[Audio] Early AudioContext resume failed:", resumeErr);
          }
          
          // Safety timeout to prevent stuck loading - increased to 35s to allow for 30s TTS timeout
          safetyTimeout = setTimeout(() => {
            if (!isCancelled) {
              console.warn("[Audio] Safety timeout reached, forcing isPreparingAudio = false");
              setIsPreparingAudio(false);
              // Only set error if we don't have a fallback or if it's really stuck
              if (!task.transcript && !task.prompt) {
                setHasAudioError(true);
              }
            }
          }, 35000);

          let base64 = null;
          try {
            if (task.audio) {
              try {
                console.log("[Audio] Attempting to fetch pre-recorded audio:", task.audio);
                const audioRes = await fetch(task.audio);
                if (!audioRes.ok) throw new Error(`HTTP error! status: ${audioRes.status}`);
                const blob = await audioRes.blob();
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve) => {
                  reader.onloadend = () => {
                    const base64data = reader.result as string;
                    resolve(base64data.split(',')[1]);
                  };
                });
                reader.readAsDataURL(blob);
                base64 = await base64Promise;
                console.log("[Audio] Pre-recorded audio fetched successfully");
              } catch (fetchErr) {
                console.warn("[Audio] Pre-recorded audio fetch failed (likely CORS), falling back to AI generation:", fetchErr);
                // Fall through to generateTTS
              }
            }
            
            if (!base64) {
              const timeoutPromise = new Promise<null>((_, reject) => 
                setTimeout(() => reject(new Error("Audio preparation timed out after 30s")), 30000)
              );

              console.log("[Audio] Starting on-demand audio generation...");
              const audioContent = task.transcript || task.prompt || "";
              base64 = await Promise.race([generateTTS(audioContent), timeoutPromise]);
            }
            
            if (base64) {
              // Decode into AudioBuffer and play via AudioBufferSourceNode (most reliable on mobile)
              try {
                const ctx = getAudioContext();
                if (ctx) {
                  if (ctx.state === 'suspended') await ctx.resume();
                  const arrayBuffer = base64ToArrayBuffer(base64);
                  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                  if (!isCancelled) {
                    // Cache it globally for future use
                    globalAudioCache[task.id] = { base64, buffer: audioBuffer };
                    console.log("[Audio] AudioBuffer decoded and cached, playing via AudioBufferSourceNode");

                    if (safetyTimeout) clearTimeout(safetyTimeout);
                    setIsPreparingAudio(false);

                    const now = ctx.currentTime;
                    let startTime = now;
                    if (needsBeep && !beepPlayedRef.current) {
                      console.log("[Audio] Scheduling beep and audio...");
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      osc.frequency.setValueAtTime(1000, now);
                      gain.gain.setValueAtTime(0, now);
                      gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
                      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                      osc.start(now);
                      osc.stop(now + 0.1);
                      beepPlayedRef.current = true;
                      startTime = now + 0.1;
                    }

                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(ctx.destination);
                    audioSourceRef.current = source;
                    source.onended = handleAudioEnd;
                    source.start(startTime);
                    setIsAudioPlaying(true);
                    setTimeLeft(Math.ceil(audioBuffer.duration));
                  }
                  return;
                }
              } catch (decodeErr) {
                console.error("[Audio] AudioBuffer decoding failed, falling back to HTML Audio", decodeErr);
              }
            }
          } catch (prepErr: any) {
            console.error("[Audio] Audio preparation failed or timed out:", prepErr);
            if (prepErr.message === "GEMINI_QUOTA_EXCEEDED" || prepErr.message?.includes("429")) {
              toast.error("AI Quota Exceeded", {
                description: "Switching to browser-native voice for this task."
              });
            } else if (prepErr.message?.includes("timed out")) {
              toast.error("Audio Generation Slow", {
                description: "Switching to browser-native voice to avoid delay."
              });
            }
            base64 = null;
          } finally {
            if (safetyTimeout) clearTimeout(safetyTimeout);
            if (!isCancelled) setIsPreparingAudio(false);
          }
          
          if (isCancelled) return;

          if (base64) {
            console.log("[Audio] Creating new Audio object from base64 (HTML Audio fallback)");
            audio = new Audio(`data:audio/wav;base64,${base64}`);
            audio.load();
          } else {
            console.log("[Audio] No base64 audio, using browser TTS fallback");
            const fallbackText = task.transcript || task.prompt || "";
            if (fallbackText) {
              if (needsBeep && !beepPlayedRef.current) {
                await playBeep();
                beepPlayedRef.current = true;
              }
              speakFallback(fallbackText);
              return;
            }
          }
          
          if (isCancelled) return;

          if (audio) {
            audioRef.current = audio;
            
            // Wait for beep to finish before starting audio
            if (needsBeep && !beepPlayedRef.current) {
              await playBeep();
              beepPlayedRef.current = true;
            }
            
            if (isCancelled) return;
            
            audio.onended = handleAudioEnd;

            audio.onerror = (e) => {
              console.error("[Audio] Audio element error:", e);
              if (!isCancelled) {
                setHasAudioError(true);
                setIsAudioPlaying(false);
                setIsPreparingAudio(false);
              }
            };

            try {
              console.log("[Audio] Calling audio.play()");
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                await playPromise;
                if (!isCancelled) {
                  console.log("[Audio] Audio playback started");
                  setIsAudioPlaying(true);
                  setIsPreparingAudio(false);
                  if (audio.duration) {
                    setTimeLeft(Math.ceil(audio.duration));
                  }
                }
              }
            } catch (playErr: any) {
              // Ignore AbortError which happens when pause() is called before play() promise resolves
              if (!isCancelled && playErr.name !== 'AbortError') {
                console.error("[Audio] Audio play failed:", playErr);
                setIsAudioPlaying(false);
                setIsPreparingAudio(false);
                setHasAudioError(true);
              }
            }
          } else {
            console.warn("[Audio] No audio object available, showing error state");
            if (!isCancelled) {
              setHasAudioError(true);
              setIsAudioPlaying(false);
              setIsPreparingAudio(false);
            }
          }
        } catch (err: any) {
          console.error("[Audio] Unexpected error in playAudio:", err);
          if (!isCancelled) {
            setHasAudioError(true);
            setIsAudioPlaying(false);
            setIsPreparingAudio(false);
          }
        }
      };

      playAudio();

      return () => {
        console.log(`[Audio] Cleaning up audio logic for task ${task.id}`);
        isCancelled = true;
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        if (safetyTimeout) clearTimeout(safetyTimeout);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (audioSourceRef.current) {
          try { audioSourceRef.current.stop(); } catch(e) {}
          audioSourceRef.current = null;
        }
        setIsAudioPlaying(false);
        setIsPreparingAudio(false);
        beepPlayedRef.current = false;
      };
    } else {
      // Ensure audio is stopped and state is reset if we're not in audio phase
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsAudioPlaying(false);
      setIsPreparingAudio(false);
      beepPlayedRef.current = false;
    }
  }, [phase, task.id, task.hasAudio, audioRetryCount, needsBeep]);

  const cleanupRecordingAnalysis = () => {
    // Clear silence auto-stop timer
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (recordingAnimationFrameRef.current) {
      cancelAnimationFrame(recordingAnimationFrameRef.current);
      recordingAnimationFrameRef.current = null;
    }
    if (recordingAnalyzerRef.current) {
      recordingAnalyzerRef.current.disconnect();
      recordingAnalyzerRef.current = null;
    }
    if (recordingAudioContextRef.current) {
      if (recordingAudioContextRef.current.state !== 'closed') {
        recordingAudioContextRef.current.close().catch(e => console.error("Failed to close recording context:", e));
      }
      recordingAudioContextRef.current = null;
    }
    if (recordingStreamRef.current) {
      // Don't stop the global mic stream here — it's kept alive between questions
      // and released only when the session ends (via releaseGlobalMicStream).
      recordingStreamRef.current = null;
    }
    setVolume(0);
  };

  // Recording logic
  useEffect(() => {
    if (phase === 'recording' && task.section === 'speaking') {
      startRecording();
    }
    return () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      cleanupRecordingAnalysis();
    };
  }, [phase]);

  // Speculative writing analysis: while the user is writing, fire off a
  // background Gemini call after 5 s of idle time.  When the user clicks Submit
  // we can serve the result instantly (or await the already-in-flight request)
  // instead of starting a brand-new API call and showing a 10–15 s spinner.
  useEffect(() => {
    if (!isWritingTask || phase !== 'recording' || isMockTest) return;
    if (!userInput || userInput.trim().length < 30) return;

    if (speculativeTimerRef.current) clearTimeout(speculativeTimerRef.current);

    speculativeTimerRef.current = setTimeout(() => {
      const textToScore = userInput;
      const promise = analyzeWriting(textToScore, task.title)
        .then(r => {
          if (speculativeWritingRef.current?.text === textToScore) {
            speculativeWritingRef.current.result = r;
          }
          return r;
        })
        .catch(() => null);
      speculativeWritingRef.current = { text: textToScore, promise, result: null };
    }, 5000);

    return () => {
      if (speculativeTimerRef.current) clearTimeout(speculativeTimerRef.current);
    };
  }, [userInput, isWritingTask, phase, isMockTest, task.title]);

  const startRecording = async () => {
    try {
      // Play beep before recording starts
      await playBeep();
      
      const stream = await getOrRequestMicStream();
      recordingStreamRef.current = stream;
      
      // Setup Audio Analysis
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const audioContext = new AudioContextClass();
      recordingAudioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      recordingAnalyzerRef.current = analyzer;
      
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      
      // Silence detection constants
      // SILENCE_AMPLITUDE_THRESHOLD: average of Uint8 frequency bin data (0-255 scale).
      // Values below 5 correspond to near-total silence or background noise floor.
      const SILENCE_AMPLITUDE_THRESHOLD = 5;
      const SILENCE_AUTO_STOP_MS = 7000; // stop after 7 s of continuous silence
      // Minimum time to record before silence auto-stop can trigger.
      // This prevents premature termination for tasks (e.g. Respond to a Situation)
      // where the user needs a few seconds to formulate their response after the beep.
      const MIN_RECORDING_BEFORE_SILENCE_STOP_MS = 12000;

      const updateVolume = () => {
        // Guard: if the analyser was already disconnected (recording stopped externally),
        // exit the loop to prevent stale RAF callbacks
        if (!recordingAnalyzerRef.current) return;

        recordingAnalyzerRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setVolume(average);

        // --- Silence auto-stop (not in mock test) ---
        if (!isMockTest) {
          const elapsedMs = Date.now() - recordingStartTimeRef.current;
          if (average < SILENCE_AMPLITUDE_THRESHOLD) {
            // Only start the silence timer after the minimum recording window has passed,
            // so users have time to begin speaking before the auto-stop can fire.
            if (elapsedMs >= MIN_RECORDING_BEFORE_SILENCE_STOP_MS && !silenceTimeoutRef.current) {
              silenceTimeoutRef.current = setTimeout(() => {
                silenceTimeoutRef.current = null;
                handleFinishRef.current?.();
              }, SILENCE_AUTO_STOP_MS);
            }
          } else {
            // Sound detected – reset silence timer
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
              silenceTimeoutRef.current = null;
            }
          }
        }
        // -----------------------------------------------

        recordingAnimationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      recorder.start();
      setMediaRecorder(recorder);
    } catch (err) {
      console.error("Failed to start recording:", err);
      toast.error("Microphone Error", {
        description: "Could not access your microphone. Please check permissions."
      });
      setPhase('prep'); // Go back to prep phase
    }
  };

  const getAudioBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!chunksRef.current || chunksRef.current.length === 0) {
        reject(new Error("No audio recorded. Please try speaking louder or check your microphone."));
        return;
      }
      const blob = new Blob(chunksRef.current, { type: mediaRecorder?.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
    });
  };

  // Timer logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (phase === 'prep' || phase === 'recording' || (phase === 'audio' && isAudioPlaying)) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (phase === 'prep') {
              // If it was a countdown before audio
              const isListeningPrep = task.section === 'listening' || 
                                     task.category === 'Repeat Sentence' || 
                                     task.category === 'Answer Short Question' || 
                                     task.category === 'Write from Dictation' ||
                                     task.category === 'Respond to a Situation';
              
              if (task.hasAudio && isListeningPrep && !audioRef.current && !audioFinished) {
                setPhase('audio');
                return 0;
              }
              setPhase('recording');
              // Set appropriate recording/writing time based on latest PTE trends
              if (task.category === 'Summarize Written Text') return 600;
              if (task.category === 'Write Essay') return 1200;
              if (task.category === 'Summarize Spoken Text') return 600;
              if (task.section === 'reading') {
                if (task.category.includes('Fill in the Blanks')) return 120; // 2 mins
                if (task.category.includes('Multiple Choice')) return 90; // 1.5 mins
                if (task.category === 'Re-order Paragraphs') return 120; // 2 mins
              }
              if (task.section === 'listening') return 90;
              return task.recordingTime ?? 40;
            } else if (phase === 'audio') {
              // Audio finished, handleAudioEnd will take care of phase transition
              return 0;
            } else {
              if (isMockTest) {
                // In mock test mode, don't auto-advance when time runs out.
                // The sticky footer "Next" button lets the user submit when ready.
                // The recorder will be stopped by the useEffect below.
                return 0;
              }
              handleFinishRef.current?.();
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [phase, task.recordingTime, task.hasAudio, task.category, isAudioPlaying, audioFinished]);

  // In mock test mode, stop the MediaRecorder when the recording timer expires
  // (the user submits manually via the "Next" button).
  // `task.section` and `mediaRecorder` are intentionally omitted: task.section is stable for a
  // given TaskModal instance, and mediaRecorder changing mid-recording would be a separate concern.
  useEffect(() => {
    if (isMockTest && phase === 'recording' && timeLeft === 0 && task.section === 'speaking') {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        cleanupRecordingAnalysis();
      }
      setRecordingStopped(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMockTest, phase, timeLeft]);

  const handleFinish = async () => {
    try {
      let result;
      let finalInput = userInput;
      if (task.id === 'personal-intro') {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          const stopPromise = new Promise(resolve => {
            mediaRecorder.onstop = resolve;
          });
          mediaRecorder.stop();
          await stopPromise;
          cleanupRecordingAnalysis();
        }
        onFinish(90);
        return;
      }
      if (task.section === 'speaking') {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          const stopPromise = new Promise(resolve => {
            mediaRecorder.onstop = resolve;
          });
          mediaRecorder.stop();
          await stopPromise;
          cleanupRecordingAnalysis();
        }
        
        // Small delay to ensure all chunks are processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (isMockTest) {
          // Wrap in try-catch: if no audio was recorded (user didn't speak),
          // advance to the next task with an empty response (scores minimum) rather
          // than crashing into the error/feedback phase.
          let base64 = '';
          try {
            base64 = await getAudioBase64();
          } catch {
            // No audio recorded — skip gracefully.
          }
          onFinish(base64 as any); // Pass base64 for later analysis
          return;
        }

        setPhase('analyzing');
        const base64 = await getAudioBase64();
        if (!base64 || base64.length < 100) {
           throw new Error("No audio detected");
        }
        setRecordings(prev => {
          const next = [...prev, { id: crypto.randomUUID(), base64, mimeType: mediaRecorder?.mimeType || 'audio/webm', attemptNum: prev.length + 1 }];
          return next.slice(-5); // Keep at most 5 recordings to limit memory usage
        });
        result = await analyzeSpeaking(base64, task.category, mediaRecorder?.mimeType || 'audio/webm', task.correctAnswers?.[0]);
      } else if (task.section === 'reading' || (task.section === 'listening' && task.category !== 'Summarize Spoken Text')) {
        if (isMockTest) {
          // For objective tasks in mock test, we can just pass the selected options/input
          const response = task.category.includes('Fill in the Blanks') ? JSON.stringify(blankAnswers) : JSON.stringify(selectedOptions);
          onFinish(response as any);
          return;
        }
        setPhase('analyzing');
        // Local scoring for objective tasks
        let score = 0;
        let maxScore = 10; // Default base
        let feedbackTips: string[] = [];

        if (task.category.includes('Fill in the Blanks')) {
          const answers = Object.values(blankAnswers);
          const correct = task.correctAnswers || [];
          maxScore = Math.max(correct.length, 1);
          let correctCount = 0;
          correct.forEach((ans, i) => {
            if (answers[i]?.toLowerCase().trim() === ans.toLowerCase().trim()) correctCount++;
          });
          score = correctCount === 0 ? 0 : Math.round((correctCount / maxScore) * 80) + 10;
          feedbackTips = correctCount === maxScore ? ["Perfect! All blanks filled correctly."] : [`You got ${correctCount} out of ${maxScore} blanks correct.`];
        } else if (task.category.includes('Multiple Choice') || task.category === 'Highlight Correct Summary' || task.category === 'Select Missing Word') {
          const correct = task.correctAnswers || [];
          const isMultiple = task.category.includes('Multiple Answer');
          maxScore = isMultiple ? Math.max(correct.length, 1) : 1;
          let correctSelected = 0;
          let incorrectSelected = 0;
          
          selectedOptions.forEach(opt => {
            if (correct.includes(opt)) correctSelected++;
            else incorrectSelected++;
          });
          
          // PTE Multiple Answer has negative marking, but total score for task cannot be < 0
          const netCorrect = Math.max(0, correctSelected - (isMultiple ? incorrectSelected : 0));
          score = netCorrect === 0 ? 0 : Math.max(10, Math.min(90, Math.round((netCorrect / maxScore) * 80) + 10));
          
          feedbackTips = [
            `You selected ${selectedOptions.length} option(s).`,
            `Correct selections: ${correctSelected}/${maxScore}`,
            incorrectSelected > 0 && isMultiple ? `Penalty: -${incorrectSelected} for incorrect selections.` : "",
            `Final Score: ${netCorrect}/${maxScore} points.`
          ].filter(t => t);

          result = {
            overall: score,
            content: score,
            rawContent: netCorrect,
            maxRawContent: maxScore,
            grammar: 90,
            vocabulary: 90,
            spelling: 90,
            fluency: 90,
            pronunciation: 90,
            tips: feedbackTips,
            feedback: feedbackTips
          };
        } else if (task.category === 'Highlight Incorrect Words') {
          const correct = task.correctAnswers || [];
          maxScore = Math.max(correct.length, 1);
          let correctSelected = 0;
          let incorrectSelected = 0;
          
          const normalize = (s: string) => s.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").toLowerCase().trim();
          const normalizedCorrect = correct.map(normalize);

          selectedOptions.forEach(opt => {
            if (normalizedCorrect.includes(normalize(opt))) correctSelected++;
            else incorrectSelected++;
          });
          
          const netCorrect = Math.max(0, correctSelected - incorrectSelected);
          score = netCorrect === 0 ? 0 : Math.max(10, Math.min(90, Math.round((netCorrect / maxScore) * 80) + 10));
          
          feedbackTips = [
            `Correct words identified: ${correctSelected}/${maxScore}`,
            incorrectSelected > 0 ? `Penalty: -${incorrectSelected} for incorrect words selected.` : "",
            `Final Score: ${netCorrect}/${maxScore} points.`
          ];

          result = {
            overall: score,
            content: score,
            rawContent: netCorrect,
            maxRawContent: maxScore,
            grammar: 90,
            vocabulary: 90,
            spelling: 90,
            fluency: 90,
            pronunciation: 90,
            tips: feedbackTips,
            feedback: feedbackTips
          };
        } else if (task.category === 'Re-order Paragraphs') {
          const correct = task.correctAnswers || [];
          maxScore = Math.max(correct.length - 1, 1); // PTE scores adjacent pairs
          let correctPairs = 0;
          for (let i = 0; i < targetParagraphs.length - 1; i++) {
            const currentIdx = correct.indexOf(targetParagraphs[i]);
            const nextIdx = correct.indexOf(targetParagraphs[i+1]);
            if (nextIdx === currentIdx + 1) correctPairs++;
          }
          score = correctPairs === 0 ? 0 : Math.round((correctPairs / maxScore) * 80) + 10;
          feedbackTips = [`You found ${correctPairs} correct adjacent pairs.`];
        } else if (task.category === 'Write from Dictation') {
          const userWords = userInput.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").split(/\s+/).filter(w => w);
          const correctWords = (task.prompt || "").toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").split(/\s+/).filter(w => w);
          maxScore = correctWords.length;
          let correctCount = 0;
          const mistakes: string[] = [];
          
          correctWords.forEach(word => {
            if (userWords.includes(word)) {
              correctCount++;
            } else {
              mistakes.push(`Missing: "${word}"`);
            }
          });
          
          userWords.forEach(word => {
            if (!correctWords.includes(word)) {
              mistakes.push(`Incorrect: "${word}"`);
            }
          });

          score = correctCount === 0 ? 0 : Math.round((correctCount / maxScore) * 80) + 10;
          feedbackTips = [`You got ${correctCount} out of ${maxScore} words correct.`];
          
          result = {
            overall: score,
            content: score,
            grammar: 90,
            vocabulary: 90,
            spelling: 90,
            fluency: 90,
            pronunciation: 90,
            tips: feedbackTips,
            feedback: feedbackTips,
            mistakes: mistakes
          };
        }

        if (!result) {
          result = {
            overall: score,
            content: score,
            grammar: 90,
            vocabulary: 90,
            spelling: 90,
            fluency: 90,
            pronunciation: 90,
            tips: feedbackTips,
            feedback: feedbackTips
          };
        }
      } else {
        if (!finalInput.trim() && task.category !== 'Re-order Paragraphs') {
           // Instead of throwing, provide a default very low score result for empty submissions
           result = {
             overall: 10,
             grammar: 10,
             vocabulary: 10,
             spelling: 10,
             content: 10,
             tips: ["Please provide a response next time to receive a proper analysis."],
             mistakes: ["Empty response submitted."]
           };
        } else {
          if (isMockTest) {
            onFinish(finalInput as any);
            return;
          }
          // Use speculative result if the text hasn't changed since the background
          // call was fired (instant), await the in-flight request if it's still
          // running (partial speedup), or start a fresh call as a last resort.
          const spec = speculativeWritingRef.current;
          if (spec && spec.text === finalInput) {
            const speculativeResult = spec.result ?? await spec.promise;
            result = speculativeResult ?? await analyzeWriting(finalInput || "Re-ordered paragraphs submitted", task.title);
          } else {
            result = await analyzeWriting(finalInput || "Re-ordered paragraphs submitted", task.title);
          }
        }
      }
      
      const tips = result.tips || result.feedback || ["Keep practicing!"];
      const mispronounced = result.mispronounced || [];
      
      if (task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') {
        setFeedback({
          overall: result.overall ?? 70,
          content: result.content ?? 70,
          grammar: result.grammar ?? 70,
          vocabulary: result.vocabulary ?? 70,
          spelling: result.spelling ?? 70,
          details: {
            hesitations: 0,
            mispronounced: Array.isArray(result.mistakes) ? result.mistakes : [],
            pace: "N/A",
            stress: "N/A"
          },
          tips: Array.isArray(tips) ? tips : [tips]
        });
      } else {
        setFeedback({
          overall: result.overall ?? result.Score ?? 70,
          content: result.content ?? result.Content ?? 70,
          rawContent: result.rawContent,
          maxRawContent: result.maxRawContent,
          oralFluency: result.fluency ?? result.Fluency ?? result.oralFluency ?? 70,
          pronunciation: result.pronunciation ?? result.Pronunciation ?? 70,
          details: {
            hesitations: result.hesitations || 0,
            mispronounced: Array.isArray(mispronounced) ? mispronounced : [mispronounced],
            pace: result.pace || "Good",
            stress: result.stress || "Good"
          },
          tips: Array.isArray(tips) ? tips : [tips],
          transcription: result.transcription
        });
      }
      const finalScore = result.overall ?? result.Score ?? 0;
      
      if (isMockTest) {
        try {
          await onFinish(finalScore as any, finalInput || userInput);
        } catch (e) {
          console.error("Failed to save progress:", e);
          setPhase('feedback'); // Fallback to feedback if navigation fails
        }
      } else {
        onFinish(finalScore, finalInput || userInput);
        setPhase('feedback');
      }
    } catch (error: any) {
      console.error("Analysis failed:", error);
      const isQuotaError = error.message === "GEMINI_QUOTA_EXCEEDED";
      const errorMessage = isQuotaError 
        ? "AI Quota Exceeded. Please wait a few minutes before trying again." 
        : (error instanceof Error ? error.message : "Analysis failed. Please try again.");
      
      if (isQuotaError) {
        toast.error("AI Quota Exceeded", {
          description: "The AI is currently busy or you've reached the free tier limit. Please try again in a few minutes."
        });
      }

      setFeedback({
        overall: 10,
        content: 10,
        oralFluency: 10,
        pronunciation: 10,
        details: { hesitations: 0, mispronounced: [], pace: "N/A", stress: "N/A" },
        tips: [errorMessage]
      });
      setPhase('feedback');
    }
  };

  // Keep handleFinishRef in sync so the silence-detection RAF can call the latest closure
  useEffect(() => {
    handleFinishRef.current = handleFinish;
  });

  const skipPrep = () => {
    // Resume audio context on user interaction to avoid browser blocks
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(e => console.error("Failed to resume audio context:", e));
    }

    if (task.hasAudio && !audioFinished) {
      // We don't set isPreparingAudio here anymore to avoid stuck states
      // The useEffect will handle it when phase changes to 'audio'
      setPhase('audio');
      setTimeLeft(0);
    } else {
      setPhase('recording');
      setTimeLeft(task.recordingTime ?? 40);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-app-bg/95 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-app-surface w-full max-w-2xl lg:max-w-5xl rounded-3xl border border-app-primary/20 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] my-auto flex flex-col max-h-[calc(100dvh-2rem)]"
      >
        {/* Header */}
        <div className="p-6 border-b border-app-primary/20 flex items-center justify-between bg-app-surface shrink-0">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-app-primary/10 rounded-lg">
              {task.section === 'speaking' ? <Mic className="text-app-primary" size={20} /> : 
               task.section === 'writing' ? <PenTool className="text-app-primary" size={20} /> :
               task.section === 'reading' ? <BookOpen className="text-app-primary" size={20} /> :
               <Headphones className="text-app-primary" size={20} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-app-text leading-none">{task.category}</h3>
              <p className="text-[10px] text-app-primary uppercase tracking-widest mt-1 font-bold">{task.title} • PTE Academic</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {onPrev && (
              <button 
                onClick={onPrev}
                className="p-2 hover:bg-app-bg rounded-full transition-colors text-app-text-muted disabled:opacity-30"
                title="Previous Question"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {onNext && (
              <button 
                onClick={onNext}
                className="p-2 hover:bg-app-bg rounded-full transition-colors text-app-text-muted disabled:opacity-30"
                title="Next Question"
              >
                <ChevronRight size={20} />
              </button>
            )}
            <div className="w-px h-6 bg-app-primary/20 mx-2" />
            {!isMockTest && (
              <button onClick={onClose} className="p-2 hover:bg-app-bg rounded-full transition-colors text-app-text-muted">
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 md:p-8 space-y-6">
          {/* Status Bar */}
          {(phase === 'prep' || phase === 'recording' || phase === 'audio') && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  phase === 'prep' ? "bg-yellow-500" : (phase === 'audio' ? "bg-blue-500" : "bg-red-500")
                )} />
                <span className="text-xs font-bold uppercase tracking-widest text-app-text">
                  {phase === 'audio' ? (isPreparingAudio ? "Preparing Audio" : "Listening") : (phase === 'prep' ? (task.hasAudio ? "Beginning in" : "Preparation") : (task.section === 'speaking' ? "Recording" : task.section.charAt(0).toUpperCase() + task.section.slice(1)))}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-mono font-bold text-app-text">
                  {phase === 'audio' ? (isPreparingAudio ? "..." : (isAudioPlaying ? "Playing" : "Loading...")) : formatTime(timeLeft)}
                </div>
                {phase === 'prep' && (
                  <button 
                    onClick={skipPrep}
                    className="text-[10px] font-bold text-app-primary border border-app-primary/30 px-3 py-1 rounded-full hover:bg-app-primary/10 transition-all"
                  >
                    SKIP PREP
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Instruction Area */}
          <div className={cn(
            "p-6 rounded-xl border transition-all",
            (task.category === 'Read Aloud' || task.category === 'Repeat Sentence' || task.category === 'Retell Lecture' || task.category === 'Summarize Group Discussion')
              ? "bg-white/95 border-gray-200 shadow-sm mb-6" 
              : "bg-app-surface/30 border-app-primary/20"
          )}>
            <p className={cn(
              "text-sm leading-relaxed",
              (task.category === 'Read Aloud' || task.category === 'Repeat Sentence' || task.category === 'Retell Lecture' || task.category === 'Summarize Group Discussion') ? "text-gray-800 italic font-medium" : "text-app-text"
            )}>
              {task.category === 'Read Aloud' ? (
                <>
                  Look at the text below. In <span className="font-bold not-italic">{task.prepTime || 35} seconds</span>, you must read this text aloud as naturally and clearly as possible. You have <span className="font-bold not-italic">{task.prepTime || 35} seconds</span> to read aloud.
                </>
              ) : task.category === 'Repeat Sentence' ? (
                <>
                  You will hear a sentence. Please repeat the sentence exactly as you hear it. You will hear the sentence only once.
                </>
              ) : task.category === 'Retell Lecture' ? (
                <>
                  You will hear a lecture. After listening to the lecture, in <span className="font-bold not-italic">7 seconds</span>, please speak into the microphone and retell what you have just heard from the lecture in your own words. You will have <span className="font-bold not-italic">40 seconds</span> to give your response.
                </>
              ) : task.category === 'Summarize Group Discussion' ? (
                <>
                  You will hear a group discussion. After listening to the discussion, in <span className="font-bold not-italic">10 seconds</span>, please speak into the microphone and summarize what you have just heard in your own words. You will have <span className="font-bold not-italic">40 seconds</span> to give your response.
                </>
              ) : (
                <>
                  <span className="text-app-primary font-bold mr-2">Instruction:</span>
                  {task.description}
                </>
              )}
            </p>
          </div>

          {/* Main Content Area */}
          {task.passage ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Left Column: Passage */}
              <div className="bg-app-bg p-4 sm:p-6 md:p-8 rounded-2xl border border-app-primary/20 h-full overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-app-primary/20 scrollbar-track-transparent">
                <div className="text-app-text/90 leading-relaxed text-sm sm:text-base font-normal">
                  {task.passage}
                </div>
              </div>

              {/* Right Column: Question and Options */}
              <div className="space-y-6">
                {task.prompt && (
                  <div className="bg-app-surface/30 p-4 sm:p-6 rounded-2xl border border-app-primary/20">
                    <p className="text-app-accent font-bold text-sm sm:text-base md:text-xl leading-relaxed">
                      {task.prompt}
                    </p>
                  </div>
                )}

                {phase === 'recording' && (
                  <div className="space-y-6">
                    <div className="bg-app-bg p-8 rounded-2xl border border-app-primary/20">
                      <div className="space-y-4">
                        {task.options?.map(option => (
                          <label key={option} className="flex items-center gap-4 p-4 rounded-xl border border-app-primary/10 hover:bg-app-primary/5 cursor-pointer transition-all group">
                            <input
                              type={task.category.includes('Multiple Answer') ? "checkbox" : "radio"}
                              name="reading-option"
                              checked={selectedOptions.includes(option)}
                              onChange={(e) => {
                                if (task.category.includes('Multiple Answer')) {
                                  if (e.target.checked) setSelectedOptions([...selectedOptions, option]);
                                  else setSelectedOptions(selectedOptions.filter(o => o !== option));
                                } else {
                                  setSelectedOptions([option]);
                                }
                              }}
                              className="w-5 h-5 accent-app-primary"
                            />
                            <span className="text-app-text group-hover:text-app-accent transition-colors">{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      {isMockTest && onMockExit ? (
                        <button
                          onClick={onMockExit}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest border border-app-border text-app-text-muted hover:text-app-primary hover:bg-app-primary/10 hover:border-app-primary/30 transition-all"
                        >
                          <Save size={14} /> Save &amp; Exit
                        </button>
                      ) : <div />}
                      <button 
                        onClick={async () => {
                          try {
                            await handleFinish();
                          } catch (e) {
                            console.error("Finish failed:", e);
                          }
                        }}
                        className="bg-app-primary text-app-bg px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-app-accent transition-all shadow-lg shadow-app-primary/10"
                      >
                        {isMockTest ? 'Next' : 'Submit Response'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Prompt Area (Moved above recorder for Read Aloud) */}
              {!(task.category.includes('Fill in the Blanks') && task.section === 'reading') && task.category !== 'Repeat Sentence' && task.category !== 'Summarize Group Discussion' && (task.category !== 'Retell Lecture' || hasAudioError) && (
                <div className="bg-app-bg p-4 sm:p-6 md:p-8 rounded-2xl border border-app-primary/20 relative group mb-4 sm:mb-8">
                  {task.category !== 'Retell Lecture' && (
                  <p className={cn(
                    "text-app-text leading-relaxed font-medium",
                    task.category === 'Read Aloud' ? "text-base sm:text-lg md:text-xl lg:text-2xl" : "text-sm sm:text-base md:text-lg",
                    task.category === 'Answer Short Question' && "italic font-bold"
                  )}>
                    {/* Hide transcript for listening tasks, show prompt (instruction/question) */}
                    {task.section === 'listening' 
                      ? (hasAudioError 
                          ? "Audio failed to load. Please check your connection and try again." 
                          : (task.category === 'Highlight Incorrect Words' 
                              ? "Listen to the recording and identify the discrepancies in the transcript below." 
                              : (task.prompt || "Complete the task based on the recording.")))
                      : (task.prompt || "No prompt available for this task.")}
                  </p>
                  )}
                  {hasAudioError && (
                    <button 
                      onClick={() => {
                        setHasAudioError(false);
                        setAudioRetryCount(prev => prev + 1);
                      }}
                      className="mt-4 px-6 py-2 bg-app-primary text-app-bg rounded-lg font-bold hover:bg-app-accent transition-all flex items-center gap-2"
                    >
                      <RefreshCw size={16} />
                      Retry Audio
                    </button>
                  )}
                  {task.image && task.category !== 'Summarize Group Discussion' && task.category !== 'Retell Lecture' && (
                    <div className="mt-6 rounded-xl overflow-hidden border border-app-primary/20">
                      <img 
                        src={task.image} 
                        alt="Task Prompt" 
                        className="w-full h-auto object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Audio Controls for Speaking Tasks */}
              {(task.category === 'Read Aloud' || task.category === 'Repeat Sentence' || task.category === 'Retell Lecture' || task.category === 'Summarize Group Discussion') && (phase === 'prep' || phase === 'recording' || phase === 'audio') && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col py-6 rounded-2xl border bg-white border-gray-200 shadow-sm mb-4 sm:mb-8 px-4 sm:px-10"
                >
                  <div className="w-full space-y-6">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                      <span className="text-gray-500 font-medium text-base">
                        {phase === 'audio' ? 'Audio Player' : 'Audio Recorder'}
                      </span>
                      <span className={cn(
                        "font-bold text-base",
                        (phase === 'prep' || (phase === 'audio' && !isAudioPlaying)) ? "text-red-500" : "text-app-primary"
                      )}>
                        {phase === 'prep' ? (
                          task.category === 'Repeat Sentence' ? `Beginning in ${timeLeft} sec` : `Recording starts in ${timeLeft} sec`
                        ) : phase === 'audio' ? (
                          isPreparingAudio ? 'Preparing...' : (isAudioPlaying ? 'Playing...' : (audioFinished ? 'Preparing...' : `Beginning in ${timeLeft} sec`))
                        ) : phase === 'recording' ? (
                          recordingStopped ? 'Recorded' : 'Recording...'
                        ) : 'Ready'}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 pt-2">
                      {/* Control Button */}
                      {!isPreparingAudio && !(phase === 'audio' && !isAudioPlaying && !audioFinished) && <button 
                        onClick={() => {
                          if (phase === 'prep') skipPrep();
                          else if (phase === 'recording') {
                            if (isMockTest) {
                              // In mock test: stop recording but wait for user to click "Next"
                              if (mediaRecorder && mediaRecorder.state === 'recording') {
                                mediaRecorder.stop();
                                cleanupRecordingAnalysis();
                              }
                              setRecordingStopped(true);
                              setTimeLeft(0);

                            } else {
                              handleFinish();
                            }
                          } else if (phase === 'audio' && !isAudioPlaying && !audioFinished) {
                            if (audioRef.current) {
                              audioRef.current.play().catch(e => console.error("Manual play failed", e));
                              setIsAudioPlaying(true);
                            }
                          } else if (phase === 'audio' && audioFinished) {
                            // If audio finished but we're still in 'audio' phase (the 1s pause), skip to next
                            if (task.prepTime && task.prepTime > 0 && task.section === 'speaking') {
                              setPhase('prep');
                              setTimeLeft(task.prepTime);
                            } else {
                              setPhase('recording');
                              setTimeLeft(task.recordingTime ?? 40);
                            }
                          }
                        }}
                        disabled={(phase === 'audio' && isAudioPlaying) || isPreparingAudio || recordingStopped}
                        className={cn(
                          "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl shrink-0",
                          phase === 'prep' ? "bg-app-primary text-app-bg hover:scale-105" : 
                          (phase === 'recording' && !recordingStopped) ? "bg-red-500 text-white hover:scale-105" :
                          recordingStopped ? "bg-gray-400 text-white cursor-default opacity-60" :
                          "bg-blue-500 text-white hover:scale-105 disabled:opacity-50",
                          isPreparingAudio && "cursor-wait"
                        )}
                        title={isPreparingAudio ? 'Preparing...' : (phase === 'prep' ? 'Click to play if you are ready' : recordingStopped ? 'Recording stopped' : phase === 'recording' ? 'Stop' : 'Play')}
                      >
                        {isPreparingAudio ? <Loader2 size={28} className="animate-spin text-white" /> : 
                         (phase === 'prep' ? <Play size={28} fill="currentColor" className="ml-1" /> : 
                          (phase === 'recording' && !recordingStopped) ? <div className="w-6 h-6 bg-white rounded-sm" /> :
                          recordingStopped ? <CheckCircle size={28} /> :
                          (isAudioPlaying ? <Headphones size={28} /> : <Loader2 size={28} className="animate-spin text-white" />))}
                      </button>}

                      <div className="flex-1 overflow-hidden">
                        {/* Spinner when preparing or audio loading, wave when active, progress bar otherwise */}
                        {(isPreparingAudio || (phase === 'audio' && !isAudioPlaying)) ? (
                          <div className="w-full h-12 flex items-center justify-center">
                            <Loader2 size={28} className="text-blue-400 animate-spin" />
                          </div>
                        ) : (isAudioPlaying || phase === 'recording') ? (
                          <div className="w-full h-12 flex items-center justify-center gap-1">
                            {[...Array(20)].map((_, i) => (
                              <motion.div 
                                key={i}
                                animate={phase === 'recording' ? {
                                  height: Math.max(6, (volume / 128) * 32 + (Math.random() * 4)),
                                  opacity: Math.min(1, (volume / 128) + 0.4)
                                } : { 
                                  height: [6, Math.random() * 32 + 6, 6],
                                  opacity: [0.4, 1, 0.4]
                                }}
                                transition={{ 
                                  repeat: phase === 'recording' ? 0 : Infinity, 
                                  duration: phase === 'recording' ? 0.05 : (0.4 + Math.random() * 0.2), 
                                  delay: phase === 'recording' ? 0 : (i * 0.02)
                                }}
                                className={cn(
                                  "w-1.5 rounded-full shrink-0",
                                  isAudioPlaying ? "bg-blue-400" : "bg-red-400"
                                )}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-4">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ 
                                  width: `${(timeLeft / (
                                    phase === 'prep' ? (task.prepTime || 3) : 
                                    phase === 'audio' ? (audioRef.current?.duration || 10) :
                                    (task.recordingTime || 40)
                                  )) * 100}%` 
                                }}
                                className="h-full transition-all bg-app-primary"
                              />
                            </div>
                            <span className="text-xs font-mono text-gray-400 whitespace-nowrap">
                              {formatTime(timeLeft)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Audio Controls (For non-Read Aloud/Repeat Sentence/Retell Lecture/Summarize Group Discussion tasks) */}
              {task.category !== 'Read Aloud' && task.category !== 'Repeat Sentence' && task.category !== 'Retell Lecture' && task.category !== 'Summarize Group Discussion' && (phase === 'audio' || (phase === 'prep' && (task.section === 'speaking' || task.section === 'listening' || task.hasAudio)) || (phase === 'recording' && task.section === 'speaking')) && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col py-6 rounded-2xl border bg-white border-gray-200 shadow-sm mb-4 sm:mb-8 px-4 sm:px-10"
                >
                  <div className="w-full space-y-6">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                      <span className="text-gray-500 font-medium text-base">
                        {phase === 'audio' && !audioFinished ? 'Audio Player' : 'Audio Recorder'}
                      </span>
                      <span className={cn(
                        "font-bold text-base",
                        (phase === 'prep' || (phase === 'audio' && !isAudioPlaying)) ? "text-red-500" : "text-app-primary"
                      )}>
                        {phase === 'prep' ? (
                          `Beginning in ${timeLeft} sec`
                        ) : phase === 'audio' ? (
                          isPreparingAudio ? 'Preparing...' : (isAudioPlaying ? 'Playing...' : (audioFinished ? 'Preparing...' : `Beginning in ${timeLeft} sec`))
                        ) : phase === 'recording' ? (
                          recordingStopped ? 'Recorded' : 'Recording...'
                        ) : 'Ready'}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 pt-2">
                      {/* Control Button — hidden while audio is being prepared or during post-audio transition */}
                      {!isPreparingAudio && !(phase === 'audio' && !isAudioPlaying) && (
                        <button 
                          onClick={() => {
                            if (phase === 'prep') {
                              skipPrep();
                            } else if (phase === 'recording') {
                              if (isMockTest) {
                                if (mediaRecorder && mediaRecorder.state === 'recording') {
                                  mediaRecorder.stop();
                                  cleanupRecordingAnalysis();
                                }
                                setRecordingStopped(true);
                                setTimeLeft(0);
                              } else {
                                handleFinish();
                              }
                            }
                          }}
                          disabled={(phase === 'audio' && isAudioPlaying) || recordingStopped}
                          className={cn(
                            "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl shrink-0",
                            phase === 'prep' ? "bg-app-primary text-app-bg hover:scale-105" : 
                            (phase === 'recording' && !recordingStopped) ? "bg-red-500 text-white hover:scale-105" :
                            recordingStopped ? "bg-gray-400 text-white cursor-default opacity-60" :
                            "bg-blue-500 text-white hover:scale-105 disabled:opacity-50",
                          )}
                          title={phase === 'prep' ? 'Click to play if you are ready' : recordingStopped ? 'Recording stopped' : phase === 'recording' ? 'Stop' : 'Play'}
                        >
                          {phase === 'prep' ? <Play size={28} fill="currentColor" className="ml-1" /> : 
                           (phase === 'recording' && !recordingStopped) ? <div className="w-6 h-6 bg-white rounded-sm" /> :
                           recordingStopped ? <CheckCircle size={28} /> :
                           (isAudioPlaying ? <Headphones size={28} /> : <Play size={28} className="text-white ml-1" />)}
                        </button>
                      )}

                      <div className="flex-1 overflow-hidden">
                        {/* Spinner when preparing or audio loading, wave when active, progress bar otherwise */}
                        {(isPreparingAudio || (phase === 'audio' && !isAudioPlaying)) ? (
                          <div className="w-full h-12 flex items-center justify-center">
                            <Loader2 size={28} className="text-blue-400 animate-spin" />
                          </div>
                        ) : (isAudioPlaying || phase === 'recording') ? (
                          <div className="w-full h-12 flex items-center justify-center gap-1">
                            {[...Array(20)].map((_, i) => (
                              <motion.div 
                                key={i}
                                animate={phase === 'recording' ? {
                                  height: Math.max(6, (volume / 128) * 32 + (Math.random() * 4)),
                                  opacity: Math.min(1, (volume / 128) + 0.4)
                                } : { 
                                  height: [6, Math.random() * 32 + 6, 6],
                                  opacity: [0.4, 1, 0.4]
                                }}
                                transition={{ 
                                  repeat: phase === 'recording' ? 0 : Infinity, 
                                  duration: phase === 'recording' ? 0.05 : (0.4 + Math.random() * 0.2), 
                                  delay: phase === 'recording' ? 0 : (i * 0.02)
                                }}
                                className={cn(
                                  "w-1.5 rounded-full shrink-0",
                                  isAudioPlaying ? "bg-blue-400" : "bg-red-400"
                                )}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-4">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ 
                                  width: `${(timeLeft / (
                                    phase === 'prep' ? (task.prepTime || 3) : 
                                    phase === 'audio' ? (audioRef.current?.duration || 10) :
                                    (task.recordingTime || 40)
                                  )) * 100}%` 
                                }}
                                className="h-full transition-all bg-app-primary"
                              />
                            </div>
                            <span className="text-xs font-mono text-gray-400 whitespace-nowrap">
                              {formatTime(timeLeft)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Input Area (Writing, Reading, Listening) */}
              {task.section !== 'speaking' && (phase === 'recording' || (task.section === 'listening' && (phase === 'audio' || phase === 'prep'))) && (
                <div className="space-y-6">
                  {task.section === 'reading' ? (
                    <div className="bg-app-bg p-4 sm:p-8 rounded-2xl border border-app-primary/20">
                      {task.category === 'Reading & Writing: Fill in the Blanks' ? (
                        <div className="text-app-text leading-relaxed text-lg">
                          {task.prompt?.split('________').map((part, i, arr) => (
                            <React.Fragment key={i}>
                              {part}
                              {i < arr.length - 1 && (
                                <select
                                  value={blankAnswers[i] || ''}
                                  onChange={(e) => setBlankAnswers({ ...blankAnswers, [i]: e.target.value })}
                                  className="mx-1 bg-app-surface text-app-accent border border-app-primary/40 rounded-md px-2 py-1 outline-none focus:border-app-accent transition-all cursor-pointer hover:bg-app-primary/10 appearance-none pr-8 relative"
                                  style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2366FCF1'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 0.5rem center',
                                    backgroundSize: '1.5em 1.5em'
                                  }}
                                >
                                  <option value="" className="bg-app-surface text-app-accent">[Select]</option>
                                  {task.blanks?.[i]?.map(opt => (
                                    <option key={opt} value={opt} className="bg-app-surface text-app-text">{opt}</option>
                                  ))}
                                </select>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      ) : task.category === 'Multiple Choice, Multiple Answer' || task.category === 'Multiple Choice, Single Answer' ? (
                        <div className="space-y-4">
                          {task.options?.map(option => (
                            <label key={option} className="flex items-center gap-4 p-4 rounded-xl border border-app-primary/10 hover:bg-app-primary/5 cursor-pointer transition-all">
                              <input
                                type={task.category.includes('Multiple Answer') ? "checkbox" : "radio"}
                                name="reading-option"
                                checked={selectedOptions.includes(option)}
                                onChange={(e) => {
                                  if (task.category.includes('Multiple Answer')) {
                                    if (e.target.checked) setSelectedOptions([...selectedOptions, option]);
                                    else setSelectedOptions(selectedOptions.filter(o => o !== option));
                                  } else {
                                    setSelectedOptions([option]);
                                  }
                                }}
                                className="w-5 h-5 accent-app-primary"
                              />
                              <span className="text-app-text">{option}</span>
                            </label>
                          ))}
                        </div>
                      ) : task.category === 'Re-order Paragraphs' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
                      {/* Source Panel */}
                      <div className="flex flex-col gap-3 p-4 bg-app-surface/50 rounded-xl border border-app-primary/20 overflow-y-auto">
                        <h4 className="text-app-text-muted text-xs uppercase tracking-wider font-bold mb-2">Source</h4>
                        {reorderedParagraphs.map((para, i) => (
                          <motion.div 
                            key={para}
                            layoutId={para}
                            onClick={() => {
                              setTargetParagraphs([...targetParagraphs, para]);
                              setReorderedParagraphs(reorderedParagraphs.filter(p => p !== para));
                            }}
                            className="p-3 bg-app-bg rounded-lg border border-app-primary/20 cursor-pointer hover:border-app-accent hover:text-app-accent transition-all text-sm text-app-text leading-relaxed"
                          >
                            {para}
                          </motion.div>
                        ))}
                      </div>
                      
                      {/* Target Panel */}
                      <div className="flex flex-col gap-3 p-4 bg-app-surface/50 rounded-xl border border-app-primary/20 overflow-y-auto">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-app-text-muted text-xs uppercase tracking-wider font-bold">Target</h4>
                          {targetParagraphs.length > 0 && (
                            <button 
                              onClick={() => {
                                setReorderedParagraphs([...reorderedParagraphs, ...targetParagraphs]);
                                setTargetParagraphs([]);
                              }}
                              className="text-[10px] text-app-primary hover:text-app-accent uppercase tracking-tighter"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        {targetParagraphs.map((para, i) => (
                          <motion.div 
                            key={para}
                            layoutId={para}
                            onClick={() => {
                              setReorderedParagraphs([...reorderedParagraphs, para]);
                              setTargetParagraphs(targetParagraphs.filter(p => p !== para));
                            }}
                            className="p-3 bg-app-bg rounded-lg border border-app-accent/30 cursor-pointer hover:border-app-accent transition-all text-sm text-app-accent leading-relaxed relative group"
                          >
                            <span className="absolute -left-2 -top-2 w-5 h-5 bg-app-accent text-app-bg rounded-full flex items-center justify-center text-[10px] font-bold">
                              {i + 1}
                            </span>
                            {para}
                          </motion.div>
                        ))}
                        {targetParagraphs.length === 0 && (
                          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-app-primary/10 rounded-lg">
                            <p className="text-app-text-muted/30 text-xs italic">Select from source to order</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : task.category === 'Reading: Fill in the Blanks' ? (
                    <div className="space-y-6">
                      <div className="text-app-text leading-relaxed p-4 bg-app-surface/50 rounded-xl border border-app-primary/10">
                        {task.prompt?.split('________').map((part, i, arr) => (
                          <React.Fragment key={i}>
                            {part}
                            {i < arr.length - 1 && (
                              <span 
                                onClick={() => {
                                  if (blankAnswers[i]) {
                                    const newAnswers = { ...blankAnswers };
                                    delete newAnswers[i];
                                    setBlankAnswers(newAnswers);
                                  }
                                }}
                                className="inline-block min-w-[100px] h-8 border-b-2 border-dashed border-app-primary mx-2 text-center text-app-accent font-bold cursor-pointer hover:bg-app-primary/10 transition-all"
                              >
                                {blankAnswers[i] || ''}
                              </span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 p-4 bg-app-surface rounded-xl border border-app-primary/20">
                        {task.options?.filter(opt => !Object.values(blankAnswers).includes(opt)).map(option => (
                          <button
                            key={option}
                            onClick={() => {
                              // Find first empty blank
                              const firstEmpty = task.prompt?.split('________').findIndex((_, idx, arr) => idx < arr.length - 1 && !blankAnswers[idx]);
                              if (firstEmpty !== undefined && firstEmpty !== -1) {
                                setBlankAnswers({ ...blankAnswers, [firstEmpty]: option });
                              }
                            }}
                            className="px-4 py-2 bg-app-bg border border-app-primary/30 rounded-lg text-sm text-app-text hover:border-app-primary hover:text-app-accent transition-all"
                          >
                            {option}
                          </button>
                        ))}
                        <button 
                          onClick={() => setBlankAnswers({})}
                          className="px-4 py-2 text-xs font-bold text-red-400 hover:text-red-300 transition-colors ml-auto"
                        >
                          Reset Blanks
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-y-1 bg-app-surface p-2 rounded-t-xl border-x border-t border-app-primary/20">
                        <div className="flex gap-1.5">
                          <button 
                            onClick={async (e) => {
                              try {
                                await handleCut(e);
                              } catch (err) {
                                console.error("Failed to cut:", err);
                              }
                            }}
                            className="px-2 sm:px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                          >
                            Cut
                          </button>
                          <button 
                            onClick={async (e) => {
                              try {
                                await handleCopy(e);
                              } catch (err) {
                                console.error("Failed to copy:", err);
                              }
                            }}
                            className="px-2 sm:px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                          >
                            Copy
                          </button>
                          <button 
                            onClick={async (e) => {
                              try {
                                await handlePaste(e);
                              } catch (err) {
                                console.error("Failed to paste:", err);
                              }
                            }}
                            className="px-2 sm:px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                          >
                            Paste
                          </button>
                          {task.summaryExample && (
                            <button 
                              onClick={() => setShowExample(!showExample)}
                              className="px-2 sm:px-3 py-1 text-xs font-bold text-amber-400 hover:bg-amber-400/10 rounded transition-all border border-amber-400/30 ml-1 sm:ml-2"
                            >
                              {showExample ? 'Hide Example' : 'Show Example'}
                            </button>
                          )}
                        </div>
                        <div className="text-app-text-muted text-xs font-mono px-1 sm:px-2 shrink-0">
                          {userInput.trim() ? userInput.trim().split(/\s+/).length : 0} {userInput.trim().split(/\s+/).length === 1 ? 'word' : 'words'}
                        </div>
                      </div>
                      {showExample && task.summaryExample && (
                        <div className="p-4 bg-amber-400/5 border border-amber-400/20 rounded-lg mb-2">
                          <p className="text-xs font-bold text-amber-400 mb-1 uppercase tracking-wider">Example Summary:</p>
                          <p className="text-sm text-amber-100 italic leading-relaxed">{task.summaryExample}</p>
                        </div>
                      )}
                      <textarea
                        ref={textareaRef}
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Type your response here..."
                        className="w-full h-64 lg:h-96 bg-app-bg text-app-text p-6 rounded-b-2xl border border-app-primary/20 focus:border-app-primary outline-none transition-all resize-none"
                      />
                    </div>
                  )}
                </div>
              ) : task.section === 'listening' ? (
                <div className="bg-app-bg p-8 rounded-2xl border border-app-primary/20">
                  {task.category === 'Fill in the Blanks' ? (
                    <div className="text-app-text leading-relaxed text-lg">
                      {task.prompt?.split('________').map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <input
                              type="text"
                              value={blankAnswers[i] || ''}
                              onChange={(e) => setBlankAnswers({ ...blankAnswers, [i]: e.target.value })}
                              placeholder={`[${i + 1}]`}
                              className="mx-1 w-32 bg-app-surface text-app-accent border-b-2 border-app-primary/40 focus:border-app-accent outline-none px-2 py-0.5 transition-all text-center"
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : task.category === 'Highlight Incorrect Words' ? (
                    <div className="text-app-text leading-relaxed text-lg flex flex-wrap gap-x-1 gap-y-2">
                      {task.prompt?.split(/\s+/).map((word, i) => (
                        <span
                          key={i}
                          onClick={() => {
                            if (selectedOptions.includes(word)) {
                              setSelectedOptions(selectedOptions.filter(o => o !== word));
                            } else {
                              setSelectedOptions([...selectedOptions, word]);
                            }
                          }}
                          className={cn(
                            "cursor-pointer px-1 rounded transition-all",
                            selectedOptions.includes(word) 
                              ? "bg-app-accent text-app-bg font-bold" 
                              : "hover:bg-app-primary/10"
                          )}
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  ) : task.category === 'Highlight Correct Summary' || task.category.includes('Multiple Choice') || task.category === 'Select Missing Word' ? (
                    <div className="space-y-4">
                      {task.options?.map(option => (
                        <label key={option} className="flex items-start gap-4 p-4 rounded-xl border border-app-primary/10 hover:bg-app-primary/5 cursor-pointer transition-all">
                          <input
                            type={task.category.includes('Multiple Answer') ? "checkbox" : "radio"}
                            name="listening-option"
                            checked={selectedOptions.includes(option)}
                            onChange={(e) => {
                              if (task.category.includes('Multiple Answer')) {
                                if (e.target.checked) setSelectedOptions([...selectedOptions, option]);
                                else setSelectedOptions(selectedOptions.filter(o => o !== option));
                              } else {
                                setSelectedOptions([option]);
                              }
                            }}
                            className="mt-1 w-5 h-5 accent-app-primary shrink-0"
                          />
                          <span className="text-app-text text-sm leading-relaxed">{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="relative space-y-2">
                      <div className="flex items-center justify-between bg-app-surface p-2 rounded-t-xl border-x border-t border-app-primary/20">
                        <div className="flex gap-2">
                          <button 
                            onClick={async (e) => {
                              try {
                                await handleCut(e);
                              } catch (err) {
                                console.error("Failed to cut:", err);
                              }
                            }}
                            className="px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                          >
                            Cut
                          </button>
                          <button 
                            onClick={async (e) => {
                              try {
                                await handleCopy(e);
                              } catch (err) {
                                console.error("Failed to copy:", err);
                              }
                            }}
                            className="px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                          >
                            Copy
                          </button>
                          <button 
                            onClick={async (e) => {
                              try {
                                await handlePaste(e);
                              } catch (err) {
                                console.error("Failed to paste:", err);
                              }
                            }}
                            className="px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                          >
                            Paste
                          </button>
                        </div>
                        <div className="text-app-text-muted text-xs font-mono px-2">
                          {userInput.trim() ? userInput.trim().split(/\s+/).length : 0} {userInput.trim().split(/\s+/).length === 1 ? 'word' : 'words'}
                        </div>
                      </div>
                      <textarea
                        ref={textareaRef}
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder={task.category === 'Write from Dictation' ? "Type the sentence you heard..." : "Type your response here..."}
                        className="w-full h-64 lg:h-96 bg-app-bg text-app-text p-6 rounded-b-2xl border border-app-primary/20 focus:border-app-primary outline-none transition-all resize-none"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative space-y-2">
                  <div className="flex items-center justify-between bg-app-surface p-2 rounded-t-xl border-x border-t border-app-primary/20">
                    <div className="flex gap-2">
                      <button 
                        onClick={async (e) => {
                          try {
                            await handleCut(e);
                          } catch (err) {
                            console.error("Failed to cut:", err);
                          }
                        }}
                        className="px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                      >
                        Cut
                      </button>
                      <button 
                        onClick={async (e) => {
                          try {
                            await handleCopy(e);
                          } catch (err) {
                            console.error("Failed to copy:", err);
                          }
                        }}
                        className="px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                      >
                        Copy
                      </button>
                      <button 
                        onClick={handlePaste}
                        className="px-3 py-1 text-xs font-bold text-app-accent hover:bg-app-primary/20 rounded transition-all border border-app-primary/30"
                      >
                        Paste
                      </button>
                    </div>
                    <div className="text-app-text-muted text-xs font-mono px-2">
                      {userInput.trim() ? userInput.trim().split(/\s+/).length : 0} {userInput.trim().split(/\s+/).length === 1 ? 'word' : 'words'}
                    </div>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Type your response here..."
                    className="w-full h-48 bg-app-bg text-app-text p-6 rounded-b-2xl border border-app-primary/20 focus:border-app-primary outline-none transition-all resize-none"
                  />
                </div>
              )}
              <div className="flex justify-between items-center">
                <div className="flex gap-4 items-center">
                  {isMockTest && onMockExit && (
                    <button
                      onClick={onMockExit}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest border border-app-border text-app-text-muted hover:text-app-primary hover:bg-app-primary/10 hover:border-app-primary/30 transition-all"
                    >
                      <Save size={14} /> Save &amp; Exit
                    </button>
                  )}
                  {task.category !== 'Re-order Paragraphs' && !task.category.includes('Multiple Choice') && !task.category.includes('Fill in the Blanks') && (
                    <span className="text-xs text-app-text-muted">Word count: {userInput.trim().split(/\s+/).filter(Boolean).length}</span>
                  )}
                  {task.section === 'listening' && isAudioPlaying && (
                    <span className="text-xs text-app-primary font-bold animate-pulse">Audio Playing...</span>
                  )}
                </div>
                <button 
                  onClick={async () => {
                    try {
                      await handleFinish();
                    } catch (e) {
                      console.error("Finish failed:", e);
                    }
                  }}
                  className="bg-app-primary text-app-bg px-6 py-2 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-app-accent transition-all"
                >
                  {isMockTest ? 'Next' : 'Submit Response'}
                </button>
              </div>
            </div>
          )}
          </>
        )}

        <AnimatePresence mode="wait">
            {phase === 'analyzing' ? (
              <motion.div 
                key="analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 space-y-6"
              >
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-app-primary/20 border-t-app-primary rounded-full animate-spin" />
                  <Swords className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-app-primary" size={32} />
                </div>
                <div className="text-center">
                  <h4 className="text-xl font-bold text-app-text mb-2">Sensei AI is Scoring...</h4>
                  <p className="text-sm text-app-text-muted">
                    {(task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') 
                      ? "Analyzing grammar, spelling, and content accuracy." 
                      : task.section === 'speaking'
                      ? "Analyzing fluency, pronunciation, and content accuracy."
                      : "Analyzing your response and content accuracy."}
                  </p>
                </div>
              </motion.div>
            ) : phase === 'feedback' ? (
              <motion.div 
                key="feedback"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Scoreboard */}
                <div className="bg-app-bg rounded-3xl p-6 border border-app-primary/20">
                  {task.category === 'Answer Short Question' ? (
                    <div className="flex flex-col items-center gap-3 py-2">
                      <h4 className="text-sm font-bold text-app-primary uppercase tracking-widest">Result</h4>
                      {feedback.overall >= 65 ? (
                        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-green-500/10 border border-green-500/30">
                          <Check size={28} className="text-green-400" />
                          <span className="text-xl font-black text-green-400">Correct</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-red-500/10 border border-red-500/30">
                          <X size={28} className="text-red-400" />
                          <span className="text-xl font-black text-red-400">Incorrect</span>
                        </div>
                      )}
                    </div>
                  ) : (
                  <>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div>
                      <h4 className="text-sm font-bold text-app-primary uppercase tracking-widest">Ninja Scoreboard</h4>
                      <p className="text-xs text-app-text-muted">Based on PTE Global Scale of English</p>
                    </div>
                    <div className="text-5xl font-black text-app-accent drop-shadow-[0_0_10px_rgba(102,252,241,0.3)]">
                      {feedback.overall}
                    </div>
                  </div>

        {task.category.includes('Multiple Choice') ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ScoreMetric 
              label="Content" 
              score={feedback.content} 
              max={90} 
              rawScore={feedback.rawContent} 
              maxRawScore={feedback.maxRawContent} 
            />
            <div className="sm:col-span-2" />
          </div>
        ) : (task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ScoreMetric label="Grammar" score={feedback.grammar} max={90} />
            <ScoreMetric label="Vocabulary" score={feedback.vocabulary} max={90} />
            <ScoreMetric label="Spelling" score={feedback.spelling} max={90} />
          </div>
        ) : task.section === 'speaking' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ScoreMetric label="Content" score={feedback.content} max={90} />
            <ScoreMetric label="Oral Fluency" score={feedback.oralFluency} max={90} />
            <ScoreMetric label="Pronunciation" score={feedback.pronunciation} max={90} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ScoreMetric label="Content" score={feedback.content} max={90} />
            <div className="sm:col-span-2" />
          </div>
        )}
                  </>
                  )}
                </div>

                {/* Reading Answer Key */}
                {task.section === 'reading' && task.correctAnswers && (
                  <div className="bg-app-bg rounded-2xl p-6 border border-app-primary/20 space-y-4">
                    <h5 className="text-sm font-bold text-app-text flex items-center gap-2">
                      <Check size={16} className="text-app-primary" />
                      Answer Key & Feedback
                    </h5>
                    
                    {task.category.includes('Fill in the Blanks') ? (
                      <div className="text-sm leading-relaxed text-app-text-muted bg-app-surface/50 p-4 rounded-xl border border-white/5">
                        {task.prompt?.split('________').map((part, i, arr) => {
                          const userAnswer = blankAnswers[i];
                          const correctAnswer = task.correctAnswers?.[i];
                          const isCorrect = userAnswer === correctAnswer;
                          
                          return (
                            <React.Fragment key={i}>
                              {part}
                              {i < arr.length - 1 && (
                                <span className={cn(
                                  "inline-block px-2 py-0.5 mx-1 rounded font-bold",
                                  isCorrect ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                )}>
                                  {userAnswer || "[Missing]"}
                                  {!isCorrect && (
                                    <span className="ml-1 text-[10px] opacity-70 line-through decoration-red-400/50">
                                      ({correctAnswer})
                                    </span>
                                  )}
                                </span>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    ) : task.category.includes('Multiple Choice') ? (
                      <div className="space-y-2">
                        {task.options?.map(option => {
                          const isSelected = selectedOptions.includes(option);
                          const isCorrect = task.correctAnswers?.includes(option);
                          
                          return (
                            <div 
                              key={option}
                              className={cn(
                                "p-3 rounded-xl border text-xs flex items-center justify-between",
                                isCorrect 
                                  ? "bg-green-500/10 border-green-500/30 text-green-400" 
                                  : isSelected 
                                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                                    : "bg-app-surface border-white/5 text-app-text-muted"
                              )}
                            >
                              <span>{option}</span>
                              <div className="flex items-center gap-2">
                                {isSelected && (isCorrect ? <Check size={14} /> : <X size={14} />)}
                                {!isSelected && isCorrect && <Check size={14} className="opacity-50" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : task.category === 'Re-order Paragraphs' ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <h6 className="text-[10px] font-bold text-app-text-muted uppercase">Your Order</h6>
                            {targetParagraphs.map((para, i) => {
                              const isCorrectPos = task.correctAnswers?.[i] === para;
                              return (
                                <div key={i} className={cn(
                                  "p-2 rounded-lg border text-[10px] leading-tight",
                                  isCorrectPos ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                                )}>
                                  {i + 1}. {para.substring(0, 100)}...
                                </div>
                              );
                            })}
                          </div>
                          <div className="space-y-2">
                            <h6 className="text-[10px] font-bold text-app-text-muted uppercase">Correct Order</h6>
                            {task.correctAnswers?.map((para, i) => (
                              <div key={i} className="p-2 bg-app-surface rounded-lg border border-white/5 text-[10px] leading-tight text-app-text-muted">
                                {i + 1}. {para.substring(0, 100)}...
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : task.category === 'Highlight Incorrect Words' ? (
                      <div className="space-y-4">
                        <div className="text-sm font-bold text-app-text flex items-center gap-2">
                          <Check size={16} className="text-app-primary" />
                          Correct Transcript vs Provided Transcript
                        </div>
                        <div className="text-sm leading-relaxed text-app-text-muted bg-app-surface/50 p-4 rounded-xl border border-white/5">
                          <p className="mb-2 font-bold text-app-primary">Correct Transcript (Audio):</p>
                          <p className="mb-4 italic">"{task.transcript}"</p>
                          <p className="mb-2 font-bold text-red-400">Incorrect Words in Transcript:</p>
                          <div className="flex flex-wrap gap-2">
                            {task.correctAnswers?.map((word, i) => (
                              <span key={i} className="px-2 py-1 bg-red-500/10 text-red-400 rounded border border-red-500/20">
                                {word}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Detailed Analysis */}
                {(task.section === 'speaking' || task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') && (
                  <div className="space-y-4">
                    {/* Recordings */}
                    {task.section === 'speaking' && recordings.length > 0 && (
                      <div className="bg-app-bg rounded-2xl p-4 border border-app-primary/20 space-y-3">
                        <h5 className="text-sm font-bold text-app-text flex items-center gap-2">
                          <Mic size={14} className="text-app-primary" />
                          Your Recordings ({recordings.length} attempt{recordings.length !== 1 ? 's' : ''})
                        </h5>
                        <div className="space-y-2">
                          {recordings.map((rec) => (
                            <div key={rec.id} className="flex items-center gap-3 p-3 bg-app-surface rounded-xl border border-white/5">
                              <span className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider shrink-0">
                                Attempt {rec.attemptNum}
                              </span>
                              <audio
                                controls
                                className="flex-1 h-8"
                                src={`data:${rec.mimeType};base64,${rec.base64}`}
                              />
                              <button
                                onClick={() => setRecordings(prev => prev.filter(r => r.id !== rec.id))}
                                className="p-1.5 rounded-lg text-app-text-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                                title="Delete recording"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Transcription for speaking tasks */}
                    {task.section === 'speaking' && feedback.transcription && (
                      <div className="bg-app-surface p-4 rounded-2xl border border-white/5">
                        <h5 className="text-[10px] font-bold text-app-text-muted uppercase mb-3">What You Said</h5>
                        <div className="text-xs text-app-text leading-relaxed italic bg-app-surface/50 p-3 rounded-xl border border-white/5">
                          "{feedback.transcription}"
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                    <div className="bg-app-surface p-4 rounded-2xl border border-white/5">
                      <h5 className="text-[10px] font-bold text-app-text-muted uppercase mb-3">
                        {task.category === 'Answer Short Question' ? 'Expected Answer' : (task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') ? "Sensei's Wisdom" : 'Diagnostic Data'}
                      </h5>
                      {task.category === 'Answer Short Question' ? (
                        <div className="text-[10px] text-app-text-muted leading-tight italic bg-app-surface/50 p-3 rounded-xl border border-white/5">
                          {task.correctAnswers && task.correctAnswers[0] || "No expected answer available."}
                        </div>
                      ) : (task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') ? (
                        <ul className="space-y-2">
                          {Array.isArray(feedback.tips) && feedback.tips.slice(0, 3).map((tip: string, i: number) => (
                            <li key={i} className="text-[10px] text-app-text-muted flex gap-2 leading-tight">
                              <span className="text-app-primary font-bold">{i+1}</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Hesitations</span>
                            <span className="text-orange-400 font-bold">{feedback.details.hesitations}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Pace</span>
                            <span className="text-app-accent font-bold">{feedback.details.pace}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="bg-app-surface p-4 rounded-2xl border border-white/5">
                      <h5 className="text-[10px] font-bold text-app-text-muted uppercase mb-3">
                        {task.category === 'Answer Short Question' ? 'Your Answer' : (task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') ? 'Grammatical and Other Mistakes' : 'Mispronounced'}
                      </h5>
                      {task.category === 'Answer Short Question' ? (
                        <div className="text-[10px] text-app-text-muted leading-tight italic bg-app-surface/50 p-3 rounded-xl border border-white/5">
                          {feedback.transcription || userInput || "No answer provided."}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(feedback.details.mispronounced) && feedback.details.mispronounced.map((word: string, i: number) => (
                            <span key={i} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-md border border-red-500/20">
                              {word}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                )}

                {/* Tips / Expected Answer */}
                <div className="bg-app-primary/5 p-6 rounded-2xl border border-app-primary/20">
                  <h5 className="text-sm font-bold text-app-text mb-4 flex items-center gap-2">
                    <Zap size={16} className="text-app-primary" />
                    {(task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') ? 'Expected Answer' : "Sensei's Wisdom"}
                  </h5>
                  {(task.section === 'writing' || task.category === 'Summarize Spoken Text' || task.category === 'Write from Dictation') ? (
                    <div className="text-xs text-app-text-muted leading-relaxed italic bg-app-surface/50 p-4 rounded-xl border border-white/5">
                      {task.summaryExample || (task.correctAnswers && task.correctAnswers[0]) || "No expected answer available."}
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {Array.isArray(feedback.tips) && feedback.tips.map((tip: string, i: number) => (
                        <li key={i} className="text-xs text-app-text-muted flex gap-3 leading-relaxed">
                          <span className="text-app-primary font-bold">0{i+1}</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex gap-4">
                  {!isMockTest && (
                    <button 
                      onClick={() => {
                        setFeedback(null);
                        setUserInput('');
                        setSelectedOptions([]);
                        setBlankAnswers({});
                        setReorderedParagraphs(task.paragraphs || []);
                        setTargetParagraphs([]);
                        
                        const isListeningPrep = task.section === 'listening' || 
                                               task.category === 'Repeat Sentence' || 
                                               task.category === 'Answer Short Question' || 
                                               task.category === 'Write from Dictation';
                        
                        const initialPhase = isListeningPrep ? 'prep' : (task.hasAudio ? 'audio' : (task.prepTime === 0 || task.section === 'reading' ? 'recording' : 'prep'));
                        setPhase(initialPhase);
                        
                        let initialTime = 0;
                        if (task.category === 'Repeat Sentence' || task.category === 'Answer Short Question' || task.category === 'Write from Dictation') {
                          initialTime = 1;
                        } else if (task.category === 'Summarize Spoken Text') {
                          initialTime = 12;
                        } else if (task.section === 'listening' && task.hasAudio) {
                          initialTime = 1;
                        } else if (task.hasAudio) {
                          initialTime = 0;
                        } else if (task.prepTime === 0 || task.section === 'reading') {
                          if (task.category === 'Summarize Written Text') initialTime = 600;
                          else if (task.category === 'Write Essay') initialTime = 1200;
                          else if (task.category === 'Summarize Spoken Text') initialTime = 600;
                          else if (task.section === 'reading') {
                            if (task.category.includes('Fill in the Blanks')) initialTime = 120;
                            else if (task.category.includes('Multiple Choice')) initialTime = 90;
                            else if (task.category === 'Re-order Paragraphs') initialTime = 120;
                            else initialTime = 120;
                          }
                          else if (task.section === 'listening') initialTime = 90;
                          else initialTime = task.recordingTime ?? 10;
                        } else {
                          initialTime = task.prepTime ?? 35;
                        }
                        setTimeLeft(initialTime);
                        
                        setAudioFinished(false);
                        setIsAudioPlaying(false);
                        setIsPreparingAudio(false);
                        setHasAudioError(false);
                        beepPlayedRef.current = false;
                      }}
                      className="flex-1 py-4 bg-app-primary text-app-bg rounded-2xl font-bold uppercase tracking-widest hover:bg-app-accent transition-all"
                    >
                      Reset
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (isMockTest) {
                        onFinish(feedback.overall);
                      } else if (onNext) {
                        onNext();
                      } else {
                        onClose();
                      }
                    }}
                    className="flex-1 py-4 border border-app-primary/20 text-app-text rounded-2xl font-bold uppercase tracking-widest hover:bg-app-surface/50 transition-all"
                  >
                    {isMockTest ? 'Next' : onNext ? 'Next' : 'Close'}
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Mock-test sticky footer: always-visible Next + Save & Exit buttons (speaking tasks only) */}
        {isMockTest && task.section === 'speaking' && (phase === 'prep' || phase === 'audio' || phase === 'recording' || recordingStopped) && (
          <div className="border-t border-app-primary/10 px-6 py-4 flex items-center justify-between gap-3 bg-app-surface shrink-0">
            {onMockExit && (
              <button
                onClick={onMockExit}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest border border-app-border text-app-text-muted hover:text-app-primary hover:bg-app-primary/10 hover:border-app-primary/30 transition-all"
              >
                <Save size={14} /> Save &amp; Exit
              </button>
            )}
            <button
              onClick={async () => {
                try { await handleFinish(); } catch (e) {
                  console.error("Finish failed:", e);
                  toast.error("Could not submit task. Please try again.");
                }
              }}
              className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-app-primary text-app-bg rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-app-accent transition-all shadow-lg shadow-app-primary/10"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function ScoreMetric({ label, score, max, rawScore, maxRawScore }: { label: string, score: number, max: number, rawScore?: number, maxRawScore?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold text-app-text-muted uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-app-text">
          {rawScore !== undefined && maxRawScore !== undefined ? `${rawScore}/${maxRawScore}` : score}
        </span>
      </div>
      <div className="h-1.5 bg-app-surface rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${(score / max) * 100}%` }}
          className="h-full bg-app-primary"
        />
      </div>
    </div>
  );
}