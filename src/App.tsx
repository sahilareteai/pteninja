import React, { useState, useEffect } from 'react';
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
  Lock, 
  Play,
  Settings,
  User,
  BarChart3,
  Flame
} from 'lucide-react';
import { cn } from './lib/utils';
import { PTE_TASKS, PTESection, PTETask, UserProgress } from './types';

// Mock Data for Initial State
const INITIAL_PROGRESS: UserProgress = {
  targetScore: 79,
  currentScore: 65,
  streak: 12,
  completedTasks: []
};

export default function App() {
  const [activeTab, setActiveTab] = useState<PTESection | 'dashboard'>('dashboard');
  const [progress, setProgress] = useState<UserProgress>(INITIAL_PROGRESS);
  const [selectedTask, setSelectedTask] = useState<PTETask | null>(null);

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
            <div className="w-10 h-10 bg-[#45A29E] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(69,162,158,0.3)]">
              <Zap className="text-[#0B0C10] fill-current" size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter text-white font-display">
              PTE <span className="text-[#45A29E]">NINJA</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#1F2833] rounded-full border border-[#45A29E]/20">
              <Flame className="text-orange-500" size={16} />
              <span className="text-sm font-bold text-white">{progress.streak} DAY STREAK</span>
            </div>
            <button className="p-2 hover:bg-[#1F2833] rounded-full transition-colors">
              <Settings size={20} />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#45A29E] to-[#66FCF1] p-[2px]">
              <div className="w-full h-full rounded-full bg-[#0B0C10] flex items-center justify-center">
                <User size={20} className="text-[#45A29E]" />
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <Dashboard key="dashboard" progress={progress} onStartTask={(task) => {
                setSelectedTask(task);
                setActiveTab(task.section);
              }} />
            ) : (
              <SectionView 
                key={activeTab} 
                section={activeTab} 
                onBack={() => setActiveTab('dashboard')} 
                onSelectTask={setSelectedTask}
              />
            )}
          </AnimatePresence>
        </main>

        {/* Navigation Bar */}
        <nav className="flex items-center justify-around px-4 py-3 border-t border-[#1F2833] bg-[#0B0C10]/90 backdrop-blur-xl">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<BarChart3 />} label="Dojo" />
          <NavButton active={activeTab === 'speaking'} onClick={() => setActiveTab('speaking')} icon={<Mic />} label="Speak" />
          <NavButton active={activeTab === 'writing'} onClick={() => setActiveTab('writing')} icon={<PenTool />} label="Write" />
          <NavButton active={activeTab === 'reading'} onClick={() => setActiveTab('reading')} icon={<BookOpen />} label="Read" />
          <NavButton active={activeTab === 'listening'} onClick={() => setActiveTab('listening')} icon={<Headphones />} label="Listen" />
        </nav>
      </div>

      {/* Task Modal Overlay */}
      <AnimatePresence>
        {selectedTask && (
          <TaskModal task={selectedTask} onClose={() => setSelectedTask(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all duration-300 relative group",
        active ? "text-[#45A29E]" : "text-[#C5C6C7] hover:text-white"
      )}
    >
      <div className={cn(
        "p-2 rounded-xl transition-all",
        active ? "bg-[#45A29E]/10" : "group-hover:bg-[#1F2833]"
      )}>
        {React.cloneElement(icon as React.ReactElement, { size: 24 })}
      </div>
      <span className="text-[10px] uppercase tracking-widest font-bold">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-indicator"
          className="absolute -bottom-3 w-1 h-1 bg-[#45A29E] rounded-full shadow-[0_0_8px_#45A29E]"
        />
      )}
    </button>
  );
}

function Dashboard({ progress, onStartTask }: { progress: UserProgress, onStartTask: (task: PTETask) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      {/* Progress Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-[#1F2833] rounded-3xl p-8 border border-[#45A29E]/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Trophy size={120} />
          </div>
          <div className="relative z-10">
            <h2 className="text-sm font-bold text-[#45A29E] uppercase tracking-[0.2em] mb-2">Path to Mastery</h2>
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-6xl font-black text-white">{progress.currentScore}</span>
              <span className="text-xl text-[#C5C6C7]">/ {progress.targetScore}</span>
            </div>
            <div className="w-full h-3 bg-[#0B0C10] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${(progress.currentScore / 90) * 100}%` }}
                className="h-full bg-gradient-to-r from-[#45A29E] to-[#66FCF1] shadow-[0_0_15px_rgba(69,162,158,0.5)]"
              />
            </div>
            <p className="mt-4 text-sm text-[#C5C6C7]">You are in the <span className="text-[#66FCF1] font-bold">Top 15%</span> of students this week.</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#45A29E] to-[#1F2833] rounded-3xl p-8 flex flex-col justify-between text-[#0B0C10]">
          <div>
            <Target size={32} className="mb-4" />
            <h3 className="text-xl font-bold leading-tight">Next Milestone: <br/>Black Belt</h3>
          </div>
          <button className="mt-6 w-full py-3 bg-[#0B0C10] text-[#45A29E] rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-all">
            View Roadmap
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
          <button className="text-sm text-[#45A29E] font-bold hover:underline">View All</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PTE_TASKS.slice(0, 4).map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onStartTask(task)} />
          ))}
        </div>
      </section>

      {/* Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Fluency" value="78" color="text-[#66FCF1]" />
        <StatBox label="Grammar" value="62" color="text-orange-500" />
        <StatBox label="Vocab" value="84" color="text-[#66FCF1]" />
        <StatBox label="Pronunc." value="71" color="text-yellow-500" />
      </section>
    </motion.div>
  );
}

function SectionView({ section, onBack, onSelectTask }: { section: PTESection, onBack: () => void, onSelectTask: (task: PTETask) => void }) {
  const tasks = PTE_TASKS.filter(t => t.section === section);
  
  const sectionInfo = {
    speaking: { icon: <Mic />, color: 'text-[#45A29E]', bg: 'bg-[#45A29E]/10' },
    writing: { icon: <PenTool />, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    reading: { icon: <BookOpen />, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    listening: { icon: <Headphones />, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-2 hover:bg-[#1F2833] rounded-full transition-colors">
          <ChevronRight className="rotate-180" />
        </button>
        <div className={cn("p-3 rounded-2xl", sectionInfo[section].bg)}>
          {React.cloneElement(sectionInfo[section].icon as React.ReactElement, { className: sectionInfo[section].color, size: 28 })}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white capitalize">{section} Dojo</h2>
          <p className="text-sm text-[#C5C6C7]">{tasks.length} specialized training modules</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task)} />
        ))}
      </div>
    </motion.div>
  );
}

function TaskCard({ task, onClick }: { task: PTETask, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-4 p-5 bg-[#1F2833] border border-[#45A29E]/5 rounded-2xl hover:border-[#45A29E]/40 transition-all group text-left"
    >
      <div className="w-12 h-12 rounded-xl bg-[#0B0C10] flex items-center justify-center group-hover:bg-[#45A29E] transition-colors">
        <Play size={20} className="text-[#45A29E] group-hover:text-[#0B0C10]" />
      </div>
      <div className="flex-1">
        <h4 className="font-bold text-white group-hover:text-[#66FCF1] transition-colors">{task.title}</h4>
        <p className="text-xs text-[#C5C6C7] line-clamp-1">{task.description}</p>
      </div>
      <ChevronRight size={16} className="text-[#45A29E] opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function StatBox({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="bg-[#1F2833] p-4 rounded-2xl border border-[#45A29E]/5 flex flex-col items-center">
      <span className="text-xs font-bold text-[#C5C6C7] uppercase tracking-widest mb-1">{label}</span>
      <span className={cn("text-2xl font-black", color)}>{value}</span>
    </div>
  );
}

function TaskModal({ task, onClose }: { task: PTETask, onClose: () => void }) {
  const [phase, setPhase] = useState<'prep' | 'recording' | 'analyzing' | 'feedback'>('prep');
  const [timeLeft, setTimeLeft] = useState(35); // PTE Read Aloud prep is usually 35-40s
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState<any>(null);

  // Timer logic
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (phase === 'prep' || phase === 'recording') {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (phase === 'prep') {
              setPhase('recording');
              return 40; // Recording time
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
  }, [phase]);

  const handleFinish = () => {
    setPhase('analyzing');
    // Simulate AI Analysis with PTE Scoring Criteria
    setTimeout(() => {
      setFeedback({
        overall: 78,
        content: 85, // Max 5
        oralFluency: 72, // Max 5
        pronunciation: 77, // Max 5
        details: {
          hesitations: 2,
          mispronounced: ["sustainable", "innovation"],
          pace: "Good",
          stress: "Needs improvement on multi-syllabic words"
        },
        tips: [
          "Maintain a steady pace without artificial pauses.",
          "Focus on the 's' sounds in 'sustainable' and 'sources'.",
          "Try to group words into meaningful phrases."
        ]
      });
      setPhase('feedback');
    }, 2500);
  };

  const skipPrep = () => {
    setPhase('recording');
    setTimeLeft(40);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0C10]/95 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-[#1F2833] w-full max-w-2xl rounded-3xl border border-[#45A29E]/20 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#1F2833] flex items-center justify-between bg-[#1F2833]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#45A29E]/10 rounded-lg">
              {task.section === 'speaking' ? <Mic className="text-[#45A29E]" size={20} /> : <PenTool className="text-[#45A29E]" size={20} />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-none">{task.title}</h3>
              <p className="text-[10px] text-[#45A29E] uppercase tracking-widest mt-1 font-bold">PTE Academic Standard</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#0B0C10] rounded-full transition-colors text-[#C5C6C7]">
            <ChevronRight className="rotate-90" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* Status Bar */}
          {(phase === 'prep' || phase === 'recording') && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  phase === 'prep' ? "bg-yellow-500" : "bg-red-500"
                )} />
                <span className="text-xs font-bold uppercase tracking-widest text-white">
                  {phase === 'prep' ? "Preparation" : "Recording"}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-mono font-bold text-white">
                  00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
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

          {/* Prompt Area */}
          <div className="bg-[#0B0C10] p-8 rounded-2xl border border-[#45A29E]/10 relative group">
            <div className="absolute -top-3 left-6 px-3 py-1 bg-[#1F2833] border border-[#45A29E]/20 rounded-full text-[10px] font-bold text-[#45A29E] uppercase tracking-widest">
              Prompt
            </div>
            <p className="text-xl text-white leading-relaxed font-medium">
              "The development of sustainable energy sources is one of the most pressing challenges facing modern society, requiring both technological innovation and significant policy shifts."
            </p>
          </div>

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
                    <ScoreMetric label="Content" score={feedback.content} max={90} />
                    <ScoreMetric label="Oral Fluency" score={feedback.oralFluency} max={90} />
                    <ScoreMetric label="Pronunciation" score={feedback.pronunciation} max={90} />
                  </div>
                </div>

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
                      {feedback.details.mispronounced.map((word: string) => (
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
                    {feedback.tips.map((tip: string, i: number) => (
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
            ) : (
              <motion.div 
                key="active"
                className="flex flex-col items-center py-8"
              >
                {phase === 'recording' && (
                  <div className="w-full h-24 flex items-center justify-center gap-1 mb-8">
                    {[...Array(20)].map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={{ height: [10, Math.random() * 60 + 10, 10] }}
                        transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
                        className="w-1.5 bg-[#45A29E] rounded-full"
                      />
                    ))}
                  </div>
                )}
                
                <button 
                  onClick={phase === 'recording' ? handleFinish : skipPrep}
                  className={cn(
                    "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl",
                    phase === 'recording' ? "bg-red-500 shadow-red-500/20" : "bg-[#45A29E] shadow-[#45A29E]/20"
                  )}
                >
                  {phase === 'recording' ? <div className="w-8 h-8 bg-white rounded-sm" /> : <Play size={40} className="text-[#0B0C10] ml-1" />}
                </button>
                <p className="mt-6 text-xs font-bold text-[#C5C6C7] uppercase tracking-[0.3em]">
                  {phase === 'prep' ? "Preparing..." : "Recording Now"}
                </p>
              </motion.div>
            )}
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


