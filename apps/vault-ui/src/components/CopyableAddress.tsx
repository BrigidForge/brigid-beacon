import { useState } from 'react';

function shortenForDisplay(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function CopyableAddress(props: {
  value: string;
  display?: string;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    void navigator.clipboard.writeText(props.value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  const label = props.display ?? shortenForDisplay(props.value);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={props.value}
      className={`group inline-flex items-center gap-1.5 rounded transition ${props.className ?? ''}`}
    >
      <span className={props.mono !== false ? 'font-mono' : ''}>{label}</span>
      <span className="shrink-0 text-slate-500 transition group-hover:text-slate-300" aria-hidden>
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,9 6,13 14,4" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="5" width="9" height="9" rx="1.5" />
            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-7A1.5 1.5 0 0 0 1 3.5v7A1.5 1.5 0 0 0 2.5 12H4" />
          </svg>
        )}
      </span>
      {copied && (
        <span className="text-[10px] text-emerald-400">Copied</span>
      )}
    </button>
  );
}
