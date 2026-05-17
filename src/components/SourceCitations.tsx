'use client';

interface Props {
  sources: string[];
  maxVisible?: number;
}

export default function SourceCitations({ sources, maxVisible = 4 }: Props) {
  if (!sources || sources.length === 0) return null;
  const visible = sources.slice(0, maxVisible);
  const overflow = sources.length - maxVisible;

  return (
    <div className="sources-row">
      {visible.map((s, i) => (
        <span key={i} className="source-tag">📚 {s}</span>
      ))}
      {overflow > 0 && (
        <span className="source-tag" style={{ color: 'var(--muted)' }}>+{overflow} more</span>
      )}
    </div>
  );
}
