"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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
  subMonths,
} from 'date-fns';
import { useTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  dateRange: { start: string; end: string };
  onChange: (range: { start: string; end: string }) => void;
  className?: string;
}

type ActiveField = 'start' | 'end';

const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
  format(addDays(startOfWeek(startOfToday()), index), 'EEEEE')
);

function parseDate(value: string) {
  return value ? parseISO(value) : null;
}

function formatDateValue(value: string, fallbackLabel: string) {
  return value ? format(parseISO(value), 'MMM dd, yyyy') : fallbackLabel;
}

function formatDateForState(value: Date) {
  return format(value, 'yyyy-MM-dd');
}

function buildCalendarDays(month: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });
}

export function DateRangePicker({ dateRange, onChange, className = "" }: DateRangePickerProps) {
  const t = useTranslations('dateRangePicker');
  const containerRef = useRef<HTMLDivElement>(null);
  const startDate = useMemo(() => parseDate(dateRange.start), [dateRange.start]);
  const endDate = useMemo(() => parseDate(dateRange.end), [dateRange.end]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>('start');
  const [displayMonth, setDisplayMonth] = useState<Date>(startDate ?? startOfToday());

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

  useEffect(() => {
    if (activeField === 'start' && startDate) {
      setDisplayMonth(startDate);
      return;
    }

    if (activeField === 'end' && endDate) {
      setDisplayMonth(endDate);
    }
  }, [activeField, startDate, endDate]);

  const openPicker = (field: ActiveField) => {
    setActiveField(field);
    setIsOpen(true);
  };

  const updateRange = (start: Date, end: Date) => {
    onChange({
      start: formatDateForState(start),
      end: formatDateForState(end),
    });
  };

  const handleDateSelect = (selectedDate: Date) => {
    if (activeField === 'start') {
      const nextEnd = endDate && endDate >= selectedDate ? endDate : selectedDate;
      updateRange(selectedDate, nextEnd);
      setActiveField('end');
      return;
    }

    if (startDate && selectedDate < startDate) {
      updateRange(selectedDate, startDate);
    } else {
      updateRange(startDate ?? selectedDate, selectedDate);
    }

    setIsOpen(false);
  };

  const applyPreset = (preset: 'today' | 'last7' | 'last30' | 'thisMonth') => {
    const today = startOfToday();

    if (preset === 'today') {
      updateRange(today, today);
      setDisplayMonth(today);
      setIsOpen(false);
      return;
    }

    if (preset === 'last7') {
      const start = addDays(today, -6);
      updateRange(start, today);
      setDisplayMonth(start);
      setIsOpen(false);
      return;
    }

    if (preset === 'last30') {
      const start = addDays(today, -29);
      updateRange(start, today);
      setDisplayMonth(start);
      setIsOpen(false);
      return;
    }

    const monthStart = startOfMonth(today);
    updateRange(monthStart, today);
    setDisplayMonth(monthStart);
    setIsOpen(false);
  };

  const rangeStart = startDate && endDate && startDate <= endDate ? startDate : endDate;
  const rangeEnd = startDate && endDate && startDate <= endDate ? endDate : startDate;

  const renderCalendarMonth = (month: Date) => {
    const days = buildCalendarDays(month);

    return (
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-2.5 shadow-sm shadow-slate-200/40">
        <div className="mb-1.5 grid grid-cols-7 gap-1 px-0.5">
          {weekdayLabels.map((label, index) => (
            <div key={`${format(month, 'yyyy-MM')}-weekday-${index}`} className="flex h-6 items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const isSelectedStart = startDate ? isSameDay(day, startDate) : false;
            const isSelectedEnd = endDate ? isSameDay(day, endDate) : false;
            const isSelected = isSelectedStart || isSelectedEnd;
            const isInRange = rangeStart && rangeEnd ? isWithinInterval(day, { start: rangeStart, end: rangeEnd }) : false;

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => handleDateSelect(day)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-all duration-200",
                  !isSameMonth(day, month) && "text-slate-300",
                  isInRange && !isSelected && "bg-blue-50 text-blue-700",
                  isSelected && "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-200/70",
                  !isInRange && !isSelected && isSameMonth(day, month) && "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                  isToday(day) && !isSelected && "ring-1 ring-blue-200 ring-inset"
                )}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
 };

  const renderTriggerField = (field: ActiveField, label: string, value: string) => (
    <button
      type="button"
      onClick={() => openPicker(field)}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-start justify-center rounded-2xl px-3 py-1 text-left transition-all duration-200 focus:outline-none",
        "hover:bg-slate-50/80"
      )}
    >
      <span className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400", isOpen && activeField === field && "text-blue-500")}>{label}</span>
      <span className={cn("mt-0.5 truncate text-[13px] font-medium text-slate-700", isOpen && activeField === field && "text-blue-600")}>{value}</span>
    </button>
  );

  return (
    <div ref={containerRef} className={cn("relative min-w-[280px]", className)}>
      <div className="flex h-full min-h-0 w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm shadow-slate-200/40 transition-all duration-200 hover:bg-slate-50/70 hover:shadow-md hover:shadow-slate-200/50">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500 transition-all duration-200 hover:bg-blue-100/80"
        >
          <Calendar className="h-4.5 w-4.5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center">
          {renderTriggerField('start', t('start').toUpperCase(), formatDateValue(dateRange.start, t('selectDate')))}

          <div className="flex h-full items-stretch py-1.5">
            <div className="w-px rounded-full bg-slate-200"></div>
          </div>

          {renderTriggerField('end', t('end').toUpperCase(), formatDateValue(dateRange.end, t('selectDate')))}
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+10px)] z-[130] w-[min(92vw,360px)] overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_20px_60px_-28px_rgba(15,23,42,0.4)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-500">{t('dateRange')}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-700">{t('chooseOnCalendar')}</div>
              </div>

              <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveField('start')}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200",
                    activeField === 'start' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {t('start')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveField('end')}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200",
                    activeField === 'end' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {t('end')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" onClick={() => applyPreset('today')} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">{t('today')}</button>
              <button type="button" onClick={() => applyPreset('last7')} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">{t('last7Days')}</button>
              <button type="button" onClick={() => applyPreset('last30')} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">{t('last30Days')}</button>
              <button type="button" onClick={() => applyPreset('thisMonth')} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600">{t('thisMonth')}</button>
            </div>

            <div className="rounded-[20px] bg-slate-50/80 p-2.5">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <button
                  type="button"
                  onClick={() => setDisplayMonth((current) => subMonths(current, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:border-blue-200 hover:text-blue-600"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {format(displayMonth, 'MMMM yyyy')}
                </div>

                <button
                  type="button"
                  onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:border-blue-200 hover:text-blue-600"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {renderCalendarMonth(displayMonth)}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t('selectedRange')}</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">
                  {formatDateValue(dateRange.start, t('selectDate'))} - {formatDateValue(dateRange.end, t('selectDate'))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-blue-200/70 transition-all duration-200 hover:shadow-xl hover:shadow-blue-200"
              >
                {t('done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
