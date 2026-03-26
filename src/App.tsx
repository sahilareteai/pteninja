import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
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
  Lock, 
  Play,
  RefreshCw,
  Settings,
  User,
  BarChart3,
  Flame,
  Star,
  Shield,
  Clock,
  ArrowRight,
  Check,
  X,
  LogOut,
  CreditCard,
  ShieldCheck,
  Bell,
  Calendar,
  Map,
  Plus,
  Trash2,
  TrendingUp,
  AlertCircle,
  Book,
  Search,
  Volume2
} from 'lucide-react';
import { cn } from './lib/utils';
import { Toaster, toast } from 'sonner';
import { PTE_TASKS, PTESection, PTETask, UserProgress, SUBSCRIPTION_PLANS, DailyGoal, ScheduledTask, TaskCompletion } from './types';
import { PTE_VOCABULARY, VocabularyWord } from './data/vocabulary';
import { analyzeSpeaking, analyzeWriting, generateTTS } from './services/geminiService';
import { SubscriptionProvider, useSubscription } from './components/SubscriptionProvider';
import { db, doc, updateDoc, handleFirestoreError, OperationType } from './firebase';

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
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const logDates = activityLog.map(d => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }).sort((a, b) => b - a);
  
  const uniqueLogs = Array.from(new Set(logDates));
  
  let streak = 0;
  let checkDate = today.getTime();
  
  // If today is not logged, check yesterday
  if (uniqueLogs[0] !== checkDate) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (uniqueLogs[0] !== yesterday.getTime()) {
      return 0;
    }
    checkDate = yesterday.getTime();
  }
  
  for (const logTime of uniqueLogs) {
    if (logTime === checkDate) {
      streak++;
      const nextCheck = new Date(checkDate);
      nextCheck.setDate(nextCheck.getDate() - 1);
      checkDate = nextCheck.getTime();
    } else if (logTime < checkDate) {
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


function RoadmapView({ user, onBack, onStartTask, notificationPermission, onRequestPermission }: { 
  user: any, 
  onBack: () => void, 
  onStartTask: (task: PTETask) => void,
  notificationPermission: string,
  onRequestPermission: () => void
}) {
  const [activeView, setActiveView] = useState<'roadmap' | 'schedule' | 'goals'>('roadmap');
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ taskId: '', time: '09:00', duration: 30 });
  const [newGoal, setNewGoal] = useState({ type: 'tasks' as 'tasks' | 'time', target: 10 });

  const milestones = [
    { id: 'white', title: 'White Belt', targetScore: 30, description: 'Master the basics of PTE structure.', isUnlocked: true },
    { id: 'yellow', title: 'Yellow Belt', targetScore: 50, description: 'Build fluency and basic vocabulary.', isUnlocked: (user?.currentScore || 0) >= 30 },
    { id: 'green', title: 'Green Belt', targetScore: 65, description: 'Achieve consistent accuracy in all sections.', isUnlocked: (user?.currentScore || 0) >= 50 },
    { id: 'blue', title: 'Blue Belt', targetScore: 79, description: 'Advanced techniques and high-level vocabulary.', isUnlocked: (user?.currentScore || 0) >= 65 },
    { id: 'black', title: 'Black Belt', targetScore: 90, description: 'PTE Mastery. Ready for the exam.', isUnlocked: (user?.currentScore || 0) >= 79 },
  ];

  const currentMilestone = milestones.find(m => !m.isUnlocked) || milestones[milestones.length - 1];

  const handleAddSchedule = async () => {
    if (!user?.uid || !newSchedule.taskId) return;
    const task = PTE_TASKS.find(t => t.id === newSchedule.taskId);
    if (!task) return;

    const scheduleItem: ScheduledTask = {
      id: Math.random().toString(36).substr(2, 9),
      taskId: newSchedule.taskId,
      scheduledAt: newSchedule.time,
      duration: newSchedule.duration,
      isCompleted: false
    };

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        schedule: [...(user.schedule || []), scheduleItem]
      });
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

  const handleAddGoal = async () => {
    if (!user?.uid) return;
    const goalItem: DailyGoal = {
      id: Math.random().toString(36).substr(2, 9),
      type: newGoal.type,
      target: newGoal.target,
      current: 0,
      date: new Date().toISOString().split('T')[0]
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
    const today = new Date().toISOString().split('T')[0];
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
      className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="p-3 rounded-2xl bg-[#45A29E]/10 shrink-0">
            <Map className="text-[#45A29E]" size={28} />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight sm:hidden">Roadmap</h2>
        </div>
        <div className="flex-1 hidden sm:block">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Your Roadmap</h2>
        </div>
        <div className="flex bg-[#1F2833] p-1 rounded-xl border border-white/5 w-full sm:w-auto overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveView('roadmap')}
            className={cn(
              "flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
              activeView === 'roadmap' ? "bg-[#45A29E] text-[#0B0C10]" : "text-[#C5C6C7] hover:text-white"
            )}
          >
            Path
          </button>
          <button 
            onClick={() => setActiveView('schedule')}
            className={cn(
              "flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
              activeView === 'schedule' ? "bg-[#45A29E] text-[#0B0C10]" : "text-[#C5C6C7] hover:text-white"
            )}
          >
            Schedule
          </button>
          <button 
            onClick={() => setActiveView('goals')}
            className={cn(
              "flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap",
              activeView === 'goals' ? "bg-[#45A29E] text-[#0B0C10]" : "text-[#C5C6C7] hover:text-white"
            )}
          >
            Goals
          </button>
        </div>
      </div>

      {activeView === 'roadmap' && (
        <div className="space-y-8 relative">
          {/* Connecting Line */}
          <div className="absolute left-8 top-10 bottom-10 w-0.5 bg-gradient-to-b from-[#45A29E] via-[#45A29E]/20 to-transparent" />
          
          {milestones.map((milestone, index) => (
            <motion.div 
              key={milestone.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "relative pl-20 group",
                !milestone.isUnlocked && "opacity-50"
              )}
            >
              <div className={cn(
                "absolute left-4 top-0 w-8 h-8 rounded-full border-4 border-[#0B0C10] z-10 flex items-center justify-center transition-all duration-500",
                milestone.isUnlocked ? "bg-[#45A29E] shadow-[0_0_15px_rgba(69,162,158,0.5)]" : "bg-[#1F2833]"
              )}>
                {milestone.isUnlocked ? <Check size={14} className="text-[#0B0C10]" /> : <Lock size={12} className="text-[#C5C6C7]" />}
              </div>
              
              <div className={cn(
                "bg-[#1F2833] p-6 rounded-3xl border transition-all duration-300",
                milestone.isUnlocked ? "border-[#45A29E]/30 hover:border-[#45A29E]" : "border-white/5"
              )}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-lg font-bold text-white">{milestone.title}</h3>
                    <p className="text-xs text-[#45A29E] font-bold uppercase tracking-widest">Target: {milestone.targetScore}</p>
                  </div>
                  {milestone.isUnlocked && milestone.id === currentMilestone.id && (
                    <span className="px-3 py-1 bg-[#45A29E]/10 text-[#45A29E] rounded-full text-[10px] font-bold uppercase tracking-widest animate-pulse">
                      Current Level
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#C5C6C7] leading-relaxed">{milestone.description}</p>
                
                {milestone.isUnlocked && (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => onStartTask(PTE_TASKS[0])}
                      className="py-2 bg-[#0B0C10] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#45A29E] hover:text-[#0B0C10] transition-all"
                    >
                      Practice Now
                    </button>
                    <button className="py-2 border border-white/5 text-[#C5C6C7] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-all">
                      View Details
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {activeView === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-[#1F2833] p-8 rounded-[2.5rem] border border-[#45A29E]/10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-white">Study Schedule</h3>
                <p className="text-sm text-[#C5C6C7]">Align your study time with specific tasks.</p>
              </div>
              <button 
                onClick={() => setShowAddSchedule(!showAddSchedule)}
                className="p-3 bg-[#45A29E] text-[#0B0C10] rounded-2xl hover:bg-[#66FCF1] transition-all shadow-lg"
              >
                <Plus size={24} className={cn("transition-transform", showAddSchedule && "rotate-45")} />
              </button>
            </div>

            {showAddSchedule && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-6 bg-[#0B0C10] rounded-3xl border border-[#45A29E]/30 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <select 
                    value={newSchedule.taskId}
                    onChange={(e) => setNewSchedule({ ...newSchedule, taskId: e.target.value })}
                    className="bg-[#1F2833] text-white border border-white/10 rounded-xl p-3 outline-none focus:border-[#45A29E]"
                  >
                    <option value="">Select Task</option>
                    {PTE_TASKS.map(t => (
                      <option key={t.id} value={t.id}>{t.category}: {t.title}</option>
                    ))}
                  </select>
                  <input 
                    type="time"
                    value={newSchedule.time}
                    onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
                    className="bg-[#1F2833] text-white border border-white/10 rounded-xl p-3 outline-none focus:border-[#45A29E]"
                  />
                  <input 
                    type="number"
                    placeholder="Duration (min)"
                    value={newSchedule.duration}
                    onChange={(e) => setNewSchedule({ ...newSchedule, duration: parseInt(e.target.value) || 0 })}
                    className="bg-[#1F2833] text-white border border-white/10 rounded-xl p-3 outline-none focus:border-[#45A29E]"
                  />
                </div>
                <button 
                  onClick={handleAddSchedule}
                  className="w-full py-3 bg-[#45A29E] text-[#0B0C10] rounded-xl font-bold uppercase tracking-widest hover:bg-[#66FCF1] transition-all"
                >
                  Add to Schedule
                </button>
              </motion.div>
            )}

            <div className="space-y-4">
              {(!user.schedule || user.schedule.length === 0) ? (
                <div className="text-center py-12 bg-[#0B0C10] rounded-3xl border border-dashed border-white/10">
                  <Calendar className="mx-auto text-[#C5C6C7]/20 mb-4" size={48} />
                  <p className="text-[#C5C6C7]">No tasks scheduled yet.</p>
                </div>
              ) : (
                user.schedule.map((item: ScheduledTask) => {
                  const task = PTE_TASKS.find(t => t.id === item.taskId);
                  return (
                    <div key={item.id} className="flex items-center gap-6 p-4 bg-[#0B0C10] rounded-2xl border border-white/5 group hover:border-[#45A29E]/30 transition-all">
                      <div className="text-center min-w-[80px]">
                        <p className="text-sm font-bold text-white">{item.scheduledAt}</p>
                        <p className="text-[10px] text-[#45A29E] font-bold uppercase">{item.duration}m</p>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-white">{task?.category || 'Unknown Task'}</h4>
                        <p className="text-xs text-[#C5C6C7] uppercase tracking-widest">{task?.section || 'N/A'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => task && onStartTask(task)}
                          className="p-2 text-[#45A29E] hover:bg-[#45A29E]/10 rounded-lg transition-all"
                        >
                          <Play size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteSchedule(item.id)}
                          className="p-2 text-[#C5C6C7] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
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

          <div className="bg-[#45A29E]/5 p-6 rounded-3xl border border-[#45A29E]/20 flex items-center gap-4">
            <div className="w-12 h-12 bg-[#45A29E]/10 rounded-2xl flex items-center justify-center">
              <Bell className="text-[#45A29E]" size={24} />
            </div>
            <div>
              <h4 className="font-bold text-white">Enable Notifications</h4>
              <p className="text-xs text-[#C5C6C7]">Get reminded before your scheduled study sessions.</p>
            </div>
            <button 
              onClick={onRequestPermission}
              disabled={notificationPermission === 'granted'}
              className={cn(
                "ml-auto px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                notificationPermission === 'granted' 
                  ? "bg-green-500/20 text-green-500 cursor-default" 
                  : "bg-[#45A29E] text-[#0B0C10] hover:bg-[#66FCF1]"
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
            <div className="bg-[#1F2833] p-8 rounded-[2.5rem] border border-[#45A29E]/10">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="text-[#45A29E]" size={24} />
                <h3 className="text-xl font-bold text-white">Daily Goals</h3>
              </div>
              
              <div className="space-y-6">
                {(!user.goals || user.goals.length === 0) ? (
                  <div className="text-center py-8">
                    <p className="text-[#C5C6C7] text-sm">No goals set for today.</p>
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
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="absolute -right-2 -top-2 p-1 bg-red-500/20 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-[#0B0C10] p-8 rounded-[2.5rem] border border-[#45A29E]/10 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Set New Goal</h3>
                <p className="text-sm text-[#C5C6C7] mb-6">Challenge yourself to improve faster.</p>
                
                <div className="space-y-4">
                  <select 
                    value={newGoal.type}
                    onChange={(e) => setNewGoal({ ...newGoal, type: e.target.value as 'tasks' | 'time' })}
                    className="w-full bg-[#1F2833] text-white border border-white/10 rounded-xl p-3 outline-none focus:border-[#45A29E]"
                  >
                    <option value="tasks">Tasks per day</option>
                    <option value="time">Minutes per day</option>
                  </select>
                  <input 
                    type="number" 
                    placeholder="Enter target value"
                    value={newGoal.target}
                    onChange={(e) => setNewGoal({ ...newGoal, target: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#1F2833] text-white border border-white/10 rounded-xl p-3 outline-none focus:border-[#45A29E]"
                  />
                </div>
              </div>
              <button 
                onClick={handleAddGoal}
                className="mt-8 w-full py-4 bg-[#45A29E] text-[#0B0C10] rounded-2xl font-bold uppercase tracking-widest hover:bg-[#66FCF1] transition-all"
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
        <span className="text-xs font-bold text-[#C5C6C7] uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-white">{current} / {target}</span>
      </div>
      <div className="h-2 bg-[#0B0C10] rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          className="h-full bg-gradient-to-r from-[#45A29E] to-[#66FCF1]"
        />
      </div>
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<PTESection | 'dashboard' | 'profile' | 'roadmap' | 'vocabulary' | 'shuriken' | 'help' | 'pattern'>('dashboard');
  const [progress, setProgress] = useState<UserProgress>(INITIAL_PROGRESS);
  const [selectedTask, setSelectedTask] = useState<PTETask | null>(null);
  const [currentCategoryTasks, setCurrentCategoryTasks] = useState<PTETask[]>([]);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const sentNotifications = useRef<Set<string>>(new Set());
  const { user, loading, login, continueAsGuest, logout, showSubscriptionModal, setShowSubscriptionModal, isAccessRestricted, authError, setAuthError } = useSubscription();

  const handleRequestNotificationPermission = async () => {
    const granted = await NotificationService.requestPermission();
    if (granted) {
      setNotificationPermission('granted');
    } else {
      setNotificationPermission(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
    }
  };

  useEffect(() => {
    if (user?.targetScore) {
      setProgress(prev => ({ ...prev, targetScore: user.targetScore }));
    }
  }, [user]);

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
            NotificationService.send(`Study Time: ${item.taskId}`, {
              body: `It's time for your scheduled ${item.taskId} session!`,
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
        await updateDoc(doc(db, 'users', user.uid), { targetScore: score });
        setProgress(prev => ({ ...prev, targetScore: score }));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    } else {
      setProgress(prev => ({ ...prev, targetScore: score }));
    }
  };

  const handleSelectTask = (task: PTETask, allTasks: PTETask[]) => {
    setSelectedTask(task);
    setCurrentCategoryTasks(allTasks);
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

  const calculateSectionAverage = (section: PTESection) => {
    if (!user?.taskScores) return 0;
    
    const sectionTasks = PTE_TASKS.filter(t => t.section === section).map(t => t.id);
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

  const handleTaskFinish = async (taskId: string, score: number) => {
    if (!user?.uid) return;
    
    const userRef = doc(db, 'users', user.uid);
    const currentTaskScores = user.taskScores || {};
    const taskScoresForId = currentTaskScores[taskId] || [];
    
    const newTaskScores = {
      ...currentTaskScores,
      [taskId]: [...taskScoresForId, score]
    };

    const newTaskCompletion: TaskCompletion = {
      taskId,
      score,
      completedAt: new Date().toISOString()
    };

    try {
      await updateDoc(userRef, { 
        taskScores: newTaskScores,
        completedTasks: Array.from(new Set([...(user.completedTasks || []), taskId])),
        completedTasksDetailed: [...(user.completedTasksDetailed || []), newTaskCompletion]
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#45A29E]/20 border-t-[#45A29E] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={login} onGuest={continueAsGuest} authError={authError} onClearError={() => setAuthError(null)} />;
  }

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] font-sans selection:bg-[#45A29E]/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#45A29E]/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#66FCF1]/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#1F2833] bg-[#0B0C10]/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#45A29E] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(69,162,158,0.3)] flex-shrink-0 overflow-hidden">
              <Zap className="text-[#0B0C10] fill-current" size={20} />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter text-white font-display">
              PTE <span className="text-[#45A29E]">NINJA</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <div className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest",
                user.subscriptionStatus === 'active' ? "text-green-500 bg-green-500/10 border-green-500/20" :
                user.subscriptionStatus === 'trial' ? "text-blue-500 bg-blue-500/10 border-blue-500/20" :
                "text-orange-500 bg-orange-500/10 border-orange-500/20"
              )}>
                <Shield size={12} className="fill-current" />
                {user.subscriptionStatus === 'active' ? 'Premium' : 
                 user.subscriptionStatus === 'trial' ? 'Trial' : 'Guest'}
              </div>
            )}
            <button 
              onClick={() => setShowStreakModal(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#1F2833] rounded-full border border-[#45A29E]/20 hover:border-[#45A29E]/50 transition-all"
            >
              <Flame className="text-orange-500" size={16} />
              <span className="text-sm font-bold text-white">{currentStreak} DAY STREAK</span>
            </button>
            <button 
              onClick={() => setActiveTab('help')}
              className="p-2 hover:bg-[#1F2833] rounded-full transition-colors"
            >
              <Settings size={20} />
            </button>
            <button 
              onClick={() => setActiveTab('profile')}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-[#45A29E] to-[#66FCF1] p-[2px]"
            >
              <div className="w-full h-full rounded-full bg-[#0B0C10] flex items-center justify-center overflow-hidden">
                {user?.displayName ? (
                  <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=45A29E&color=0B0C10`} alt="User" className="w-full h-full object-cover" />
                ) : (
                  <User size={20} className="text-[#45A29E]" />
                )}
              </div>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <Dashboard 
                key="dashboard" 
                progress={progress} 
                user={user}
                onStartTask={(task) => {
                  setSelectedTask(task);
                  setActiveTab(task.section);
                }} 
                onSelectSection={setActiveTab}
                onViewRoadmap={() => setActiveTab('roadmap')}
                onViewVocabulary={() => setActiveTab('vocabulary')}
                onViewShuriken={() => setActiveTab('shuriken')}
                onViewPattern={() => setActiveTab('pattern')}
                calculateAverageScore={calculateAverageScore}
                calculateSectionAverage={calculateSectionAverage}
                onSetTargetScore={handleSetTargetScore}
              />
            ) : activeTab === 'roadmap' ? (
              <RoadmapView 
                key="roadmap"
                user={user}
                onBack={() => setActiveTab('dashboard')}
                onStartTask={(task) => {
                  setSelectedTask(task);
                  setActiveTab(task.section);
                }}
                notificationPermission={notificationPermission}
                onRequestPermission={handleRequestNotificationPermission}
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
                onBack={() => setActiveTab('dashboard')}
                onStartTask={(task) => {
                  setSelectedTask(task);
                  setActiveTab(task.section);
                }}
              />
            ) : activeTab === 'profile' ? (
              <ProfileView 
                key="profile" 
                user={user} 
                onLogout={logout} 
                onUpgrade={() => setShowSubscriptionModal(true)}
              />
            ) : activeTab === 'help' ? (
              <HelpView 
                key="help"
                onBack={() => setActiveTab('dashboard')}
                onNavigate={(tab) => setActiveTab(tab as any)}
              />
            ) : activeTab === 'pattern' ? (
              <PatternView 
                key="pattern"
                onBack={() => setActiveTab('dashboard')}
              />
            ) : (
              <SectionView 
                key={activeTab} 
                section={activeTab} 
                user={user}
                onBack={() => setActiveTab('dashboard')} 
                onSelectTask={handleSelectTask}
              />
            )}
          </AnimatePresence>
        </main>

        {/* Navigation Bar */}
        <nav className="flex items-center justify-between md:justify-around px-2 md:px-4 py-3 border-t border-[#1F2833] bg-[#0B0C10]/90 backdrop-blur-xl sticky bottom-0 z-50">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={BarChart3} label="Dojo" />
          <NavButton active={activeTab === 'vocabulary'} onClick={() => setActiveTab('vocabulary')} icon={Book} label="Vocab" />
          <NavButton active={activeTab === 'roadmap'} onClick={() => setActiveTab('roadmap')} icon={Map} label="Roadmap" />
          <NavButton active={activeTab === 'speaking'} onClick={() => setActiveTab('speaking')} icon={Mic} label="Speaking" />
          <NavButton active={activeTab === 'writing'} onClick={() => setActiveTab('writing')} icon={PenTool} label="Writing" />
          <NavButton active={activeTab === 'reading'} onClick={() => setActiveTab('reading')} icon={BookOpen} label="Reading" />
          <NavButton active={activeTab === 'listening'} onClick={() => setActiveTab('listening')} icon={Headphones} label="Listening" />
        </nav>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedTask && (
          <TaskModal 
            key={selectedTask.id} 
            task={selectedTask} 
            onClose={() => setSelectedTask(null)} 
            onFinish={(score) => handleTaskFinish(selectedTask.id, score)}
            onPrev={currentCategoryTasks.length > 1 && currentCategoryTasks.findIndex(t => t.id === selectedTask.id) > 0 ? () => {
              const idx = currentCategoryTasks.findIndex(t => t.id === selectedTask.id);
              setSelectedTask(currentCategoryTasks[idx - 1]);
            } : undefined}
            onNext={currentCategoryTasks.length > 1 && currentCategoryTasks.findIndex(t => t.id === selectedTask.id) < currentCategoryTasks.length - 1 ? () => {
              const idx = currentCategoryTasks.findIndex(t => t.id === selectedTask.id);
              setSelectedTask(currentCategoryTasks[idx + 1]);
            } : undefined}
          />
        )}
        {showSubscriptionModal && (
          <SubscriptionModal 
            key="subscription-modal"
            user={user}
            onClose={() => !isAccessRestricted && setShowSubscriptionModal(false)}
            onLogin={login}
            isAccessRestricted={isAccessRestricted}
          />
        )}
        {showStreakModal && (
          <StreakCalendarModal 
            key="streak-modal"
            activityLog={user?.activityLog || []}
            onClose={() => setShowStreakModal(false)}
          />
        )}
      </AnimatePresence>
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

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0B0C10]/90 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-md bg-[#1F2833] border border-[#45A29E]/20 rounded-3xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Flame className="text-orange-500" size={24} />
            Training Streak
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1 hover:text-[#45A29E] transition-colors"><ChevronRight className="rotate-180" /></button>
          <span className="font-bold text-white">{monthName} {year}</span>
          <button onClick={nextMonth} className="p-1 hover:text-[#45A29E] transition-colors"><ChevronRight /></button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[10px] font-bold text-[#C5C6C7]/50 py-2">{d}</div>
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
                  logged ? "bg-[#45A29E] text-[#0B0C10] shadow-[0_0_10px_rgba(69,162,158,0.3)]" : "bg-[#0B0C10] text-[#C5C6C7]/30",
                  isToday && !logged && "border border-[#45A29E]/50"
                )}
              >
                {day}
                {isToday && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#66FCF1] rounded-full" />
                )}
              </div>
            );
          })}
        </div>
        
        <div className="mt-6 p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
              <Flame className="text-orange-500" size={20} />
            </div>
            <div>
              <p className="text-xs text-[#C5C6C7]/50 uppercase font-bold tracking-widest">Current Streak</p>
              <p className="text-xl font-black text-white">{calculateStreak(activityLog)} Days</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#C5C6C7]/50 uppercase font-bold tracking-widest">Total Days</p>
            <p className="text-xl font-black text-[#45A29E]">{activityLog.length}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function LandingPage({ onLogin, onGuest, authError, onClearError }: { onLogin: () => void, onGuest: () => void, authError: string | null, onClearError: () => void }) {
  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#C5C6C7] font-sans selection:bg-[#45A29E]/30 overflow-x-hidden">
      {/* Auth Error Toast */}
      <AnimatePresence>
        {authError && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6"
          >
            <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-xl p-4 rounded-2xl flex items-start gap-4 shadow-2xl shadow-red-500/10">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                <Shield size={20} className="text-red-500" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="text-sm font-bold text-white">Access Error</h4>
                <p className="text-xs text-red-200/70 leading-relaxed">{authError}</p>
              </div>
              <button 
                onClick={onClearError}
                className="p-1 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={18} className="text-white/40" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#45A29E]/5 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#66FCF1]/5 blur-[150px] rounded-full" />
      </div>

      {/* Navbar */}
      <nav className="relative z-20 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#45A29E] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(69,162,158,0.3)] flex-shrink-0 overflow-hidden">
            <Zap className="text-[#0B0C10] fill-current" size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter text-white font-display">
            PTE <span className="text-[#45A29E]">NINJA</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={onLogin} className="text-sm font-bold text-white hover:text-[#45A29E] transition-colors">Sign In</button>
          <button 
            onClick={onLogin}
            className="px-6 py-2.5 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl hover:bg-[#66FCF1] transition-all shadow-[0_0_20px_rgba(69,162,158,0.2)]"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative z-10 pt-20 pb-32 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F2833] rounded-full border border-[#45A29E]/20 text-xs font-bold tracking-widest text-[#45A29E] uppercase">
            <Star size={14} className="fill-current" />
            The Ultimate AI PTE Trainer
          </div>
          <h2 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-[0.9]">
            MASTER THE PTE <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#45A29E] to-[#66FCF1]">WITH AI PRECISION</span>
          </h2>
          <p className="text-xl text-[#C5C6C7] max-w-2xl mx-auto leading-relaxed">
            Stop guessing your score. Get real-time AI feedback on your speaking, writing, reading, and listening. Practice with the most accurate PTE simulation available.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button 
              onClick={onLogin}
              className="group flex items-center gap-3 px-10 py-5 bg-[#45A29E] text-[#0B0C10] font-bold text-lg rounded-2xl hover:bg-[#66FCF1] transition-all shadow-[0_0_30px_rgba(69,162,158,0.3)]"
            >
              Start Training Now
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button 
              onClick={onGuest}
              className="px-10 py-5 bg-transparent border border-[#45A29E]/30 text-[#45A29E] font-bold text-lg rounded-2xl hover:bg-[#45A29E]/10 transition-all"
            >
              Try Guest Access
            </button>
          </div>
        </motion.div>
      </header>

      {/* Features Grid */}
      <section className="relative z-10 py-32 px-6 bg-[#0B0C10]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Mic} 
              title="AI Speaking Analysis" 
              description="Get instant feedback on fluency, pronunciation, and content accuracy. Our AI detects hesitations and mispronounced words."
            />
            <FeatureCard 
              icon={PenTool} 
              title="Smart Writing Feedback" 
              description="Submit your essays and summaries for instant scoring. Improve your grammar, vocabulary, and structure with AI insights."
            />
            <FeatureCard 
              icon={Target} 
              title="Target Score Tracking" 
              description="Set your goal (65, 79, or 90) and track your progress through our specialized training modules."
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 py-32 px-6 border-y border-[#1F2833]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          <StatItem value="98%" label="Accuracy Rate" />
          <StatItem value="50k+" label="Practice Tasks" />
          <StatItem value="15k+" label="Active Ninjas" />
          <StatItem value="24/7" label="AI Support" />
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-20 px-6 text-center border-t border-[#1F2833]">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-[#45A29E] rounded-lg flex items-center justify-center">
              <Zap className="text-[#0B0C10] fill-current" size={18} />
            </div>
            <h1 className="text-xl font-bold tracking-tighter text-white">
              PTE <span className="text-[#45A29E]">NINJA</span>
            </h1>
          </div>
          <p className="text-sm text-[#C5C6C7]/50">© 2026 PTE Ninja. All rights reserved. Master your future.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="p-10 bg-[#1F2833] border border-[#45A29E]/10 rounded-3xl hover:border-[#45A29E]/40 transition-all group">
      <div className="w-14 h-14 bg-[#45A29E]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#45A29E] transition-colors">
        <Icon className="text-[#45A29E] group-hover:text-[#0B0C10]" size={28} />
      </div>
      <h3 className="text-2xl font-bold text-white mb-4">{title}</h3>
      <p className="text-[#C5C6C7] leading-relaxed">{description}</p>
    </div>
  );
}

function StatItem({ value, label }: { value: string, label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-5xl font-black text-white tracking-tighter">{value}</div>
      <div className="text-sm font-bold text-[#45A29E] uppercase tracking-widest">{label}</div>
    </div>
  );
}

function SubscriptionModal({ user, onClose, onLogin, isAccessRestricted }: { user: any, onClose: () => void, onLogin: () => void, isAccessRestricted: boolean }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B0C10]/95 backdrop-blur-xl overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-2xl bg-[#1F2833] border border-[#45A29E]/20 rounded-3xl p-8 shadow-2xl my-8"
      >
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)]">
            <ShieldCheck className="text-white" size={32} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {user?.subscriptionStatus === 'expired' ? 'Subscription Expired' : 'Upgrade to Pro'}
            </h2>
            <p className="text-[#C5C6C7] text-lg">Get unlimited access to all PTE practice materials</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full pt-4">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <div 
                key={plan.id}
                className="bg-[#0B0C10] border border-[#45A29E]/20 rounded-2xl p-6 flex flex-col items-center space-y-4 hover:border-[#45A29E] transition-all group cursor-pointer"
              >
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#66FCF1]">${plan.price}</span>
                  <span className="text-xs text-[#C5C6C7]/50">/{plan.interval}</span>
                </div>
                <ul className="text-xs text-[#C5C6C7] space-y-2 text-left w-full">
                  <li className="flex items-center gap-2"><Check size={12} className="text-[#45A29E]" /> Full Question Bank</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-[#45A29E]" /> AI Scoring</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-[#45A29E]" /> Detailed Feedback</li>
                </ul>
                <button className="w-full py-2 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl group-hover:bg-[#66FCF1] transition-all">
                  Select
                </button>
              </div>
            ))}
          </div>

          {user?.accessType === 'guest' && (
            <div className={cn(
              "w-full p-4 border rounded-2xl flex items-center gap-4 text-left transition-colors",
              isAccessRestricted 
                ? "bg-orange-500/10 border-orange-500/20" 
                : "bg-[#45A29E]/10 border-[#45A29E]/20"
            )}>
              <User className={isAccessRestricted ? "text-orange-500" : "text-[#45A29E]"} size={24} />
              <div>
                <p className={cn("font-bold", isAccessRestricted ? "text-orange-500" : "text-[#45A29E]")}>
                  {isAccessRestricted ? 'Guest Access Expired' : 'Guest Access Active'}
                </p>
                <p className="text-xs text-[#C5C6C7]">
                  {isAccessRestricted 
                    ? 'Sign up now to get a 14-day free trial!' 
                    : 'You have 3 days of free access. Sign up to save your progress!'}
                </p>
              </div>
              <button 
                onClick={onLogin}
                className={cn(
                  "ml-auto px-4 py-2 font-bold rounded-xl transition-all",
                  isAccessRestricted ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-[#45A29E] text-[#0B0C10] hover:bg-[#66FCF1]"
                )}
              >
                Sign Up
              </button>
            </div>
          )}

          {!isAccessRestricted && (
            <button 
              onClick={onClose}
              className="text-[#C5C6C7]/50 hover:text-white transition-colors"
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

function HelpView({ onBack, onNavigate }: { onBack: () => void, onNavigate: (tab: string) => void }) {
  const helpOptions = [
    { 
      title: 'Getting Started', 
      description: 'Learn the basics of PTE Ninja and how to use the AI trainer.',
      icon: Play,
      action: () => {} 
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
      title: 'Contact Support', 
      description: 'Need help? Our team is here to assist you 24/7.',
      icon: Bell,
      action: () => toast.info("Support team notified. We'll get back to you soon!")
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors shrink-0">
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div className="p-3 rounded-2xl bg-[#45A29E]/10 shrink-0">
          <Settings className="text-[#45A29E]" size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Help & Support</h2>
          <p className="text-sm text-[#C5C6C7]">How can we help you today?</p>
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
            className="flex items-start gap-4 p-6 bg-[#1F2833] border border-[#45A29E]/10 rounded-3xl hover:border-[#45A29E]/40 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-[#0B0C10] rounded-2xl flex items-center justify-center group-hover:bg-[#45A29E] transition-colors shrink-0">
              <option.icon size={24} className="text-[#45A29E] group-hover:text-[#0B0C10] transition-colors" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white group-hover:text-[#66FCF1] transition-colors">{option.title}</h3>
              <p className="text-sm text-[#C5C6C7] leading-relaxed mt-1">{option.description}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="bg-[#45A29E]/5 p-8 rounded-[2.5rem] border border-[#45A29E]/10 text-center space-y-4">
        <h3 className="text-xl font-bold text-white">Still have questions?</h3>
        <p className="text-[#C5C6C7] max-w-md mx-auto">Check out our comprehensive FAQ or join our community of PTE Ninjas.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button className="px-8 py-3 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl hover:bg-[#66FCF1] transition-all">
            View FAQ
          </button>
          <button className="px-8 py-3 bg-transparent border border-[#45A29E]/30 text-[#45A29E] font-bold rounded-xl hover:bg-[#45A29E]/10 transition-all">
            Join Discord
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ProfileView({ user, onLogout, onUpgrade }: { user: any, onLogout: () => void, onUpgrade: () => void }) {
  const isTrial = user?.subscriptionStatus === 'trial';
  const isGuest = user?.subscriptionStatus === 'guest';
  const isActive = user?.subscriptionStatus === 'active';
  
  const getStatusColor = () => {
    if (isActive) return 'text-green-500 bg-green-500/10 border-green-500/20';
    if (isTrial) return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    if (isGuest) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return 'text-red-500 bg-red-500/10 border-red-500/20';
  };

  const getRemainingDays = () => {
    const now = new Date();
    if (isTrial && user.trialEndsAt) {
      const diff = new Date(user.trialEndsAt).getTime() - now.getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    if (isGuest) {
      const createdAt = new Date(user.createdAt);
      const expiresAt = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      const diff = expiresAt.getTime() - now.getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return 0;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-center gap-6 bg-[#1F2833] p-6 md:p-8 rounded-3xl border border-[#45A29E]/20">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-[#45A29E] to-[#66FCF1] p-1 shrink-0">
          <div className="w-full h-full rounded-full bg-[#0B0C10] flex items-center justify-center overflow-hidden">
            {user?.displayName ? (
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&size=128&background=45A29E&color=0B0C10`} alt="User" className="w-full h-full object-cover" />
            ) : (
              <User size={40} className="text-[#45A29E] md:w-12 md:h-12" />
            )}
          </div>
        </div>
        <div className="flex-1 text-center sm:text-left min-w-0">
          <h2 className="text-2xl md:text-3xl font-bold text-white truncate">{user?.displayName || 'Sensei'}</h2>
          <p className="text-[#C5C6C7] truncate text-sm md:text-base">{user?.email || 'Guest User'}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 md:gap-3 mt-3">
            <span className={cn("px-3 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase tracking-widest", getStatusColor())}>
              {user?.subscriptionStatus}
            </span>
            {(isTrial || isGuest) && (
              <span className="text-[10px] md:text-xs text-[#C5C6C7]/50">
                {getRemainingDays()} days remaining
              </span>
            )}
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="p-3 md:p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all shrink-0"
        >
          <LogOut className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-[#1F2833] p-6 md:p-8 rounded-3xl border border-[#45A29E]/20 space-y-4 md:space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
              <CreditCard className="text-[#45A29E]" size={20} /> Subscription
            </h3>
            {!isActive && (
              <button 
                onClick={onUpgrade}
                className="w-full sm:w-auto px-4 py-2 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl hover:bg-[#66FCF1] transition-all text-sm"
              >
                Upgrade
              </button>
            )}
          </div>
          
          <div className="space-y-3 md:space-y-4">
            <div className="p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/10">
              <p className="text-[10px] md:text-xs text-[#C5C6C7]/50 uppercase tracking-widest font-bold">Current Plan</p>
              <p className="text-base md:text-lg font-bold text-white mt-1">
                {isActive ? `${user.planId?.toUpperCase()} Plan` : isTrial ? '14-Day Free Trial' : isGuest ? '3-Day Guest Access' : 'No Active Plan'}
              </p>
            </div>
            
            {isActive && (
              <div className="p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/10">
                <p className="text-[10px] md:text-xs text-[#C5C6C7]/50 uppercase tracking-widest font-bold">Next Billing Date</p>
                <p className="text-base md:text-lg font-bold text-white mt-1">
                  {new Date(user.subscriptionEndsAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1F2833] p-8 rounded-3xl border border-[#45A29E]/20 space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-[#45A29E]" /> Account Security
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/10">
              <div>
                <p className="text-sm font-bold text-white">Email Verified</p>
                <p className="text-xs text-[#C5C6C7]/50">{user?.email ? 'Your email is verified' : 'Sign in to verify'}</p>
              </div>
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", user?.email ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500")}>
                {user?.email ? <Check size={14} /> : <X size={14} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function NavButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all duration-300 relative group flex-1 md:flex-none py-1",
        active ? "text-[#45A29E]" : "text-[#C5C6C7] hover:text-white"
      )}
    >
      <div className={cn(
        "p-1.5 md:p-2 rounded-xl transition-all",
        active ? "bg-[#45A29E]/10" : "group-hover:bg-[#1F2833]"
      )}>
        <Icon size={20} className="md:w-6 md:h-6" />
      </div>
      <span className="text-[10px] uppercase tracking-widest font-bold hidden md:block">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-indicator"
          className="absolute -bottom-1 md:-bottom-3 w-1 h-1 bg-[#45A29E] rounded-full shadow-[0_0_8px_#45A29E]"
        />
      )}
    </button>
  );
}

function Dashboard({ progress, user, onStartTask, onSelectSection, onViewRoadmap, onViewVocabulary, onViewShuriken, onViewPattern, calculateAverageScore, calculateSectionAverage, onSetTargetScore }: { 
  progress: UserProgress, 
  user: any,
  onStartTask: (task: PTETask) => void,
  onSelectSection: (section: PTESection) => void,
  onViewRoadmap: () => void,
  onViewVocabulary: () => void,
  onViewShuriken: () => void,
  onViewPattern: () => void,
  calculateAverageScore: () => number,
  calculateSectionAverage: (section: PTESection) => number,
  onSetTargetScore: (score: number) => void
}) {
  const averageScore = calculateAverageScore();
  const [tempTarget, setTempTarget] = useState(79);
  
  // Analysis logic
  const totalTasks = PTE_TASKS.length;
  const attemptedTasks = user?.completedTasks?.length || 0;
  
  const sectionAverages = (['speaking', 'writing', 'reading', 'listening'] as PTESection[]).map(s => ({
    section: s,
    average: calculateSectionAverage(s)
  }));
  const weakestSection = sectionAverages.reduce((prev, curr) => prev.average < curr.average ? prev : curr);
  
  const highPriorityTasks = PTE_TASKS.filter(t => t.section === weakestSection.section && !user?.completedTasks?.includes(t.id)).slice(0, 2);
  const recommendedTasks = highPriorityTasks.length > 0 ? highPriorityTasks : PTE_TASKS.slice(0, 4);

  // Calculate current belt based on score
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
      className="max-w-4xl mx-auto space-y-6 md:space-y-8 px-4 md:px-0"
    >
      {/* Progress Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="md:col-span-2 bg-[#1F2833] rounded-3xl p-6 md:p-8 border border-[#45A29E]/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
            <Trophy size={120} />
          </div>
          <div className="relative z-10">
            {progress.targetScore === 0 ? (
              <div>
                <h2 className="text-xs md:text-sm font-bold text-[#45A29E] uppercase tracking-[0.2em] mb-4">Set Your Target</h2>
                <p className="text-[#C5C6C7] mb-6 text-xs md:text-sm">What is your goal for the PTE? For a Black Belt, aim for 79+.</p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <input 
                    type="number" 
                    value={tempTarget}
                    onChange={(e) => setTempTarget(Number(e.target.value))}
                    className="w-full sm:w-24 bg-[#0B0C10] border border-[#45A29E]/30 rounded-xl px-4 py-3 text-white font-bold text-xl focus:outline-none focus:border-[#45A29E]"
                    min="10"
                    max="90"
                  />
                  <button 
                    onClick={() => onSetTargetScore(tempTarget)}
                    className="flex-1 py-3 bg-[#45A29E] text-[#0B0C10] rounded-xl font-bold uppercase tracking-widest hover:bg-[#66FCF1] transition-all"
                  >
                    Set Target
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xs md:text-sm font-bold text-[#45A29E] uppercase tracking-[0.2em] mb-2">Average Score</h2>
                <div className="flex items-baseline gap-2 mb-4 md:mb-6">
                  <span className="text-4xl md:text-6xl font-black text-white">{averageScore}</span>
                  <span className="text-lg md:text-xl text-[#C5C6C7]">/ 90</span>
                </div>
                <div className="w-full h-2 md:h-3 bg-[#0B0C10] rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(averageScore / 90) * 100}%` }}
                    className="h-full bg-gradient-to-r from-[#45A29E] to-[#66FCF1] shadow-[0_0_15px_rgba(69,162,158,0.5)]"
                  />
                </div>
                <p className="mt-3 md:mt-4 text-xs md:text-sm text-[#C5C6C7]">Your target score is <span className="text-[#66FCF1] font-bold">{progress.targetScore}</span>. Keep practicing!</p>
              </>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#45A29E] to-[#1F2833] rounded-3xl p-6 md:p-8 flex flex-col justify-between text-[#0B0C10]">
          <div>
            <Target size={28} className="mb-3 md:mb-4" />
            <h3 className="text-lg md:text-xl font-bold leading-tight">Next Milestone: <br/>{belt.next}</h3>
            <p className="text-[10px] md:text-xs font-bold opacity-60 mt-1 uppercase tracking-widest">Current: {belt.title}</p>
          </div>
          <button 
            onClick={onViewRoadmap}
            className="mt-4 md:mt-6 w-full py-3 bg-[#0B0C10] text-[#45A29E] rounded-xl font-bold text-xs md:text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-all"
          >
            View Roadmap
          </button>
          <button 
            onClick={onViewPattern}
            className="mt-2 w-full py-3 bg-[#45A29E]/10 text-[#45A29E] border border-[#45A29E]/20 rounded-xl font-bold text-xs md:text-sm uppercase tracking-widest hover:bg-[#45A29E]/20 transition-all"
          >
            Exam Pattern
          </button>
        </div>
      </section>

      {/* Advanced Analysis & Vocabulary */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#1F2833] rounded-3xl p-6 border border-[#45A29E]/10 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="text-[#45A29E]" size={20} />
              Training Analysis
            </h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/5">
              <p className="text-[10px] font-bold text-[#C5C6C7]/50 uppercase tracking-widest mb-1">Attempted</p>
              <p className="text-2xl font-black text-white">{attemptedTasks} <span className="text-xs text-[#C5C6C7]/30">/ {totalTasks}</span></p>
            </div>
            <div className="p-4 bg-[#0B0C10] rounded-2xl border border-[#45A29E]/5">
              <p className="text-[10px] font-bold text-[#C5C6C7]/50 uppercase tracking-widest mb-1">Available</p>
              <p className="text-2xl font-black text-[#45A29E]">{totalTasks - attemptedTasks}</p>
            </div>
          </div>

          <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-orange-500/50 uppercase tracking-widest">Needs Improvement</p>
              <p className="text-sm font-bold text-white capitalize">{weakestSection.section} Section</p>
            </div>
          </div>
        </div>

        <div className="bg-[#1F2833] rounded-3xl p-6 border border-[#45A29E]/10 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Book className="text-[#45A29E]" size={20} />
                Vocabulary Builder
              </h3>
              <span className="px-2 py-1 bg-[#45A29E]/10 text-[#45A29E] text-[10px] font-bold rounded-md uppercase tracking-widest">2000+ Words</span>
            </div>
            <p className="text-sm text-[#C5C6C7] leading-relaxed">
              Master high-frequency academic words essential for PTE success. Includes meanings, context, and audio pronunciations.
            </p>
          </div>
          <button 
            onClick={onViewVocabulary}
            className="mt-6 w-full py-4 bg-[#45A29E] text-[#0B0C10] rounded-2xl font-bold uppercase tracking-widest hover:bg-[#66FCF1] transition-all shadow-[0_0_20px_rgba(69,162,158,0.2)]"
          >
            Open Builder
          </button>
        </div>
      </section>

      {/* Recommended Tasks */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="text-[#45A29E]" size={20} />
            Daily Shuriken
          </h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-orange-500/10 text-orange-500 text-[10px] font-bold rounded-md uppercase tracking-widest">High Priority</span>
            <button onClick={onViewShuriken} className="text-sm text-[#45A29E] font-bold hover:underline">View All</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recommendedTasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onStartTask(task)} />
          ))}
        </div>
      </section>

      {/* Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Speaking" value={calculateSectionAverage('speaking').toString()} color="text-[#66FCF1]" onClick={() => onSelectSection('speaking')} />
        <StatBox label="Writing" value={calculateSectionAverage('writing').toString()} color="text-orange-500" onClick={() => onSelectSection('writing')} />
        <StatBox label="Reading" value={calculateSectionAverage('reading').toString()} color="text-[#66FCF1]" onClick={() => onSelectSection('reading')} />
        <StatBox label="Listening" value={calculateSectionAverage('listening').toString()} color="text-yellow-500" onClick={() => onSelectSection('listening')} />
      </section>
    </motion.div>
  );
}

function DailyShurikenView({ user, onBack, onStartTask }: { user: any, onBack: () => void, onStartTask: (task: PTETask) => void }) {
  const highPriorityTasks = PTE_TASKS
    .filter(t => !user?.completedTasks?.includes(t.id))
    .slice(0, 100);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="p-3 rounded-2xl bg-orange-500/10 shrink-0">
            <Zap className="text-orange-500" size={28} />
          </div>
          <h2 className="text-2xl font-bold text-white sm:hidden">Daily Shuriken</h2>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white hidden sm:block">Daily Shuriken</h2>
          <p className="text-sm text-[#C5C6C7]">100 High-priority tasks to boost your score across all sections</p>
        </div>
      </div>

      <div className="space-y-4">
        {highPriorityTasks.length === 0 ? (
          <div className="text-center py-20 bg-[#1F2833] rounded-3xl border border-[#45A29E]/10">
            <Check className="mx-auto text-[#45A29E] mb-4" size={48} />
            <h3 className="text-xl font-bold text-white">All Tasks Completed!</h3>
            <p className="text-[#C5C6C7]">You've mastered all current high-priority tasks.</p>
          </div>
        ) : (
          highPriorityTasks.map((task, index) => (
            <div key={task.id} className="flex items-center gap-2 md:gap-4 group">
              <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-[#1F2833] border border-[#45A29E]/20 flex items-center justify-center text-[10px] md:text-xs font-bold text-[#45A29E] shrink-0">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <TaskCard task={task} onClick={() => onStartTask(task)} />
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}

function VocabularyBuilder({ user, onBack }: { user: any, onBack: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWord, setSelectedWord] = useState<VocabularyWord | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const filteredWords = PTE_VOCABULARY.filter(w => {
    const matchesSearch = w.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         w.meaning.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFavorite = !showFavoritesOnly || user?.favoriteWords?.includes(w.id);
    return matchesSearch && matchesFavorite;
  });

  const playPronunciation = (word: string) => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
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
      className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className="p-3 rounded-2xl bg-[#45A29E]/10 shrink-0">
            <BookOpen className="text-[#45A29E]" size={28} />
          </div>
          <h2 className="text-2xl font-bold text-white sm:hidden">Vocabulary</h2>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white hidden sm:block">Vocabulary Builder</h2>
          <p className="text-sm text-[#C5C6C7]">Master 2000+ essential PTE words</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C5C6C7]/50" size={20} />
          <input 
            type="text" 
            placeholder="Search words or meanings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#1F2833] border border-[#45A29E]/20 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-[#45A29E] transition-all"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
          <button 
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all whitespace-nowrap flex items-center gap-2",
              showFavoritesOnly ? "bg-amber-500 text-[#0B0C10] border-amber-500" : "bg-[#1F2833] text-[#C5C6C7] border-[#45A29E]/20 hover:border-[#45A29E]/50"
            )}
          >
            <Star size={16} fill={showFavoritesOnly ? "currentColor" : "none"} />
            Favorites
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredWords.map(word => {
            const isFavorite = user?.favoriteWords?.includes(word.id);
            return (
              <div 
                key={word.id}
                onClick={() => setSelectedWord(word)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group cursor-pointer",
                  selectedWord?.id === word.id 
                    ? "bg-[#45A29E] border-[#45A29E] text-[#0B0C10]" 
                    : "bg-[#1F2833] border-[#45A29E]/10 text-white hover:border-[#45A29E]/40"
                )}
              >
                <div className="flex items-center gap-3">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(word.id);
                    }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors hover:bg-white/5",
                      isFavorite ? "text-yellow-400" : "text-[#C5C6C7]/30"
                    )}
                  >
                    <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                  <div>
                    <div className="font-bold text-lg">{word.word}</div>
                    <div className={cn("text-xs uppercase font-bold tracking-widest opacity-60", selectedWord?.id === word.id ? "text-[#0B0C10]" : "text-[#45A29E]")}>
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

        <div className="bg-[#1F2833] border border-[#45A29E]/20 rounded-3xl p-8 sticky top-6 h-fit">
          {selectedWord ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-black text-white tracking-tight">{selectedWord.word}</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleToggleFavorite(selectedWord.id)}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all border",
                      user?.favoriteWords?.includes(selectedWord.id)
                        ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
                        : "bg-white/5 border-white/10 text-[#C5C6C7] hover:border-[#45A29E]/50"
                    )}
                  >
                    <Star size={24} fill={user?.favoriteWords?.includes(selectedWord.id) ? "currentColor" : "none"} />
                  </button>
                  <button 
                    onClick={() => playPronunciation(selectedWord.word)}
                    className="w-12 h-12 bg-[#45A29E]/10 rounded-xl flex items-center justify-center text-[#45A29E] hover:bg-[#45A29E] hover:text-[#0B0C10] transition-all"
                  >
                    <Volume2 size={24} />
                  </button>
                </div>
              </div>
              
              <div className="inline-block px-3 py-1 bg-[#45A29E]/10 border border-[#45A29E]/20 rounded-lg text-[#45A29E] text-xs font-bold uppercase tracking-widest">
                {selectedWord.partOfSpeech}
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-[#C5C6C7]/50 uppercase tracking-widest mb-2">Meaning</h4>
                  <p className="text-white leading-relaxed">{selectedWord.meaning}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#C5C6C7]/50 uppercase tracking-widest mb-2">Context</h4>
                  <p className="text-[#C5C6C7] italic leading-relaxed">"{selectedWord.context}"</p>
                </div>
              </div>

              <div className="pt-6 border-t border-[#45A29E]/10">
                <button 
                  onClick={() => handleToggleFavorite(selectedWord.id)}
                  className={cn(
                    "w-full py-4 font-bold rounded-2xl transition-all shadow-lg",
                    user?.favoriteWords?.includes(selectedWord.id)
                      ? "bg-[#1F2833] text-[#45A29E] border border-[#45A29E]/20"
                      : "bg-[#45A29E] text-[#0B0C10] hover:bg-[#66FCF1]"
                  )}
                >
                  {user?.favoriteWords?.includes(selectedWord.id) ? 'Remove from Flashcards' : 'Add to Flashcards'}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
              <div className="w-20 h-20 bg-[#0B0C10] rounded-3xl flex items-center justify-center text-[#45A29E]/20">
                <Book size={40} />
              </div>
              <p className="text-[#C5C6C7]/50 font-medium">Select a word to view details</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function PatternView({ onBack }: { onBack: () => void }) {
  const sections = [
    {
      title: "Speaking & Writing",
      duration: "54–67 minutes",
      color: "text-[#45A29E]",
      tasks: [
        { name: "Personal Introduction", count: "1", description: "Not scored; used for security and identification." },
        { name: "Read Aloud", count: "6–7", description: "Read a short text aloud with natural fluency and pronunciation." },
        { name: "Repeat Sentence", count: "10–12", description: "Listen to a sentence and repeat it exactly." },
        { name: "Describe Image", count: "3–4", description: "Describe the information shown in an image." },
        { name: "Re-tell Lecture", count: "1–2", description: "Listen to a lecture and summarize it in your own words." },
        { name: "Answer Short Question", count: "5–6", description: "Answer a simple question with a single word or short phrase." },
        { name: "Summarize Written Text", count: "1–2", description: "Summarize a passage in one sentence (up to 75 words)." },
        { name: "Write Essay", count: "1–2", description: "Write a 200–300 word argumentative essay on a given topic." }
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
      className="max-w-4xl mx-auto space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors">
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">PTE EXAM PATTERN</h2>
          <p className="text-[#C5C6C7]/50 font-bold uppercase tracking-widest text-xs">Official Pearson Standards</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-[#1F2833] rounded-3xl border border-[#45A29E]/10 overflow-hidden">
            <div className="p-6 border-b border-[#45A29E]/10 bg-[#0B0C10]/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-2 h-8 rounded-full bg-current", section.color)} />
                <h3 className="text-xl font-bold text-white">{section.title}</h3>
              </div>
              <div className="px-3 py-1 bg-[#45A29E]/10 rounded-full border border-[#45A29E]/20">
                <span className="text-xs font-bold text-[#45A29E]">{section.duration}</span>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {section.tasks.map((task, tIdx) => (
                  <div key={tIdx} className="flex items-start gap-4 p-4 bg-[#0B0C10]/50 rounded-2xl border border-[#45A29E]/5 hover:border-[#45A29E]/20 transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-[#1F2833] flex items-center justify-center font-black text-[#45A29E] shrink-0 group-hover:bg-[#45A29E] group-hover:text-[#0B0C10] transition-all">
                      {task.count}
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-white group-hover:text-[#45A29E] transition-colors">{task.name}</h4>
                      <p className="text-xs text-[#C5C6C7]/60 leading-relaxed">{task.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-8 bg-gradient-to-br from-[#45A29E]/20 to-transparent rounded-3xl border border-[#45A29E]/20 text-center space-y-4">
        <ShieldCheck className="mx-auto text-[#45A29E]" size={48} />
        <h3 className="text-2xl font-bold text-white">Ready to start your training?</h3>
        <p className="text-[#C5C6C7] max-w-md mx-auto">Our AI-powered platform follows these exact patterns to ensure you are fully prepared for the actual exam.</p>
        <button 
          onClick={onBack}
          className="px-8 py-4 bg-[#45A29E] text-[#0B0C10] font-bold rounded-2xl hover:bg-[#66FCF1] transition-all shadow-[0_0_30px_rgba(69,162,158,0.3)]"
        >
          Go to Dojo
        </button>
      </div>
    </motion.div>
  );
}

function SectionView({ section, user, onBack, onSelectTask }: { section: PTESection, user: any, onBack: () => void, onSelectTask: (task: PTETask, allTasks: PTETask[]) => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const tasks = PTE_TASKS.filter(t => t.section === section);
  
  // Group tasks by category
  const categories = Array.from(new Set(tasks.map(t => t.category)));
  
  const sectionInfo = {
    speaking: { icon: Mic, color: 'text-[#45A29E]', bg: 'bg-[#45A29E]/10' },
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
      className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-20 px-4 md:px-0"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4 md:mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <button onClick={handleBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors shrink-0">
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div className={cn("p-3 rounded-2xl shrink-0", sectionInfo[section].bg)}>
            <Icon className={sectionInfo[section].color} size={28} />
          </div>
          <h2 className="text-2xl font-bold text-white capitalize sm:hidden">
            {selectedCategory || `${section}`}
          </h2>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white capitalize hidden sm:block">
            {selectedCategory || `${section} Dojo`}
          </h2>
          <p className="text-sm text-[#C5C6C7]">
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
                  onClick={() => setSelectedCategory(category)}
                  className="flex items-center gap-4 p-6 bg-[#1F2833] border border-[#45A29E]/5 rounded-2xl hover:border-[#45A29E]/40 transition-all group text-left relative overflow-hidden"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#0B0C10] flex items-center justify-center group-hover:bg-[#45A29E] transition-colors shrink-0">
                    <Icon size={24} className={cn("transition-colors", sectionInfo[section].color, "group-hover:text-[#0B0C10]")} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white group-hover:text-[#66FCF1] transition-colors text-lg">{category}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-[#0B0C10] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#45A29E]" 
                          style={{ width: `${(completedInCategory / categoryTasks.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#C5C6C7] font-bold">{completedInCategory}/{categoryTasks.length}</span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-[#45A29E] shrink-0" />
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
            {filteredTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  isCompleted={user?.completedTasks?.includes(task.id)}
                  onClick={() => onSelectTask(task, filteredTasks)} 
                />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TaskCard({ task, isCompleted, onClick }: { task: PTETask, isCompleted?: boolean, onClick: () => void }) {
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
      'Re-tell Lecture': 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
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
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 md:gap-4 p-3 md:p-5 bg-[#1F2833] border border-[#45A29E]/5 rounded-2xl hover:border-[#45A29E]/40 transition-all group text-left relative overflow-hidden w-full border-l-4",
        task.section === 'speaking' ? 'border-l-rose-500' :
        task.section === 'writing' ? 'border-l-sky-500' :
        task.section === 'reading' ? 'border-l-emerald-500' :
        'border-l-violet-500'
      )}
    >
      <div className={cn(
        "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-colors shrink-0",
        isCompleted ? "bg-green-500/20 text-green-500" : "bg-[#0B0C10] text-[#45A29E] group-hover:bg-[#45A29E] group-hover:text-[#0B0C10]"
      )}>
        {isCompleted ? <Check size={20} className="md:w-6 md:h-6" /> : <Play size={18} className="md:w-5 md:h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="font-bold text-white group-hover:text-[#66FCF1] transition-colors truncate text-sm md:text-base">{task.title}</h4>
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
        <p className="text-[10px] md:text-xs text-[#C5C6C7] line-clamp-1">{task.description}</p>
      </div>
      <ChevronRight size={14} className="text-[#45A29E] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hidden sm:block" />
    </button>
  );
}

function StatBox({ label, value, color, onClick }: { label: string, value: string, color: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="bg-[#1F2833] p-4 rounded-2xl border border-[#45A29E]/5 flex flex-col items-center hover:border-[#45A29E]/40 hover:bg-[#1F2833]/80 transition-all group"
    >
      <span className="text-xs font-bold text-[#C5C6C7] uppercase tracking-widest mb-1 group-hover:text-[#45A29E] transition-colors">{label}</span>
      <span className={cn("text-2xl font-black", color)}>{value}</span>
    </button>
  );
}

function TaskModal({ 
  task, 
  onClose, 
  onFinish,
  onPrev,
  onNext
}: { 
  task: PTETask, 
  onClose: () => void, 
  onFinish: (score: number) => void,
  onPrev?: () => void,
  onNext?: () => void
}) {
  const [phase, setPhase] = useState<'prep' | 'audio' | 'recording' | 'analyzing' | 'feedback'>(() => {
    const isListeningPrep = task.section === 'listening' || 
                           task.category === 'Repeat Sentence' || 
                           task.category === 'Answer Short Question' || 
                           task.category === 'Write from Dictation';
    
    if (isListeningPrep) return 'prep';
    return task.hasAudio ? 'audio' : (task.prepTime === 0 || task.section === 'reading' ? 'recording' : 'prep');
  });
  const [timeLeft, setTimeLeft] = useState(() => {
    if (task.category === 'Repeat Sentence' || task.category === 'Answer Short Question' || task.category === 'Write from Dictation') {
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
  const [hasAudioError, setHasAudioError] = useState(false);
  const [audioRetryCount, setAudioRetryCount] = useState(0);
  const [prefetchedAudioBase64, setPrefetchedAudioBase64] = useState<string | null>(null);
  const audioFetchPromiseRef = useRef<Promise<string | null> | null>(null);
  const [userInput, setUserInput] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [reorderedParagraphs, setReorderedParagraphs] = useState<string[]>(task.paragraphs || []);
  const [targetParagraphs, setTargetParagraphs] = useState<string[]>([]);
  const [blankAnswers, setBlankAnswers] = useState<{ [key: string]: string }>({});
  const [feedback, setFeedback] = useState<any>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchedAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Helper to play a beep sound using a persistent AudioContext
  const playBeep = () => {
    return new Promise<void>((resolve) => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        
        // Resume context if it was suspended (common browser policy)
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1000, ctx.currentTime);
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        oscillator.onended = () => {
          resolve();
        };

        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.4);
      } catch (e) {
        console.error("Beep failed", e);
        resolve();
      }
    });
  };

  useEffect(() => {
    // Reset phase and timer for new task
    const isListeningPrep = task.section === 'listening' || 
                           task.category === 'Repeat Sentence' || 
                           task.category === 'Answer Short Question' || 
                           task.category === 'Write from Dictation';
    
    const initialPhase = isListeningPrep ? 'prep' : (task.hasAudio ? 'audio' : (task.prepTime === 0 || task.section === 'reading' ? 'recording' : 'prep'));
    
    setPhase(initialPhase);
    
    let initialTime = 0;
    if (task.category === 'Repeat Sentence' || task.category === 'Answer Short Question' || task.category === 'Write from Dictation') {
      initialTime = 3;
    } else if (task.category === 'Summarize Spoken Text') {
      initialTime = 12;
    } else if (task.section === 'listening' && task.hasAudio) {
      initialTime = 7;
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
    prefetchedAudioRef.current = null;
  }, [task.id, task.category, task.paragraphs, task.section, task.hasAudio, task.prepTime, task.recordingTime]);

  // Pre-fetch audio logic
  useEffect(() => {
    let isCancelled = false;
    audioFetchPromiseRef.current = null;
    setPrefetchedAudioBase64(null);
    prefetchedAudioRef.current = null;

    if (task.hasAudio) {
      const prefetch = async () => {
        const audioContent = task.transcript || task.prompt || "";
        const promise = generateTTS(audioContent);
        audioFetchPromiseRef.current = promise;
        
        try {
          const base64 = await promise;
          if (isCancelled) return;
          if (base64) {
            setPrefetchedAudioBase64(base64);
            const audio = new Audio(`data:audio/wav;base64,${base64}`);
            audio.load();
            prefetchedAudioRef.current = audio;
          }
        } catch (err) {
          console.error("Pre-fetch TTS failed:", err);
        }
      };
      prefetch();
    }
    return () => {
      isCancelled = true;
      audioFetchPromiseRef.current = null;
      prefetchedAudioRef.current = null;
    };
  }, [task.id]);

  // Audio logic
  useEffect(() => {
    let isCancelled = false;
    if (phase === 'audio' && task.hasAudio) {
      const playAudio = async () => {
        // Start beep immediately if needed
        const needsBeep = task.section === 'listening' || 
                         task.category === 'Repeat Sentence' || 
                         task.category === 'Answer Short Question' || 
                         task.category === 'Write from Dictation';
        
        try {
          setHasAudioError(false);
          setIsAudioPlaying(false);
          setIsPreparingAudio(false);

          let audio = prefetchedAudioRef.current;
          
          if (!audio) {
            let base64 = prefetchedAudioBase64;
            if (!base64) {
              setIsPreparingAudio(true);
              if (audioFetchPromiseRef.current) {
                console.log("Waiting for pre-fetch to complete...");
                base64 = await audioFetchPromiseRef.current;
              } else {
                console.log("Starting on-demand audio generation...");
                const audioContent = task.transcript || task.prompt || "";
                base64 = await generateTTS(audioContent);
              }
              setIsPreparingAudio(false);
            }
            
            if (isCancelled) return;

            if (base64) {
              audio = new Audio(`data:audio/wav;base64,${base64}`);
              audio.load();
            }
          }
          
          if (isCancelled) return;

          if (audio) {
            audioRef.current = audio;
            
            // Wait for beep to finish before starting audio
            // We play the beep ONLY when the audio is ready to go
            if (needsBeep) {
              await playBeep();
            }
            
            if (isCancelled) return;

            audio.onplay = () => {
              if (!isCancelled) {
                setIsAudioPlaying(true);
                setIsPreparingAudio(false);
              }
            };
            audio.onended = () => {
              if (isCancelled) return;
              setIsAudioPlaying(false);
              setIsPreparingAudio(false);
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

            try {
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                await playPromise;
                if (!isCancelled) setIsAudioPlaying(true);
              }
            } catch (playErr: any) {
              // Ignore AbortError which happens when pause() is called before play() promise resolves
              if (!isCancelled && playErr.name !== 'AbortError') {
                console.error("Audio play failed:", playErr);
                setIsAudioPlaying(false);
                setIsPreparingAudio(false);
              }
            }
          } else {
            console.warn("Audio failed to load, showing error state...");
            if (!isCancelled) {
              setHasAudioError(true);
              setIsAudioPlaying(false);
              setIsPreparingAudio(false);
            }
          }
        } catch (err: any) {
          if (!isCancelled && err.name !== 'AbortError') {
            console.error("Audio playback failed:", err);
            setHasAudioError(true);
            setIsAudioPlaying(false);
            setIsPreparingAudio(false);
          }
        }
      };

      playAudio();

      return () => {
        isCancelled = true;
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        setIsAudioPlaying(false);
      };
    } else {
      // Ensure audio is stopped and state is reset if we're not in audio phase
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsAudioPlaying(false);
    }
  }, [phase, task.id, task.hasAudio, prefetchedAudioBase64, audioRetryCount]);

  // Recording logic
  useEffect(() => {
    if (phase === 'recording' && task.section === 'speaking') {
      startRecording();
    }
    return () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    };
  }, [phase]);

  const startRecording = async () => {
    try {
      // Play beep before recording starts
      await playBeep();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      recorder.start();
      setMediaRecorder(recorder);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const getAudioBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (chunksRef.current.length === 0) {
        reject(new Error("No audio chunks recorded"));
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
    if (phase === 'prep' || phase === 'recording') {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (phase === 'prep') {
              // If it was a countdown before audio
              const isListeningPrep = task.section === 'listening' || 
                                     task.category === 'Repeat Sentence' || 
                                     task.category === 'Answer Short Question' || 
                                     task.category === 'Write from Dictation';
              
              if (task.hasAudio && isListeningPrep && !audioRef.current) {
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
            } else {
              handleFinish();
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [phase, task.recordingTime, task.hasAudio, task.category]);

  const handleFinish = async () => {
    setPhase('analyzing');
    
    try {
      let result;
      if (task.section === 'speaking') {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          const stopPromise = new Promise(resolve => {
            mediaRecorder.onstop = resolve;
          });
          mediaRecorder.stop();
          await stopPromise;
        }
        const base64 = await getAudioBase64();
        if (!base64 || base64.length < 100) {
           throw new Error("No audio detected");
        }
        result = await analyzeSpeaking(base64, task.title, mediaRecorder?.mimeType || 'audio/webm');
      } else if (task.section === 'reading' || (task.section === 'listening' && task.category !== 'Summarize Spoken Text')) {
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
            if (answers[i] === ans) correctCount++;
          });
          score = Math.round((correctCount / maxScore) * 80) + 10;
          feedbackTips = correctCount === maxScore ? ["Perfect! All blanks filled correctly."] : [`You got ${correctCount} out of ${maxScore} blanks correct.`];
        } else if (task.category.includes('Multiple Choice')) {
          const correct = task.correctAnswers || [];
          maxScore = Math.max(correct.length, 1);
          let correctCount = 0;
          selectedOptions.forEach(opt => {
            if (correct.includes(opt)) correctCount++;
            else correctCount--; // Negative marking for some PTE tasks, but let's keep it simple
          });
          score = Math.max(10, Math.min(90, Math.round((correctCount / maxScore) * 80) + 10));
          feedbackTips = [`You selected ${selectedOptions.length} options. Correct options were: ${correct.join(', ')}`];
        } else if (task.category === 'Re-order Paragraphs') {
          const correct = task.correctAnswers || [];
          maxScore = Math.max(correct.length - 1, 1); // PTE scores adjacent pairs
          let correctPairs = 0;
          for (let i = 0; i < targetParagraphs.length - 1; i++) {
            const currentIdx = correct.indexOf(targetParagraphs[i]);
            const nextIdx = correct.indexOf(targetParagraphs[i+1]);
            if (nextIdx === currentIdx + 1) correctPairs++;
          }
          score = Math.round((correctPairs / maxScore) * 80) + 10;
          feedbackTips = [`You found ${correctPairs} correct adjacent pairs.`];
        } else if (task.category === 'Write from Dictation') {
          const userWords = userInput.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").split(/\s+/);
          const correctWords = (task.prompt || "").toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").split(/\s+/);
          maxScore = correctWords.length;
          let correctCount = 0;
          userWords.forEach(word => {
            if (correctWords.includes(word)) correctCount++;
          });
          score = Math.round((correctCount / maxScore) * 80) + 10;
          feedbackTips = [`You got ${correctCount} out of ${maxScore} words correct.`];
        }

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
      } else {
        let finalInput = userInput;
        
        if (!finalInput.trim() && task.category !== 'Re-order Paragraphs') {
           throw new Error("Please provide a response before submitting.");
        }
        result = await analyzeWriting(finalInput || "Re-ordered paragraphs submitted", task.title);
      }
      
      const tips = result.tips || result.feedback || ["Keep practicing!"];
      const mispronounced = result.mispronounced || [];
      
      if (task.section === 'writing') {
        setFeedback({
          overall: result.overall || 70,
          content: result.content || 70,
          grammar: result.grammar || 70,
          vocabulary: result.vocabulary || 70,
          spelling: result.spelling || 70,
          details: {
            hesitations: 0,
            mispronounced: [],
            pace: "N/A",
            stress: "N/A"
          },
          tips: Array.isArray(tips) ? tips : [tips]
        });
      } else {
        setFeedback({
          overall: result.overall || result.Score || 70,
          content: result.content || result.Content || 70,
          oralFluency: result.fluency || result.Fluency || result.oralFluency || 70,
          pronunciation: result.pronunciation || result.Pronunciation || 70,
          details: {
            hesitations: result.hesitations || 0,
            mispronounced: Array.isArray(mispronounced) ? mispronounced : [mispronounced],
            pace: result.pace || "Good",
            stress: result.stress || "Good"
          },
          tips: Array.isArray(tips) ? tips : [tips]
        });
      }
      onFinish(result.overall || result.Score || 70);
      setPhase('feedback');
    } catch (error) {
      console.error("Analysis failed:", error);
      setFeedback({
        overall: 10,
        content: 10,
        oralFluency: 10,
        pronunciation: 10,
        details: { hesitations: 0, mispronounced: [], pace: "N/A", stress: "N/A" },
        tips: [error instanceof Error ? error.message : "Analysis failed. Please try again."]
      });
      setPhase('feedback');
    }
  };

  const skipPrep = () => {
    if (task.hasAudio) {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0C10]/95 backdrop-blur-sm overflow-y-auto"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-[#1F2833] w-full max-w-2xl rounded-3xl border border-[#45A29E]/20 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] my-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#45A29E]/20 flex items-center justify-between bg-[#1F2833]">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-[#45A29E]/10 rounded-lg">
              {task.section === 'speaking' ? <Mic className="text-[#45A29E]" size={20} /> : 
               task.section === 'writing' ? <PenTool className="text-[#45A29E]" size={20} /> :
               task.section === 'reading' ? <BookOpen className="text-[#45A29E]" size={20} /> :
               <Headphones className="text-[#45A29E]" size={20} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-none">{task.category}</h3>
              <p className="text-[10px] text-[#45A29E] uppercase tracking-widest mt-1 font-bold">{task.title} • PTE Academic</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {onPrev && (
              <button 
                onClick={onPrev}
                className="p-2 hover:bg-[#0B0C10] rounded-full transition-colors text-[#C5C6C7] disabled:opacity-30"
                title="Previous Question"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {onNext && (
              <button 
                onClick={onNext}
                className="p-2 hover:bg-[#0B0C10] rounded-full transition-colors text-[#C5C6C7] disabled:opacity-30"
                title="Next Question"
              >
                <ChevronRight size={20} />
              </button>
            )}
            <div className="w-px h-6 bg-[#45A29E]/20 mx-2" />
            <button onClick={onClose} className="p-2 hover:bg-[#0B0C10] rounded-full transition-colors text-[#C5C6C7]">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Status Bar */}
          {(phase === 'prep' || phase === 'recording' || phase === 'audio') && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  phase === 'prep' ? "bg-yellow-500" : (phase === 'audio' ? "bg-blue-500" : "bg-red-500")
                )} />
                <span className="text-xs font-bold uppercase tracking-widest text-white">
                  {phase === 'audio' ? (isPreparingAudio ? "Preparing Audio" : "Listening") : (phase === 'prep' ? (task.hasAudio ? "Beginning in" : "Preparation") : (task.section === 'speaking' ? "Recording" : "Writing"))}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-mono font-bold text-white">
                  {phase === 'audio' ? (isPreparingAudio ? "..." : (isAudioPlaying ? "Playing" : "Loading...")) : formatTime(timeLeft)}
                </div>
                {phase === 'prep' && (
                  <button 
                    onClick={skipPrep}
                    className="text-[10px] font-bold text-[#45A29E] border border-[#45A29E]/30 px-3 py-1 rounded-full hover:bg-[#45A29E]/10 transition-all"
                  >
                    SKIP PREP
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Instruction Area */}
          <div className="bg-[#1F2833]/30 p-4 rounded-xl border border-[#45A29E]/20">
            <p className="text-sm text-white leading-relaxed">
              <span className="text-[#45A29E] font-bold mr-2">Instruction:</span>
              {task.description}
            </p>
          </div>

          {/* Prompt Area */}
          {!(task.category.includes('Fill in the Blanks') && task.section === 'reading') && (
            <div className="bg-[#0B0C10] p-8 rounded-2xl border border-[#45A29E]/10 relative group">
              <p className={cn(
                "text-white leading-relaxed font-medium",
                task.category === 'Read Aloud' ? "text-2xl" : "text-lg"
              )}>
                {/* Hide transcript for listening tasks, show prompt (instruction/question) */}
                {task.section === 'listening' 
                  ? (hasAudioError 
                      ? "Audio failed to load. Please check your connection and try again." 
                      : (phase === 'audio' ? "Listen carefully to the recording..." : (task.category === 'Fill in the Blanks' ? "Type the missing words in each blank." : (task.prompt || "Complete the task based on the recording."))))
                  : (task.prompt || "No prompt available for this task.")}
              </p>
              {hasAudioError && (
                <button 
                  onClick={() => {
                    setHasAudioError(false);
                    setAudioRetryCount(prev => prev + 1);
                  }}
                  className="mt-4 px-6 py-2 bg-[#45A29E] text-[#0B0C10] rounded-lg font-bold hover:bg-[#66FCF1] transition-all flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Retry Audio
                </button>
              )}
              {task.image && (
                <div className="mt-6 rounded-xl overflow-hidden border border-[#45A29E]/20">
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

          {/* Input Area (Writing, Reading, Listening) */}
          {task.section !== 'speaking' && phase === 'recording' && (
            <div className="space-y-6">
              {task.section === 'reading' ? (
                <div className="bg-[#0B0C10] p-8 rounded-2xl border border-[#45A29E]/20">
                  {task.category === 'Reading & Writing: Fill in the Blanks' ? (
                    <div className="text-white leading-relaxed text-lg">
                      {task.prompt?.split('________').map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <select
                              value={blankAnswers[i] || ''}
                              onChange={(e) => setBlankAnswers({ ...blankAnswers, [i]: e.target.value })}
                              className="mx-1 bg-[#1F2833] text-[#66FCF1] border border-[#45A29E]/40 rounded-md px-2 py-1 outline-none focus:border-[#66FCF1] transition-all cursor-pointer hover:bg-[#45A29E]/10 appearance-none pr-8 relative"
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2366FCF1'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 0.5rem center',
                                backgroundSize: '1.5em 1.5em'
                              }}
                            >
                              <option value="" className="bg-[#1F2833] text-[#66FCF1]">[Select]</option>
                              {task.blanks?.[i]?.map(opt => (
                                <option key={opt} value={opt} className="bg-[#1F2833] text-white">{opt}</option>
                              ))}
                            </select>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : task.category === 'Multiple Choice, Multiple Answer' || task.category === 'Multiple Choice, Single Answer' ? (
                    <div className="space-y-4">
                      {task.options?.map(option => (
                        <label key={option} className="flex items-center gap-4 p-4 rounded-xl border border-[#45A29E]/10 hover:bg-[#45A29E]/5 cursor-pointer transition-all">
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
                            className="w-5 h-5 accent-[#45A29E]"
                          />
                          <span className="text-white">{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : task.category === 'Re-order Paragraphs' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
                      {/* Source Panel */}
                      <div className="flex flex-col gap-3 p-4 bg-[#1F2833]/50 rounded-xl border border-[#45A29E]/20 overflow-y-auto">
                        <h4 className="text-[#C5C6C7] text-xs uppercase tracking-wider font-bold mb-2">Source</h4>
                        {reorderedParagraphs.map((para, i) => (
                          <motion.div 
                            key={para}
                            layoutId={para}
                            onClick={() => {
                              setTargetParagraphs([...targetParagraphs, para]);
                              setReorderedParagraphs(reorderedParagraphs.filter(p => p !== para));
                            }}
                            className="p-3 bg-[#0B0C10] rounded-lg border border-[#45A29E]/20 cursor-pointer hover:border-[#66FCF1] hover:text-[#66FCF1] transition-all text-sm text-white leading-relaxed"
                          >
                            {para}
                          </motion.div>
                        ))}
                      </div>
                      
                      {/* Target Panel */}
                      <div className="flex flex-col gap-3 p-4 bg-[#1F2833]/50 rounded-xl border border-[#45A29E]/20 overflow-y-auto">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-[#C5C6C7] text-xs uppercase tracking-wider font-bold">Target</h4>
                          {targetParagraphs.length > 0 && (
                            <button 
                              onClick={() => {
                                setReorderedParagraphs([...reorderedParagraphs, ...targetParagraphs]);
                                setTargetParagraphs([]);
                              }}
                              className="text-[10px] text-[#45A29E] hover:text-[#66FCF1] uppercase tracking-tighter"
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
                            className="p-3 bg-[#0B0C10] rounded-lg border border-[#66FCF1]/30 cursor-pointer hover:border-[#66FCF1] transition-all text-sm text-[#66FCF1] leading-relaxed relative group"
                          >
                            <span className="absolute -left-2 -top-2 w-5 h-5 bg-[#66FCF1] text-[#0B0C10] rounded-full flex items-center justify-center text-[10px] font-bold">
                              {i + 1}
                            </span>
                            {para}
                          </motion.div>
                        ))}
                        {targetParagraphs.length === 0 && (
                          <div className="flex-1 flex items-center justify-center border-2 border-dashed border-[#45A29E]/10 rounded-lg">
                            <p className="text-[#C5C6C7]/30 text-xs italic">Select from source to order</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : task.category === 'Reading: Fill in the Blanks' ? (
                    <div className="space-y-6">
                      <div className="text-white leading-relaxed p-4 bg-[#1F2833]/50 rounded-xl border border-[#45A29E]/10">
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
                                className="inline-block min-w-[100px] h-8 border-b-2 border-dashed border-[#45A29E] mx-2 text-center text-[#66FCF1] font-bold cursor-pointer hover:bg-[#45A29E]/10 transition-all"
                              >
                                {blankAnswers[i] || ''}
                              </span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 p-4 bg-[#1F2833] rounded-xl border border-[#45A29E]/20">
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
                            className="px-4 py-2 bg-[#0B0C10] border border-[#45A29E]/30 rounded-lg text-sm text-white hover:border-[#45A29E] hover:text-[#66FCF1] transition-all"
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
                    <textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="Type your response here..."
                      className="w-full h-48 bg-[#0B0C10] text-white p-6 rounded-2xl border border-[#45A29E]/20 focus:border-[#45A29E] outline-none transition-all resize-none"
                    />
                  )}
                </div>
              ) : task.section === 'listening' ? (
                <div className="bg-[#0B0C10] p-8 rounded-2xl border border-[#45A29E]/20">
                  {task.category === 'Fill in the Blanks' ? (
                    <div className="text-white leading-relaxed text-lg">
                      {task.prompt?.split('________').map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <input
                              type="text"
                              value={blankAnswers[i] || ''}
                              onChange={(e) => setBlankAnswers({ ...blankAnswers, [i]: e.target.value })}
                              placeholder={`[${i + 1}]`}
                              className="mx-1 w-32 bg-[#1F2833] text-[#66FCF1] border-b-2 border-[#45A29E]/40 focus:border-[#66FCF1] outline-none px-2 py-0.5 transition-all text-center"
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  ) : task.category === 'Highlight Correct Summary' || task.category.includes('Multiple Choice') ? (
                    <div className="space-y-4">
                      {task.options?.map(option => (
                        <label key={option} className="flex items-start gap-4 p-4 rounded-xl border border-[#45A29E]/10 hover:bg-[#45A29E]/5 cursor-pointer transition-all">
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
                            className="mt-1 w-5 h-5 accent-[#45A29E] shrink-0"
                          />
                          <span className="text-white text-sm leading-relaxed">{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="relative">
                      <textarea
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder={task.category === 'Write from Dictation' ? "Type the sentence you heard..." : "Type your response here..."}
                        className="w-full h-48 bg-[#0B0C10] text-white p-6 rounded-2xl border border-[#45A29E]/20 focus:border-[#45A29E] outline-none transition-all resize-none"
                      />
                      <div className="absolute bottom-4 right-6 text-[#C5C6C7] text-xs font-mono">
                        Words: {userInput.trim() ? userInput.trim().split(/\s+/).length : 0}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Type your response here..."
                    className="w-full h-48 bg-[#0B0C10] text-white p-6 rounded-2xl border border-[#45A29E]/20 focus:border-[#45A29E] outline-none transition-all resize-none"
                  />
                  <div className="absolute bottom-4 right-6 text-[#C5C6C7] text-xs font-mono">
                    Words: {userInput.trim() ? userInput.trim().split(/\s+/).length : 0}
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  {task.category !== 'Re-order Paragraphs' && !task.category.includes('Multiple Choice') && !task.category.includes('Fill in the Blanks') && (
                    <span className="text-xs text-[#C5C6C7]">Word count: {userInput.trim().split(/\s+/).filter(Boolean).length}</span>
                  )}
                  {task.section === 'listening' && isAudioPlaying && (
                    <span className="text-xs text-[#45A29E] font-bold animate-pulse">Audio Playing...</span>
                  )}
                </div>
                <button 
                  onClick={handleFinish}
                  className="bg-[#45A29E] text-[#0B0C10] px-6 py-2 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-[#66FCF1] transition-all"
                >
                  Submit Response
                </button>
              </div>
            </div>
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
                  <div className="w-20 h-20 border-4 border-[#45A29E]/20 border-t-[#45A29E] rounded-full animate-spin" />
                  <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#45A29E]" size={32} />
                </div>
                <div className="text-center">
                  <h4 className="text-xl font-bold text-white mb-2">Sensei AI is Scoring...</h4>
                  <p className="text-sm text-[#C5C6C7]">Analyzing fluency, pronunciation, and content accuracy.</p>
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
                <div className="bg-[#0B0C10] rounded-3xl p-6 border border-[#45A29E]/20">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h4 className="text-sm font-bold text-[#45A29E] uppercase tracking-widest">Ninja Scoreboard</h4>
                      <p className="text-xs text-[#C5C6C7]">Based on PTE Global Scale of English</p>
                    </div>
                    <div className="text-5xl font-black text-[#66FCF1] drop-shadow-[0_0_10px_rgba(102,252,241,0.3)]">
                      {feedback.overall}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {task.section === 'writing' ? (
                      <>
                        <ScoreMetric label="Grammar" score={feedback.grammar} max={90} />
                        <ScoreMetric label="Vocabulary" score={feedback.vocabulary} max={90} />
                        <ScoreMetric label="Spelling" score={feedback.spelling} max={90} />
                      </>
                    ) : task.section === 'speaking' ? (
                      <>
                        <ScoreMetric label="Content" score={feedback.content} max={90} />
                        <ScoreMetric label="Oral Fluency" score={feedback.oralFluency} max={90} />
                        <ScoreMetric label="Pronunciation" score={feedback.pronunciation} max={90} />
                      </>
                    ) : (
                      <>
                        <ScoreMetric label="Content" score={feedback.content} max={90} />
                        <div className="col-span-2" />
                      </>
                    )}
                  </div>
                </div>

                {/* Reading Answer Key */}
                {task.section === 'reading' && task.correctAnswers && (
                  <div className="bg-[#0B0C10] rounded-2xl p-6 border border-[#45A29E]/20 space-y-4">
                    <h5 className="text-sm font-bold text-white flex items-center gap-2">
                      <Check size={16} className="text-[#45A29E]" />
                      Answer Key & Feedback
                    </h5>
                    
                    {task.category.includes('Fill in the Blanks') ? (
                      <div className="text-sm leading-relaxed text-[#C5C6C7] bg-[#1F2833]/50 p-4 rounded-xl border border-white/5">
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
                                    : "bg-[#1F2833] border-white/5 text-[#C5C6C7]"
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
                            <h6 className="text-[10px] font-bold text-[#C5C6C7] uppercase">Your Order</h6>
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
                            <h6 className="text-[10px] font-bold text-[#C5C6C7] uppercase">Correct Order</h6>
                            {task.correctAnswers?.map((para, i) => (
                              <div key={i} className="p-2 bg-[#1F2833] rounded-lg border border-white/5 text-[10px] leading-tight text-[#C5C6C7]">
                                {i + 1}. {para.substring(0, 100)}...
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Detailed Analysis */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1F2833] p-4 rounded-2xl border border-white/5">
                    <h5 className="text-[10px] font-bold text-[#C5C6C7] uppercase mb-3">Diagnostic Data</h5>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>Hesitations</span>
                        <span className="text-orange-400 font-bold">{feedback.details.hesitations}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span>Pace</span>
                        <span className="text-[#66FCF1] font-bold">{feedback.details.pace}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1F2833] p-4 rounded-2xl border border-white/5">
                    <h5 className="text-[10px] font-bold text-[#C5C6C7] uppercase mb-3">Mispronounced</h5>
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(feedback.details.mispronounced) && feedback.details.mispronounced.map((word: string) => (
                        <span key={word} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded-md border border-red-500/20">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tips */}
                <div className="bg-[#45A29E]/5 p-6 rounded-2xl border border-[#45A29E]/20">
                  <h5 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Zap size={16} className="text-[#45A29E]" />
                    Sensei's Wisdom
                  </h5>
                  <ul className="space-y-3">
                    {Array.isArray(feedback.tips) && feedback.tips.map((tip: string, i: number) => (
                      <li key={i} className="text-xs text-[#C5C6C7] flex gap-3 leading-relaxed">
                        <span className="text-[#45A29E] font-bold">0{i+1}</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setFeedback(null);
                      setPhase('prep');
                      setTimeLeft(35);
                    }}
                    className="flex-1 py-4 bg-[#45A29E] text-[#0B0C10] rounded-2xl font-bold uppercase tracking-widest hover:bg-[#66FCF1] transition-all"
                  >
                    Retrain
                  </button>
                  <button 
                    onClick={onClose}
                    className="flex-1 py-4 border border-[#45A29E]/20 text-white rounded-2xl font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
                  >
                    Next Task
                  </button>
                </div>
              </motion.div>
            ) : (phase === 'audio' || (phase === 'prep' && (task.section === 'speaking' || task.section === 'listening' || task.hasAudio)) || (phase === 'recording' && task.section === 'speaking')) ? (
              <motion.div 
                key="active"
                className="flex flex-col items-center py-8"
              >
                {(phase === 'recording' && task.section === 'speaking') || isAudioPlaying ? (
                  <>
                    <div className="w-full h-24 flex items-center justify-center gap-1 mb-4">
                      {[...Array(20)].map((_, i) => (
                        <motion.div 
                          key={i}
                          animate={(isAudioPlaying || (phase === 'recording' && task.section === 'speaking')) 
                            ? { height: [10, Math.random() * 40 + 10, 10] } 
                            : { height: 10 }
                          }
                          transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
                          className={cn(
                            "w-1.5 rounded-full",
                            isAudioPlaying ? "bg-blue-400" : "bg-[#45A29E]"
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-[#C5C6C7] animate-pulse mb-8">
                      {phase === 'audio' ? "Listening to audio..." : "Recording your response..."}
                    </p>
                  </>
                ) : (
                  <div className="w-full h-24 flex items-center justify-center gap-1 mb-4">
                    {[...Array(20)].map((_, i) => (
                      <div key={i} className="w-1.5 h-[10px] rounded-full bg-[#45A29E]/20" />
                    ))}
                  </div>
                )}
                
                <div className="flex flex-col items-center gap-4">
                  <button 
                    disabled={phase === 'audio' && isAudioPlaying}
                    onClick={() => {
                      if (phase === 'audio' && !isAudioPlaying) {
                        // Manual trigger if auto-play fails
                        if (audioRef.current) {
                          audioRef.current.play().catch(e => console.error("Manual play failed", e));
                          setIsAudioPlaying(true);
                        } else {
                          setAudioRetryCount(prev => prev + 1);
                        }
                      } else if (phase === 'recording') {
                        handleFinish();
                      } else if (phase === 'prep') {
                        skipPrep();
                      }
                    }}
                    className={cn(
                      "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl",
                      phase === 'recording' ? "bg-red-500 shadow-red-500/20" : 
                      (phase === 'audio' ? (isAudioPlaying ? "bg-blue-500/50 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-400") : 
                      (task.hasAudio ? "bg-blue-500 hover:bg-blue-400 shadow-blue-500/20" : "bg-[#45A29E] shadow-[#45A29E]/20"))
                    )}
                  >
                    {phase === 'recording' ? <div className="w-8 h-8 bg-white rounded-sm" /> : 
                     (phase === 'audio' ? (isAudioPlaying ? <Headphones size={40} className="text-white" /> : <Play size={40} className="text-white ml-1" />) : 
                     (task.hasAudio ? <Play size={40} className="text-white ml-1" /> : <Play size={40} className="text-[#0B0C10] ml-1" />))}
                  </button>
                  
                  {phase === 'audio' && !isAudioPlaying && (
                    <p className="text-[10px] text-blue-400 font-bold animate-bounce">Click to play audio if it doesn't start</p>
                  )}
                </div>
                <p className="mt-6 text-xs font-bold text-[#C5C6C7] uppercase tracking-[0.3em]">
                  {phase === 'audio' ? "Listening..." : (phase === 'prep' ? "Preparing..." : (task.section === 'speaking' ? "Recording Now" : "Starting Task"))}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ScoreMetric({ label, score, max }: { label: string, score: number, max: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold text-[#C5C6C7] uppercase tracking-wider">{label}</span>
        <span className="text-sm font-bold text-white">{score}</span>
      </div>
      <div className="h-1.5 bg-[#1F2833] rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${(score / max) * 100}%` }}
          className="h-full bg-[#45A29E]"
        />
      </div>
    </div>
  );
}


