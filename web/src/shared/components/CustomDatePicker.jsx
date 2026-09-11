import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { fmtDate, fmtMonthYear } from "../utils/dateFormat.js";

const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad2 = (n) => String(n).padStart(2, "0");

const toDateString = (year, monthIndex, day) => {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
};

const parseISODate = (isoStr) => {
  if (!isoStr || typeof isoStr !== "string") return null;
  const parts = isoStr.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
};

/**
 * CustomDatePicker — Accessible, minimalist React datepicker designed for Lilycrest DMS.
 *
 * Enforces solid design tokens (strictly no gradients, clean 1px border, dark mode support).
 * Does NOT render any "Today" button in the footer and does NOT apply borders/outlines to
 * disabled today's dates, avoiding misleading indicators when today cannot be selected.
 */
const CustomDatePicker = ({
  id,
  name,
  value = "",
  onChange,
  min = "",
  max = "",
  placeholder = "Select date...",
  disabled = false,
  readOnly = false,
  required = false,
  error = null,
  style = {},
  className = "",
  defaultMonth,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Determine initial calendar view month/year
  const initialDate = useMemo(() => {
    if (value) {
      const parsed = parseISODate(value);
      if (parsed) return parsed;
    }
    if (defaultMonth instanceof Date) {
      return defaultMonth;
    }
    if (min) {
      const parsedMin = parseISODate(min);
      if (parsedMin) return parsedMin;
    }
    return new Date();
  }, [value, defaultMonth, min]);

  const [viewDate, setViewDate] = useState(() => {
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  });

  // Sync viewDate if value changes externally and calendar is closed
  useEffect(() => {
    if (!isOpen && value) {
      const parsed = parseISODate(value);
      if (parsed) {
        setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
      }
    }
  }, [value, isOpen]);

  // Outside click to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const handlePrevMonth = useCallback(() => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  }, [currentYear, currentMonth]);

  const handleNextMonth = useCallback(() => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  }, [currentYear, currentMonth]);

  // Month navigation boundary checks
  const isPrevDisabled = useMemo(() => {
    if (!min) return false;
    const parsedMin = parseISODate(min);
    if (!parsedMin) return false;
    const prevMonthEnd = new Date(currentYear, currentMonth, 0);
    return prevMonthEnd < parsedMin;
  }, [min, currentYear, currentMonth]);

  const isNextDisabled = useMemo(() => {
    if (!max) return false;
    const parsedMax = parseISODate(max);
    if (!parsedMax) return false;
    const nextMonthStart = new Date(currentYear, currentMonth + 1, 1);
    return nextMonthStart > parsedMax;
  }, [max, currentYear, currentMonth]);

  // Generate days in month view
  const daysInMonth = useMemo(() => {
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const days = [];

    // Empty lead slots
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ key: `empty-${i}`, isEmpty: true });
    }

    // Days of current month
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = toDateString(currentYear, currentMonth, d);
      let isDisabled = false;
      if (min && dateStr < min) isDisabled = true;
      if (max && dateStr > max) isDisabled = true;

      const isSelected = value === dateStr;

      days.push({
        key: `day-${d}`,
        dayNumber: d,
        dateStr,
        isDisabled,
        isSelected,
      });
    }

    return days;
  }, [currentYear, currentMonth, min, max, value]);

  const handleSelectDate = useCallback(
    (dateStr) => {
      if (disabled || readOnly) return;
      onChange?.(dateStr);
      setIsOpen(false);
    },
    [disabled, readOnly, onChange]
  );

  const handleClear = useCallback(() => {
    if (disabled || readOnly) return;
    onChange?.("");
    setIsOpen(false);
  }, [disabled, readOnly, onChange]);

  const displayLabel = useMemo(() => {
    if (!value) return "";
    const parsed = parseISODate(value);
    if (!parsed) return value;
    return fmtDate(parsed);
  }, [value]);

  const isInteractive = !disabled && !readOnly;

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {/* Hidden input for standard form serialization if needed */}
      <input
        type="hidden"
        id={id}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
      />

      {/* Visible Trigger Box */}
      <button
        type="button"
        className={`custom-date-picker-trigger flex items-center justify-between w-full px-3.5 py-2.5 text-sm rounded-lg text-left transition-colors border ${
          error
            ? "border-rose-500 text-rose-700 dark:text-rose-400 bg-white dark:bg-slate-900"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        } ${
          isInteractive
            ? "cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
            : "cursor-not-allowed opacity-60"
        }`}
        style={style}
        onClick={() => {
          if (isInteractive) setIsOpen((prev) => !prev);
        }}
        disabled={!isInteractive}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={displayLabel ? "font-medium" : "text-slate-400 dark:text-slate-500"}>
          {displayLabel || placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
      </button>

      {/* Calendar Popover Dialog */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="custom-date-picker-popover absolute z-50 mt-1.5 left-0 w-72 p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {fmtMonthYear(viewDate)}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                onClick={handlePrevMonth}
                disabled={isPrevDisabled}
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-1 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                onClick={handleNextMonth}
                disabled={isNextDisabled}
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {DAYS_OF_WEEK.map((day) => (
              <span
                key={day}
                className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-1"
              >
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {daysInMonth.map((item) => {
              if (item.isEmpty) {
                return <div key={item.key} className="h-8 w-8" />;
              }

              const { dayNumber, dateStr, isDisabled, isSelected } = item;

              return (
                <button
                  key={item.key}
                  type="button"
                  data-date={dateStr}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  onClick={() => !isDisabled && handleSelectDate(dateStr)}
                  className={`custom-calendar-day-btn h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-md transition-colors ${
                    isDisabled
                      ? "text-slate-300 dark:text-slate-600 cursor-not-allowed select-none bg-transparent"
                      : isSelected
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-sm"
                      : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  }`}
                >
                  {dayNumber}
                </button>
              );
            })}
          </div>

          {/* Calendar Footer: Strictly NO Today button, only Clear and Close */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
            <button
              type="button"
              className="custom-calendar-clear-btn text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium py-1 px-1.5 rounded transition-colors"
              onClick={handleClear}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium py-1 px-1.5 rounded transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;
