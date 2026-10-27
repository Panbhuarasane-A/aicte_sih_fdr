import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../lib/formatters.js';
import '../styles/date-range-picker.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function toInputDate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function getRange(preset, now = new Date()) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  if (preset === 'today') return { from: toInputDate(end), to: toInputDate(end) };
  if (preset === '7d' || preset === '30d') {
    const days = preset === '7d' ? 6 : 29;
    return { from: toInputDate(new Date(end.getTime() - days * DAY_MS)), to: toInputDate(end) };
  }
  if (preset === 'month') {
    const first = new Date(end.getFullYear(), end.getMonth(), 1);
    return { from: toInputDate(first), to: toInputDate(end) };
  }
  return null;
}

export default function DateRangePicker({
  value = { from: '', to: '' },
  onChange,
  label = 'Date range',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState('');
  const containerRef = useRef(null);
  const from = value.from || '';
  const to = value.to || '';
  const display = from && to
    ? `${formatDate(from)} – ${formatDate(to)}`
    : from
      ? `From ${formatDate(from)}`
      : to
        ? `Through ${formatDate(to)}`
        : label;

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selectPreset = (preset) => {
    setActivePreset(preset);
    onChange?.(getRange(preset));
    setOpen(false);
  };

  const updateDate = (key, nextDate) => {
    const next = { from, to, [key]: nextDate };
    if (next.from && next.to && next.from > next.to) {
      if (key === 'from') next.to = nextDate;
      else next.from = nextDate;
    }
    setActivePreset('custom');
    onChange?.(next);
  };

  const clearRange = () => {
    setActivePreset('');
    onChange?.({ from: '', to: '' });
  };

  return (
    <div className={`date-range-picker ${className}`.trim()} ref={containerRef}>
      <button
        type="button"
        className="date-range-picker__trigger"
        aria-label={`${label}: ${display}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
        <span>{display}</span>
        {(from || to) && <span className="date-range-picker__selected-mark" aria-hidden="true">●</span>}
        <span className="date-range-picker__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <section className="date-range-picker__popover" role="dialog" aria-label={label}>
          <div className="date-range-picker__presets" aria-label="Date range presets">
            {[
              ['today', 'Today'],
              ['7d', '7 days'],
              ['30d', '30 days'],
              ['month', 'This month'],
            ].map(([preset, text]) => (
              <button
                type="button"
                key={preset}
                className={activePreset === preset ? 'is-active' : ''}
                onClick={() => selectPreset(preset)}
              >
                {text}
              </button>
            ))}
          </div>
          <fieldset className="date-range-picker__custom">
            <legend>Custom range</legend>
            <label>
              From
              <input aria-label={`${label} start`} type="date" value={from} max={to || undefined} onChange={(event) => updateDate('from', event.target.value)} />
            </label>
            <label>
              To
              <input aria-label={`${label} end`} type="date" value={to} min={from || undefined} onChange={(event) => updateDate('to', event.target.value)} />
            </label>
          </fieldset>
          <div className="date-range-picker__footer">
            <button type="button" className="date-range-picker__clear" onClick={clearRange} disabled={!from && !to}>Clear dates</button>
            <button type="button" className="date-range-picker__done" onClick={() => setOpen(false)}>Done</button>
          </div>
        </section>
      )}
    </div>
  );
}
