// Small stroke icons (24×24 grid), inheriting currentColor.

function Svg({ children, size = 18, fill = 'none', ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const Icon = {
  Check: (p) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>,
  ArrowRight: (p) => <Svg {...p}><path d="M5 12h14M13 5l7 7-7 7" /></Svg>,
  ArrowLeft: (p) => <Svg {...p}><path d="M19 12H5M11 19l-7-7 7-7" /></Svg>,
  Mic: (p) => <Svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" /></Svg>,
  Stop: (p) => <Svg {...p} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2.5" /></Svg>,
  Play: (p) => <Svg {...p} fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></Svg>,
  Download: (p) => <Svg {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>,
  Upload: (p) => <Svg {...p}><path d="M12 15V3M7 8l5-5 5 5M5 21h14" /></Svg>,
  Trash: (p) => <Svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></Svg>,
  X: (p) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>,
  Cloud: (p) => <Svg {...p}><path d="M17.5 19a4.5 4.5 0 1 0-1.3-8.8A6 6 0 0 0 4.6 13.2 3 3 0 0 0 6 19z" /></Svg>,
  Chip: (p) => <Svg {...p}><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></Svg>,
  Sparkle: (p) => <Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></Svg>,
  Refresh: (p) => <Svg {...p}><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" /></Svg>,
  Info: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></Svg>,
  Alert: (p) => <Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></Svg>,
  Trophy: (p) => <Svg {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></Svg>,
  Copy: (p) => <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Svg>,
};
