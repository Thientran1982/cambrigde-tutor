'use client';
// src/app/admin/page.tsx
// Admin UI to upload Cambridge PDFs → ingest into Pinecone

import { useState, useRef } from 'react';

interface IngestResult {
  file: string;
  status: 'success' | 'error' | 'skip';
  chunks?: number;
  vectors?: number;
  reason?: string;
}

export default function AdminPage() {
  const [secret, setSecret]     = useState('');
  const [files, setFiles]       = useState<File[]>([]);
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState<IngestResult[]>([]);
  const [error, setError]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter(f => f.name.endsWith('.pdf'));
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...selected.filter(f => !existing.has(f.name))];
    });
  };

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  const docTypeLabel = (filename: string) => {
    const f = filename.toLowerCase();
    if (f.includes('syllabus')) return { label: 'Syllabus', color: '#4f46e5' };
    if (f.includes('_ms_') || f.includes('mark')) return { label: 'Mark Scheme', color: '#059669' };
    if (f.includes('specimen')) return { label: 'Specimen', color: '#d97706' };
    if (f.includes('_qp_') || f.includes('paper')) return { label: 'Past Paper', color: '#0891b2' };
    return { label: 'Other', color: '#6b7280' };
  };

  const ingest = async () => {
    if (!secret) { setError('Enter admin secret'); return; }
    if (!files.length) { setError('Add at least one PDF'); return; }
    setError(''); setLoading(true); setResults([]);

    const BATCH = 5; // upload 5 files at a time
    const allResults: IngestResult[] = [];

    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const fd = new FormData();
      batch.forEach(f => fd.append('files', f));

      try {
        const resp = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'x-admin-secret': secret },
          body: fd,
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Upload failed');
        allResults.push(...(data.results || []));
        setResults([...allResults]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(`Batch ${Math.floor(i / BATCH) + 1} failed: ${msg}`);
        break;
      }
    }
    setLoading(false);
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const totalVectors = results.reduce((a, r) => a + (r.vectors || 0), 0);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ background: '#4f46e5', color: 'white', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, letterSpacing: '.05em' }}>ADMIN</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Cambridge Document Ingestion</h1>
        </div>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Upload Cambridge PDFs to populate the vector database. Run this once per batch of new documents.
        </p>
      </div>

      {/* Secret */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>Admin Secret</label>
        <input
          type="password" value={secret} onChange={e => setSecret(e.target.value)}
          placeholder="ADMIN_SECRET from .env.local"
          style={{ width: '100%', border: '1.5px solid #dddcf0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', background: '#f8f8fd' }}
        />
      </div>

      {/* File drop zone */}
      <div
        style={{ border: '2px dashed #dddcf0', borderRadius: 12, padding: '32px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 16, transition: 'border-color .15s', background: '#f8f8fd' }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'));
          setFiles(prev => {
            const ex = new Set(prev.map(f => f.name));
            return [...prev, ...dropped.filter(f => !ex.has(f.name))];
          });
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Drop Cambridge PDFs here</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Syllabus · Past papers (QP) · Mark schemes (MS) · Specimen papers</div>
        <input ref={fileRef} type="file" accept=".pdf" multiple onChange={handleFiles} style={{ display: 'none' }} />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #dddcf0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #dddcf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{files.length} FILE{files.length !== 1 ? 'S' : ''} QUEUED</span>
            <button onClick={() => setFiles([])} style={{ fontSize: 11, color: '#dc2626', background: '#fee2e2', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Clear all</button>
          </div>
          {files.map(f => {
            const dt = docTypeLabel(f.name);
            const result = results.find(r => r.file === f.name);
            return (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f0eff8', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: dt.color + '18', color: dt.color, border: `1px solid ${dt.color}40`, whiteSpace: 'nowrap' }}>{dt.label}</span>
                <span style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#2d2d4e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 11, color: '#9090b8' }}>{(f.size / 1024).toFixed(0)} KB</span>
                {result ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: result.status === 'success' ? '#059669' : result.status === 'skip' ? '#d97706' : '#dc2626' }}>
                    {result.status === 'success' ? `✓ ${result.vectors} vectors` : result.status === 'skip' ? '⚠ Skipped' : '✗ Error'}
                  </span>
                ) : (
                  !loading && <button onClick={() => removeFile(f.name)} style={{ fontSize: 14, color: '#9090b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <button
        onClick={ingest}
        disabled={loading || !files.length || !secret}
        style={{ width: '100%', background: loading ? '#dddcf0' : '#4f46e5', color: loading ? '#9090b8' : 'white', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        {loading ? '⏳ Ingesting...' : `🚀 Ingest ${files.length} PDF${files.length !== 1 ? 's' : ''} into Pinecone`}
      </button>

      {/* Results summary */}
      {results.length > 0 && !loading && (
        <div style={{ marginTop: 24, background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#059669', marginBottom: 4 }}>
            ✅ Ingestion complete — {successCount}/{results.length} files processed
          </div>
          <div style={{ fontSize: 13, color: '#065f46' }}>
            {totalVectors.toLocaleString()} vectors upserted into Pinecone · Cambridge RAG is now active
          </div>
        </div>
      )}

      {/* Tips */}
      <div style={{ marginTop: 32, background: '#f0eff8', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6b8a', letterSpacing: '.06em', marginBottom: 10, textTransform: 'uppercase' }}>Naming convention for auto-detection</div>
        {[
          ['9709_syllabus_2025-2027.pdf', 'Syllabus'],
          ['9709_s22_qp_11.pdf', 'Past Paper May/June 2022 Paper 11'],
          ['9709_w23_ms_12.pdf', 'Mark Scheme Oct/Nov 2023 Paper 12'],
          ['9709_specimen_qp_1.pdf', 'Specimen Paper'],
        ].map(([name, desc]) => (
          <div key={name} style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'baseline' }}>
            <code style={{ fontSize: 11, color: '#4f46e5', background: 'white', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>{name}</code>
            <span style={{ fontSize: 12, color: '#6b6b8a' }}>{desc}</span>
          </div>
        ))}
        <div style={{ marginTop: 12, fontSize: 12, color: '#6b6b8a' }}>
          Download free from <a href="https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-international-as-and-a-level-mathematics-9709/" target="_blank" style={{ color: '#4f46e5' }}>cambridgeinternational.org</a>
        </div>
      </div>
    </div>
  );
}
