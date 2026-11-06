import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { STATUS } from '../engines/model.js';
import { Icon } from './icons.jsx';

// ---------- hooks ----------

export function useController(ctrl) {
  return useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot);
}

/** Re-renders whenever any engine's controller changes. */
export function useEnginesState(engines) {
  const [, force] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const unsubscribers = engines.map((e) => e.ctrl.subscribe(force));
    return () => unsubscribers.forEach((u) => u());
  }, [engines]);
  return engines.map((e) => e.ctrl.getSnapshot());
}

// ---------- text helpers ----------

/** Lithuanian plural: plural(n, ['rezultatas', 'rezultatai', 'rezultatų']). */
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && (mod100 < 11 || mod100 > 19)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const percent = (v) => `${(Math.round(v * 1000) / 10).toLocaleString('lt-LT')} %`;

export const truncate = (text, n) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

// ---------- toast ----------

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timer = useRef();
  const show = useCallback((text) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">{message}</div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------- components ----------

export function Button({ variant = 'default', size, className = '', children, ...rest }) {
  return (
    <button type="button" className={`btn btn-${variant}${size ? ` btn-${size}` : ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function StatusPill({ status }) {
  const s = STATUS[status] ?? STATUS.unknown;
  return <span className={`pill pill-${s.tone}`}>{s.label}</span>;
}

export function KindTag({ kind }) {
  return kind === 'cloud'
    ? <span className="tag tag-cloud"><Icon.Cloud size={13} /> Debesyje</span>
    : <span className="tag tag-device"><Icon.Chip size={13} /> Įrenginyje</span>;
}

export function ProgressBar({ progress, label }) {
  if (progress == null) return null;
  const indeterminate = progress === 'indeterminate';
  return (
    <div className={`bar ${indeterminate ? 'indeterminate' : ''}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : Math.round(progress * 100)}>
      <span style={indeterminate ? undefined : { width: `${Math.max(2, progress * 100)}%` }} />
    </div>
  );
}

export function Switch({ checked, disabled, onChange, label }) {
  return (
    <label className={`switch ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      <span className="switch-label">{label}</span>
    </label>
  );
}

export function CopyChip({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };
  return (
    <span className="copy-chip">
      <code>{text}</code>
      <button type="button" onClick={copy} aria-label={`Kopijuoti ${text}`}>
        {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
      </button>
    </span>
  );
}

export function Callout({ tone = 'info', children }) {
  const IconFor = tone === 'warn' || tone === 'bad' ? Icon.Alert : Icon.Info;
  return (
    <div className={`callout callout-${tone}`}>
      <IconFor size={18} />
      <div>{children}</div>
    </div>
  );
}

export function StepHeader({ step, total, title, lead }) {
  return (
    <header className="step-head">
      <p className="eyebrow">{step} žingsnis iš {total}</p>
      <h1 id={`step-title-${step}`} tabIndex={-1}>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}

export function EmptyState({ title, text, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
