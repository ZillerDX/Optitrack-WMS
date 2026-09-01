/**
 * Modern DatePicker Component
 * Dark glassmorphism single-date selector for OptiTrack WMS
 */

import { useState, useRef, useEffect } from 'react';
import { format, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function formatDateValue(value: string) {
  if (!value) return 'Select date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy');
}

function buildCalendarDays(displayMonth: Date) {
  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startDay = firstDayOfMonth.getDay();

  const days: Date[] = [];
  for (let index = 0; index < 42; index++) {
    const day = new Date(year, month, 1 - startDay + index);
    days.push(day);
  }
  return days;
}

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });

  const selectedDate = value ? new Date(value) : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectDate = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  const applyQuickDate = (offsetDays: number) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + offsetDays);
    setDisplayMonth(nextDate);
    onChange(format(nextDate, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  const days = buildCalendarDays(displayMonth);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2 text-slate-100 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
          <Calendar className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 text-left">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date</div>
          <div className="truncate text-xs sm:text-sm font-semibold text-slate-100">{formatDateValue(value)}</div>
        </div>

        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200", isOpen && "rotate-180 text-blue-400")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[250] w-[min(92vw,350px)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-100 ring-1 ring-white/5">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Select Date</div>
                <div className="text-xs font-semibold text-white">Choose transaction date</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => applyQuickDate(0)} className="rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white">Today</button>
              <button type="button" onClick={() => applyQuickDate(1)} className="rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white">Tomorrow</button>
              <button type="button" onClick={() => applyQuickDate(7)} className="rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white">+7 days</button>
            </div>

            <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 p-3">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setDisplayMonth((current) => subMonths(current, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition-all hover:border-slate-700 hover:text-white hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  {format(displayMonth, 'MMMM yyyy')}
                </div>

                <button
                  type="button"
                  onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-400 transition-all hover:border-slate-700 hover:text-white hover:bg-slate-800"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-1.5 grid grid-cols-7 gap-1 px-1">
                {weekdayLabels.map((label) => (
                  <div key={`${format(displayMonth, 'yyyy-MM')}-${label}`} className="flex h-7 items-center justify-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => selectDate(day)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-all duration-150 mx-auto",
                        !isSameMonth(day, displayMonth) && "text-slate-500 opacity-40",
                        isSelected && "bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30 scale-105",
                        !isSelected && isSameMonth(day, displayMonth) && "text-slate-200 hover:bg-slate-800/80 hover:text-white",
                        isToday(day) && !isSelected && "ring-1 ring-blue-500/50 text-blue-400 font-bold"
                      )}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Selected</div>
                <div className="text-xs font-semibold text-slate-200">{formatDateValue(value)}</div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
