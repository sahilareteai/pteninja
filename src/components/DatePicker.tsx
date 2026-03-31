import React, { useState, useRef, useEffect } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  isBefore,
  startOfToday,
  parseISO,
  isValid
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  placeholder?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({ 
  value, 
  onChange, 
  minDate, 
  placeholder = "Select date" 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? parseISO(value) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value && isValid(parseISO(value)) ? parseISO(value) : null;
  const min = minDate ? parseISO(minDate) : startOfToday();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-app-text-muted hover:text-app-primary"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-bold text-app-text uppercase tracking-wider">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-app-text-muted hover:text-app-primary"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map((day) => (
          <div key={day} className="text-[10px] font-bold text-center text-app-text-muted/50 uppercase py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const calendarDays = eachDayOfInterval({
      start: startDate,
      end: endDate,
    });

    return (
      <div className="grid grid-cols-7 gap-1 p-2">
        {calendarDays.map((day) => {
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isPast = isBefore(day, min) && !isSameDay(day, min);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toString()}
              disabled={isPast}
              onClick={() => {
                onChange(format(day, 'yyyy-MM-dd'));
                setIsOpen(false);
              }}
              className={`
                relative h-9 w-9 flex items-center justify-center rounded-lg text-xs font-medium transition-all
                ${!isCurrentMonth ? 'text-app-text-muted/20' : 'text-app-text'}
                ${isPast ? 'opacity-20 cursor-not-allowed' : 'hover:bg-app-primary/10 hover:text-app-primary cursor-pointer'}
                ${isSelected ? 'bg-app-primary text-app-bg font-bold shadow-lg shadow-app-primary/20 hover:bg-app-primary hover:text-app-bg' : ''}
                ${isToday && !isSelected ? 'border border-app-primary/30' : ''}
              `}
            >
              {format(day, 'd')}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-app-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center justify-between w-full bg-app-bg border rounded-xl px-4 py-3 cursor-pointer transition-all
          ${isOpen ? 'border-app-primary ring-1 ring-app-primary/20' : 'border-app-primary/30 hover:border-app-primary'}
        `}
      >
        <span className={`font-bold text-lg ${value ? 'text-app-text' : 'text-app-text-muted/50'}`}>
          {value ? format(parseISO(value), 'dd MMM yyyy') : placeholder}
        </span>
        <CalendarIcon className={`transition-colors ${isOpen ? 'text-app-primary' : 'text-app-text-muted/50'}`} size={20} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 5, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute z-[9999] top-full left-0 w-full min-w-[280px] bg-app-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl"
          >
            {renderHeader()}
            <div className="p-2">
              {renderDays()}
              {renderCells()}
            </div>
            <div className="p-3 border-t border-white/5 flex justify-between items-center bg-white/5">
              <button 
                onClick={() => {
                  onChange(format(new Date(), 'yyyy-MM-dd'));
                  setCurrentMonth(new Date());
                  setIsOpen(false);
                }}
                className="text-[10px] font-bold uppercase tracking-widest text-app-primary hover:text-app-accent transition-colors"
              >
                Today
              </button>
              <button 
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
