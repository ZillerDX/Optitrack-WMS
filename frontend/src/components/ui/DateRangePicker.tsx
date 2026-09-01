"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  RotateCcw,
  Check
} from 'lucide-react';
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
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  dateRange: { start: string; end: string } | null;
  onChange: (range: { start: string; end: string }) => void;
  className?: string;
  triggerClassName?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseDate(value?: string | null) {
  if (!value) return null;
  try {
    return parseISO(value);
  } catch {
    return null;
  }
}

function formatDateStr(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function DateRangePicker({ dateRange, onChange, className = "", triggerClassName = "" }: DateRangePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const startDate = useMemo(() => parseDate(dateRange?.start), [dateRange?.start]);
  const endDate = useMemo(() => parseDate(dateRange?.end), [dateRange?.end]);

  // Calendar navigation month
  const [currentMonth, setCurrentMonth] = useState<Date>(startDate || startOfToday());

  // Range selection states for intuitive 2-click UX
  const [selectingStart, setSelectingStart] = useState<Date | null>(null);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  // Close on outside click or ESC
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectingStart(null);
        setHoveredDate(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSelectingStart(null);
        setHoveredDate(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Sync displayed month when opening
  useEffect(() => {
    if (isOpen && startDate) {
      setCurrentMonth(startDate);
    }
  }, [isOpen, startDate]);

  // Days for the month grid
  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(currentMonth)),
      end: endOfWeek(endOfMonth(currentMonth)),
    });
  }, [currentMonth]);

  // Handle Day Click (Intuitive 2-click range picker)
  const handleDayClick = (day: Date) => {
    if (!selectingStart) {
      // First click: select start date
      setSelectingStart(day);
    } else {
      // Second click: select end date
      let newStart = selectingStart;
      let newEnd = day;

      if (day < selectingStart) {
        newStart = day;
        newEnd = selectingStart;
      }

      onChange({
        start: formatDateStr(newStart),
        end: formatDateStr(newEnd),
      });

      setSelectingStart(null);
      setHoveredDate(null);
      setIsOpen(false);
    }
  };

  // Preset Handlers
  const applyPreset = (preset: 'today' | '7days' | '30days' | 'thisMonth') => {
    const today = startOfToday();

    if (preset === 'today') {
      onChange({ start: formatDateStr(today), end: formatDateStr(today) });
      setCurrentMonth(today);
    } else if (preset === '7days') {
      const start = subDays(today, 6);
      onChange({ start: formatDateStr(start), end: formatDateStr(today) });
      setCurrentMonth(start);
    } else if (preset === '30days') {
      const start = subDays(today, 29);
      onChange({ start: formatDateStr(start), end: formatDateStr(today) });
      setCurrentMonth(start);
    } else if (preset === 'thisMonth') {
      const start = startOfMonth(today);
      onChange({ start: formatDateStr(start), end: formatDateStr(today) });
      setCurrentMonth(start);
    }

    setSelectingStart(null);
    setHoveredDate(null);
    setIsOpen(false);
  };

  // Compute active highlight range
  const activeRangeStart = selectingStart || startDate;
  const activeRangeEnd = selectingStart ? (hoveredDate || selectingStart) : endDate;

  const normalizedStart = activeRangeStart && activeRangeEnd && activeRangeStart <= activeRangeEnd ? activeRangeStart : activeRangeEnd;
  const normalizedEnd = activeRangeStart && activeRangeEnd && activeRangeStart <= activeRangeEnd ? activeRangeEnd : activeRangeStart;

  // Active preset detection
  const isPresetActive = (preset: string) => {
    if (!startDate || !endDate) return false;
    const today = startOfToday();
    const startStr = formatDateStr(startDate);
    const endStr = formatDateStr(endDate);

    if (preset === 'today') {
      return startStr === formatDateStr(today) && endStr === formatDateStr(today);
    }
    if (preset === '7days') {
      return startStr === formatDateStr(subDays(today, 6)) && endStr === formatDateStr(today);
    }
    if (preset === '30days') {
      return startStr === formatDateStr(subDays(today, 29)) && endStr === formatDateStr(today);
    }
    if (preset === 'thisMonth') {
      return startStr === formatDateStr(startOfMonth(today)) && endStr === formatDateStr(today);
    }
    return false;
  };

  return (
    <div ref={containerRef} className={cn("relative inline-flex items-center", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-10 px-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-semibold transition-all duration-200",
          isOpen
            ? "border-blue-500 bg-slate-900 text-white ring-1 ring-blue-500"
            : "border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-700 hover:bg-slate-800/80 hover:text-white",
          triggerClassName
        )}
      >
        <CalendarIcon className="h-4 w-4 text-blue-400 shrink-0" />
        
        {startDate && endDate ? (
          <div className="flex items-center gap-1.5 font-mono text-[11px] sm:text-xs tracking-tight">
            <span className="text-slate-100 font-semibold">{format(startDate, 'MMM d, yyyy')}</span>
            <span className="text-slate-500 font-sans">→</span>
            <span className="text-slate-100 font-semibold">{format(endDate, 'MMM d, yyyy')}</span>
          </div>
        ) : (
          <span className="text-slate-400">Select Date Range</span>
        )}

        <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-200 shrink-0", isOpen && "rotate-180 text-blue-400")} />
      </button>

      {/* Popover Dropdown (Dark Theme) */}
      {isOpen && (
        <div className="absolute right-0 sm:left-0 sm:right-auto top-[calc(100%+8px)] z-[150] w-[330px] sm:w-[350px] rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-100">
          {/* Quick Presets Row */}
          <div className="flex items-center gap-1.5 pb-3 border-b border-slate-800/80 overflow-x-auto">
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className={cn(
                "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all border shrink-0 text-center",
                isPresetActive('today')
                  ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white hover:bg-slate-800"
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset('7days')}
              className={cn(
                "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all border shrink-0 text-center",
                isPresetActive('7days')
                  ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white hover:bg-slate-800"
              )}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('30days')}
              className={cn(
                "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all border shrink-0 text-center",
                isPresetActive('30days')
                  ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white hover:bg-slate-800"
              )}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('thisMonth')}
              className={cn(
                "flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all border shrink-0 text-center",
                isPresetActive('thisMonth')
                  ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                  : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white hover:bg-slate-800"
              )}
            >
              This Month
            </button>
          </div>

          {/* Calendar Month Header */}
          <div className="flex items-center justify-between py-3">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="h-8 w-8 rounded-lg border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="text-xs font-bold text-white tracking-wide uppercase">
              {format(currentMonth, 'MMMM yyyy')}
            </span>

            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="h-8 w-8 rounded-lg border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Helper hint */}
          <div className="text-[10px] text-slate-400 pb-2 text-center">
            {selectingStart ? (
              <span className="text-blue-400 font-semibold animate-pulse">Select end date...</span>
            ) : (
              <span>Click a date to start range</span>
            )}
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 pb-1.5 text-center">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isCurrentMonthDay = isSameMonth(day, currentMonth);
              const isDaySelectedStart = normalizedStart ? isSameDay(day, normalizedStart) : false;
              const isDaySelectedEnd = normalizedEnd ? isSameDay(day, normalizedEnd) : false;
              const isBoundary = isDaySelectedStart || isDaySelectedEnd;

              const isDayInRange =
                normalizedStart && normalizedEnd
                  ? isWithinInterval(day, { start: normalizedStart, end: normalizedEnd })
                  : false;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => {
                    if (selectingStart) {
                      setHoveredDate(day);
                    }
                  }}
                  className={cn(
                    "h-8 w-full rounded-lg text-xs font-medium transition-all duration-150 flex items-center justify-center relative",
                    !isCurrentMonthDay && "text-slate-600 opacity-40",
                    isCurrentMonthDay && !isBoundary && !isDayInRange && "text-slate-300 hover:bg-slate-800 hover:text-white",
                    isDayInRange && !isBoundary && "bg-blue-600/20 text-blue-300 rounded-none",
                    isBoundary && "bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30 z-10",
                    isDaySelectedStart && normalizedEnd && !isDaySelectedEnd && "rounded-r-none",
                    isDaySelectedEnd && normalizedStart && !isDaySelectedStart && "rounded-l-none",
                    isToday(day) && !isBoundary && "ring-1 ring-blue-400/60"
                  )}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Bottom Bar: Selected Range & Done */}
          <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Selection</span>
              <span className="text-xs font-mono font-semibold text-slate-200 truncate block">
                {startDate && endDate
                  ? `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`
                  : 'No range selected'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  applyPreset('30days');
                }}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Reset to last 30 days"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/25 transition-all active:scale-95"
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