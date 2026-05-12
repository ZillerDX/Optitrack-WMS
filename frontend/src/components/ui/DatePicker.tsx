"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
  format(addDays(startOfWeek(startOfToday()), index), 'EEEEE')
);

function formatDateValue(value: string) {
  return value ? format(parseISO(value), 'MMM dd, yyyy') : 'Select date';
}

function buildCalendarDays(month: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });
}

export function DatePicker({ value, onChange, className = "" }: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => (value ? parseISO(value) : null), [value]);
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState<Date>(selectedDate ?? startOfToday());

  useEffect(() => {
    if (selectedDate) {
      setDisplayMonth(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const selectDate = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setDisplayMonth(date);
    setIsOpen(false);
  };

  const applyQuickDate = (offset: number) => {
    const nextDate = addDays(startOfToday(), offset);
    onChange(format(nextDate, 'yyyy-MM-dd'));
    setDisplayMonth(nextDate);
    setIsOpen(false);
  };

  const days = buildCalendarDays(displayMonth);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/50 transition-all duration-200 hover:border-blue-200 hover:shadow-md hover:shadow-blue-100/50"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 text-white shadow-md shadow-blue-200/70">
          <Calendar className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 text-left">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Date</div>
          <div className="mt-0.5 truncate text-sm font-semibold text-slate-700">{formatDateValue(value)}</div>
        </div>

        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+12px)] z-[130] w-[min(92vw,380px)] overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-500">Pick a date</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">Choose the transaction date</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => applyQuickDate(0)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">Today</button>
              <button type="button" onClick={() => applyQuickDate(1)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">Tomorrow</button>
              <button type="button" onClick={() => applyQuickDate(7)} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">+7 days</button>
            </div>

            <div className="rounded-[24px] bg-slate-50/80 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setDisplayMonth((current) => subMonths(current, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:border-blue-200 hover:text-blue-600"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {format(displayMonth, 'MMMM yyyy')}
                </div>

                <button
                  type="button"
                  onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:border-blue-200 hover:text-blue-600"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1 px-1">
                {weekdayLabels.map((label) => (
                  <div key={`${format(displayMonth, 'yyyy-MM')}-${label}`} className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm shadow-slate-200/40">
                {days.map((day) => {
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => selectDate(day)}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-200",
                        !isSameMonth(day, displayMonth) && "text-slate-300",
                        isSelected && "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-200/70",
                        !isSelected && isSameMonth(day, displayMonth) && "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                        isToday(day) && !isSelected && "ring-1 ring-blue-200 ring-inset"
                      )}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Selected date</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{formatDateValue(value)}</div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-200/80 transition-all duration-200 hover:shadow-xl hover:shadow-blue-200"
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
