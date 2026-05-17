'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  imgSrc?: string;
  sources?: string[];
}
interface ContentBlock { type: 'text' | 'image'; text?: string; source?: { type: string; media_type: string; data: string }; }
interface ExamQuestion {
  id: number; topic: string; subtopic: string; difficulty: string;
  marks: number; question: string; math_expression?: string;
  hint: string; model_answer: string; mark_scheme: string;
}
interface ExamResult {
  questionId: number; marksAwarded: number; marksAvailable: number;
  grade: string; feedback: string; modelAnswer: string;
}
interface GradingData {
  results: ExamResult[]; totalMarks: number; totalAvailable: number;
  percentage: number; cambridgeGrade: string; overallFeedback: string;
}
interface HistoryRecord {
  id: number; date: string; grade: string; percentage: number;
  totalMarks: number; totalAvailable: number; topics: string[];
  difficulty: string; numQ: number; feedback: string;
  results: ExamResult[]; questions: ExamQuestion[];
}
interface ExamSettings { numQ: number; difficulty: string; timeLimitMin: number; markingStyle: string; topics: string[]; }

const PAPER_GROUPS = [
  {
    paper: 'Pure 1', code: 'P1', color: '#4f46e5',
    topics: ['Quadratics & Polynomials', 'Functions & Graphs', 'Coordinate Geometry', 'Circular Measure', 'Trigonometry (P1)', 'Sequences & Series', 'Differentiation (P1)', 'Integration (P1)'],
  },
  {
    paper: 'Pure 2/3', code: 'P2/3', color: '#7c3aed',
    topics: ['Algebra & Partial Fractions', 'Logarithms & Exponentials', 'Trigonometry (P3)', 'Differentiation (P3)', 'Integration (P3)', 'Numerical Methods', 'Vectors (P3)', 'Differential Equations', 'Complex Numbers'],
  },
  {
    paper: 'Statistics 1', code: 'S1', color: '#0891b2',
    topics: ['Data Representation', 'Permutations & Combinations', 'Probability', 'Discrete Random Variables', 'Normal Distribution'],
  },
  {
    paper: 'Mechanics', code: 'M', color: '#059669',
    topics: ['Forces & Equilibrium', 'Newton\'s Laws', 'Kinematics', 'Work, Energy & Power', 'Momentum & Impulse'],
  },
];
const ALL_EXAM_TOPICS = PAPER_GROUPS.flatMap(g => g.topics);

export default function Home() {
  const [activeTab, setActiveTab] = useState<'tutor' | 'exam' | 'history'>('tutor');
  const [currentTopic, setCurrentTopic] = useState('All Topics');
  const [expandedPapers, setExpandedPapers] = useState<Record<string, boolean>>({ 'Pure 1': true, 'Pure 2/3': false, 'Statistics 1': false, 'Mechanics': false });
  const togglePaper = (paper: string) => setExpandedPapers(prev => ({ ...prev, [paper]: !prev[paper] }));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [qCount, setQCount] = useState(0);
  const [lastSources, setLastSources] = useState<string[]>([]);
  const [pendingImage, setPendingImage] = useState<{ data: string; type: string; src: string } | null>(null);

  const [examView, setExamView] = useState<'setup' | 'active' | 'results'>('setup');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState('mixed');
  const [timeLimit, setTimeLimit] = useState(45);
  const [markingStyle, setMarkingStyle] = useState('strict');
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [examAnswers, setExamAnswers] = useState<string[]>([]);
  const [examTimeRemaining, setExamTimeRemaining] = useState(0);
  const [examTotalTime, setExamTotalTime] = useState(0);
  const [examSettings, setExamSettings] = useState<ExamSettings | null>(null);
  const [gradingData, setGradingData] = useState<GradingData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [examError, setExamError] = useState('');
  const [examRagSources, setExamRagSources] = useState<string[]>([]);

  const [examHistory, setExamHistory] = useState<HistoryRecord[]>([]);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const examTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingTextRef = useRef('');
  const streamingSourcesRef = useRef<string[]>([]);

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem('cam_exam_history') || '[]');
      setExamHistory(h);
    } catch {}
  }, []);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => { if (examTimerRef.current) clearInterval(examTimerRef.current); };
  }, []);

  function formatResponse(text: string): string {
    let html = text;
    html = html.replace(/## (.*?)(\n|$)/g, '<h3>$1</h3>');
    html = html.replace(/### (.*?) \[(Easy|Medium|Hard)\] \[(\d+) marks?\]/gi, (_m, title, diff, marks) =>
      `<div style="margin:10px 0 4px"><strong>${title}</strong> <span class="badge ${diff.toLowerCase()}">${diff}</span> <span class="badge m">${marks} marks</span></div>`
    );
    html = html.replace(/### (.*?)(\n|$)/g, '<div style="font-weight:500;margin:8px 0 4px;color:var(--accent)">$1</div>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--faint);padding:1px 4px;border-radius:3px;font-family:\'DM Mono\',monospace;font-size:11px;color:var(--accent2)">$1</code>');
    const lines = html.split('\n');
    let result = '';
    let inUl = false;
    for (const line of lines) {
      const t = line.trim();
      if (!t) { if (inUl) { result += '</ul>'; inUl = false; } continue; }
      if (t.match(/^\d+\. /)) {
        if (inUl) { result += '</ul>'; inUl = false; }
        const num = t.match(/^(\d+)\./)![1];
        const rest = t.replace(/^\d+\. /, '');
        result += `<div class="step-row"><span class="step-num">${num}</span><span>${rest}</span></div>`;
      } else if (t.startsWith('- ') || t.startsWith('• ')) {
        if (!inUl) { result += '<ul>'; inUl = true; }
        result += '<li>' + t.replace(/^[-•] /, '') + '</li>';
      } else if (/^(Paper|Topic|Subtopic|Difficulty|Estimated Marks|Skills Tested|Common Cambridge Trap|Priority|Action|A\* Tip|M marks|A marks|Hint):/.test(t)) {
        if (inUl) { result += '</ul>'; inUl = false; }
        const colon = t.indexOf(':');
        const key = t.substring(0, colon);
        const val = t.substring(colon + 1).trim();
        let display = val;
        if (key === 'Difficulty') {
          const cls = val.toLowerCase().includes('hard') ? 'hard' : val.toLowerCase().includes('medium') ? 'medium' : 'easy';
          display = `<span class="badge ${cls}">${val}</span>`;
        } else if (key === 'M marks') display = `<span class="badge m">M</span> ${val}`;
        else if (key === 'A marks') display = `<span class="badge a">A</span> ${val}`;
        else if (key === 'Hint') display = `<span style="color:var(--gold);font-style:italic;font-size:12px">${val}</span>`;
        else if (key === 'A* Tip') display = `<span style="background:var(--gold-bg);color:var(--gold);padding:2px 6px;border-radius:4px;font-weight:500">${val}</span>`;
        result += `<p><strong style="font-size:10px;font-family:'DM Mono',monospace;color:var(--muted)">${key}:</strong> ${display}</p>`;
      } else if (t.includes('=') && (t.includes('^') || t.includes('int') || t.includes('dy/dx') || t.includes('sqrt') || t.includes('±') || t.includes('∫'))) {
        if (inUl) { result += '</ul>'; inUl = false; }
        result += `<div class="math-block">${t}</div>`;
      } else {
        if (inUl) { result += '</ul>'; inUl = false; }
        result += `<p>${t}</p>`;
      }
    }
    if (inUl) result += '</ul>';
    return result;
  }

  const sendMessage = useCallback(async () => {
    if (isStreaming) return;
    const text = inputValue.trim();
    if (!text && !pendingImage) return;

    const imgData = pendingImage;
    setInputValue('');
    setPendingImage(null);
    setIsStreaming(true);
    setLastSources([]);
    setQCount(c => c + 1);

    const userContent: string | ContentBlock[] = imgData
      ? [
          { type: 'image', source: { type: 'base64', media_type: imgData.type, data: imgData.data } },
          { type: 'text', text: (text || 'Analyze this Cambridge exam paper and solve each question with full working and Cambridge mark scheme.') + (currentTopic !== 'All Topics' ? ` [Focus: ${currentTopic}]` : '') },
        ]
      : (currentTopic !== 'All Topics' ? `[Focus: ${currentTopic}]\n\n` : '') + text;

    const userMsg: ChatMessage = { role: 'user', content: userContent, imgSrc: imgData?.src };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

    streamingTextRef.current = '';
    streamingSourcesRef.current = [];

    setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }]);

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, topic: currentTopic, useRAG: true }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'sources') {
              streamingSourcesRef.current = parsed.sources;
              setLastSources(parsed.sources);
            } else if (parsed.type === 'text') {
              streamingTextRef.current += parsed.text;
              const currentText = streamingTextRef.current;
              const currentSources = streamingSourcesRef.current;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: currentText, sources: currentSources };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${msg}`, sources: [] };
        return updated;
      });
    }

    setIsStreaming(false);
  }, [isStreaming, inputValue, pendingImage, currentTopic, messages]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target!.result as string;
      setPendingImage({ data: dataUrl.split(',')[1], type: file.type || 'image/jpeg', src: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const quickSend = (text: string) => { setInputValue(text); setTimeout(sendMessage, 0); };

  const startExam = async () => {
    if (!selectedTopics.length) { setExamError('Please select at least one topic.'); return; }
    setExamError('');
    setIsGenerating(true);
    setExamView('active');
    setExamQuestions([]);
    setExamAnswers([]);
    setGradingData(null);
    setExamRagSources([]);

    const settings: ExamSettings = { numQ: numQuestions, difficulty, timeLimitMin: timeLimit, markingStyle, topics: selectedTopics };
    setExamSettings(settings);

    if (examTimerRef.current) clearInterval(examTimerRef.current);

    try {
      const resp = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: selectedTopics, numQuestions, difficulty }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Generation failed'); }
      const data = await resp.json();
      setExamQuestions(data.questions);
      setExamAnswers(new Array(data.questions.length).fill(''));
      setExamRagSources(data.sources || []);
      if (timeLimit > 0) startTimer(timeLimit * 60);
      else { setExamTimeRemaining(0); setExamTotalTime(0); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setExamError(msg);
      setExamView('setup');
    } finally {
      setIsGenerating(false);
    }
  };

  const startTimer = (seconds: number) => {
    setExamTimeRemaining(seconds);
    setExamTotalTime(seconds);
    if (examTimerRef.current) clearInterval(examTimerRef.current);
    examTimerRef.current = setInterval(() => {
      setExamTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(examTimerRef.current!);
          submitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTimerDisplay = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerClass = examTotalTime > 0
    ? examTimeRemaining <= 60 ? 'timer-display danger'
    : examTimeRemaining <= 300 ? 'timer-display warning'
    : 'timer-display'
    : 'timer-display';

  const timerProgress = examTotalTime > 0 ? (examTimeRemaining / examTotalTime) * 100 : 100;

  const submitExam = useCallback(async () => {
    if (examTimerRef.current) { clearInterval(examTimerRef.current); examTimerRef.current = null; }
    setIsGrading(true);

    const answeredCount = examAnswers.filter(a => a.trim().length > 0).length;
    const timeTaken = examSettings && examSettings.timeLimitMin > 0
      ? (() => { const used = examSettings.timeLimitMin * 60 - examTimeRemaining; const m = Math.floor(Math.max(used,0)/60); const s = Math.max(used,0)%60; return `${m}:${String(s).padStart(2,'0')}`; })()
      : '—';

    try {
      const resp = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: examQuestions, answers: examAnswers }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Grading failed'); }
      const grading: GradingData = await resp.json();

      setGradingData({ ...grading, _timeTaken: timeTaken, _answeredCount: answeredCount } as GradingData & { _timeTaken: string; _answeredCount: number });
      setExamView('results');

      const grade = grading.cambridgeGrade + (grading.percentage >= 90 && grading.cambridgeGrade === 'A' ? '*' : '');
      const record: HistoryRecord = {
        id: Date.now(),
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        grade, percentage: Math.round(grading.percentage),
        totalMarks: grading.totalMarks, totalAvailable: grading.totalAvailable,
        topics: examSettings?.topics || [], difficulty: examSettings?.difficulty || '',
        numQ: examSettings?.numQ || examQuestions.length,
        feedback: grading.overallFeedback,
        results: grading.results, questions: examQuestions,
      };
      const updated = [record, ...examHistory].slice(0, 50);
      setExamHistory(updated);
      localStorage.setItem('cam_exam_history', JSON.stringify(updated));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setExamError('Grading error: ' + msg);
    } finally {
      setIsGrading(false);
    }
  }, [examAnswers, examQuestions, examSettings, examTimeRemaining, examHistory]);

  const resetExam = () => {
    if (examTimerRef.current) { clearInterval(examTimerRef.current); examTimerRef.current = null; }
    setExamView('setup');
    setExamQuestions([]);
    setExamAnswers([]);
    setGradingData(null);
    setExamError('');
  };

  const clearHistory = () => {
    setExamHistory([]);
    localStorage.removeItem('cam_exam_history');
  };

  const avgExamScore = examHistory.length > 0
    ? Math.round(examHistory.reduce((a, h) => a + h.percentage, 0) / examHistory.length)
    : null;

  const gradeColor = (g: string) => ({ 'A*': '#d97706', A: '#059669', B: '#0891b2', C: '#6b6b8a', U: '#dc2626' } as Record<string, string>)[g[0]] || 'var(--muted)';
  const barColor = (pct: number) => pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';

  const topicScores: Record<string, { earned: number; available: number }> = {};
  examHistory.forEach(h => {
    if (h.results && h.questions) {
      h.results.forEach((r, i) => {
        const topic = h.questions[i]?.topic || 'Unknown';
        if (!topicScores[topic]) topicScores[topic] = { earned: 0, available: 0 };
        topicScores[topic].earned += r.marksAwarded || 0;
        topicScores[topic].available += r.marksAvailable || 1;
      });
    }
  });
  const topicPerf = Object.entries(topicScores)
    .map(([t, s]) => ({ topic: t, pct: Math.round((s.earned / s.available) * 100) }))
    .sort((a, b) => a.pct - b.pct);

  const bestGrade = examHistory.length
    ? examHistory.reduce((best, h) => {
        const order = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'];
        return order.indexOf(h.grade) < order.indexOf(best) ? h.grade : best;
      }, 'U')
    : '—';

  const gd = gradingData as (GradingData & { _timeTaken?: string; _answeredCount?: number }) | null;

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="logo-badge">CAIE 9709</span>
              <span className="header-title">Cambridge A-Level Tutor</span>
            </div>
            <div className="header-sub">Pure Mathematics · Statistics · Mechanics</div>
          </div>
        </div>
        <div className="level-badge">
          <div className="level-dot"></div>
          <span className="level-text">
            {isStreaming ? 'Thinking...' : qCount >= 3 ? 'Active' : qCount > 0 ? 'Assessing' : 'Ready'}
          </span>
        </div>
      </div>

      {/* RAG Banner */}
      <div className="rag-banner">
        <div className="rag-dot"></div>
        <span className="rag-label">RAG · Cambridge docs retrieval active</span>
        {lastSources.length > 0 && (
          <div className="rag-sources">
            {lastSources.slice(0, 3).map((s, i) => (
              <span key={i} className="rag-src-tag">{s}</span>
            ))}
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: '\'DM Mono\',monospace', color: '#4040a0' }}>
          API keys configured server-side
        </span>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div className={`tab${activeTab === 'tutor' ? ' active' : ''}`} onClick={() => setActiveTab('tutor')}>🎓 AI Tutor</div>
        <div className={`tab${activeTab === 'exam' ? ' active' : ''}`} onClick={() => setActiveTab('exam')}>📝 Exam Mode</div>
        <div className={`tab${activeTab === 'history' ? ' active' : ''}`} onClick={() => setActiveTab('history')}>📊 History & Stats</div>
      </div>

      <div className="layout">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">Paper Topics</div>
            <div
              className={`topic-chip${currentTopic === 'All Topics' ? ' active' : ''}`}
              onClick={() => setCurrentTopic('All Topics')}
            >
              <div className="topic-dot"></div>All Topics
            </div>
            {PAPER_GROUPS.map(group => (
              <div key={group.paper}>
                <div
                  className="paper-group-header"
                  onClick={() => togglePaper(group.paper)}
                  style={{ borderLeft: `3px solid ${group.color}` }}
                >
                  <span className="paper-code" style={{ background: group.color + '18', color: group.color, border: `1px solid ${group.color}40` }}>{group.code}</span>
                  <span className="paper-group-name">{group.paper}</span>
                  <span className="paper-chevron">{expandedPapers[group.paper] ? '▾' : '▸'}</span>
                </div>
                {expandedPapers[group.paper] && group.topics.map(topic => (
                  <div
                    key={topic}
                    className={`topic-sub-chip${currentTopic === topic ? ' active' : ''}`}
                    onClick={() => setCurrentTopic(topic)}
                  >
                    {topic}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Quick Practice</div>
            {[
              ['Give me a hard Cambridge 9709 integration by parts question with mark scheme', 'Integration by Parts'],
              ['Give me a Cambridge binomial theorem expansion question', 'Binomial Theorem'],
              ['Give me a normal distribution question from Cambridge Statistics 1', 'Normal Distribution'],
              ['Give me a kinematics question with variable acceleration', 'Kinematics'],
              ['Give me a Cambridge 9709 complex numbers question', 'Complex Numbers'],
              ['Give me a coordinate geometry question involving circles from Cambridge 9709', 'Coordinate Geometry'],
              ['Give me a Cambridge differential equations question with boundary conditions', 'Differential Equations'],
              ['Give me a Cambridge mechanics question on work and energy', 'Work & Energy'],
            ].map(([q, label]) => (
              <button key={label} className="quick-chip" onClick={() => { setActiveTab('tutor'); setInputValue(q); }}>
                {label}
              </button>
            ))}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Session Stats</div>
            <div className="stat-row">
              <div className="stat-box"><div className="stat-num">{qCount}</div><div className="stat-label">Questions</div></div>
              <div className="stat-box"><div className="stat-num">{examHistory.length}</div><div className="stat-label">Exams</div></div>
            </div>
            <div className="stat-row">
              <div className="stat-box" style={{ gridColumn: 'span 2' }}>
                <div className="stat-num">{avgExamScore !== null ? avgExamScore + '%' : '—'}</div>
                <div className="stat-label">Avg Score</div>
              </div>
            </div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">Exam Shortcuts</div>
            <button className="quick-chip" onClick={() => setActiveTab('exam')}>🎯 Start New Exam</button>
            <button className="quick-chip" onClick={() => { setActiveTab('tutor'); setInputValue('What are the top 5 examiner traps in Cambridge 9709?'); }}>⚠️ Examiner Traps</button>
            <button className="quick-chip" onClick={() => { setActiveTab('tutor'); setInputValue('Give me a complete A* revision strategy for Cambridge 9709'); }}>★ A* Strategy</button>
          </div>
        </div>

        <div className="main">

          {/* ─── TUTOR PANEL ─── */}
          <div className={`panel${activeTab === 'tutor' ? ' active' : ''}`} style={{ flexDirection: 'column' }}>
            <div className="chat-area" ref={chatAreaRef}>
              {messages.length === 0 && (
                <>
                  <div className="welcome-card">
                    <div className="welcome-eyebrow">CAMBRIDGE INTERNATIONAL AS & A LEVEL MATHEMATICS</div>
                    <div className="welcome-title">Your Elite 9709 Exam Coach</div>
                    <div className="welcome-sub">Cambridge examiner logic · Mark scheme framework · Adaptive A* training</div>
                    <div className="cap-grid">
                      <div className="cap-item"><span className="cap-icon">📐</span>Step-by-step with M &amp; A mark logic</div>
                      <div className="cap-item"><span className="cap-icon">🎯</span>Mark scheme simulation</div>
                      <div className="cap-item"><span className="cap-icon">🔍</span>Error diagnosis &amp; weak areas</div>
                      <div className="cap-item"><span className="cap-icon">📝</span>Targeted CAIE practice questions</div>
                      <div className="cap-item"><span className="cap-icon">🖼️</span>Upload scanned exam papers</div>
                      <div className="cap-item"><span className="cap-icon">★</span>A* grade strategy &amp; exam tips</div>
                    </div>
                  </div>
                  <div className="msg">
                    <div className="avatar ai">AI</div>
                    <div className="bubble ai">
                      <p>Type any 9709 question, upload a scan of your working, or use <strong>Exam Mode</strong> to take a timed test with auto-grading. RAG retrieval will search official Cambridge documents to ground answers in real mark schemes.</p>
                    </div>
                  </div>
                </>
              )}

              {messages.map((msg, idx) => (
                <div key={idx} className={`msg${msg.role === 'user' ? ' user' : ''}`}>
                  <div className={`avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className={`bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                    {msg.imgSrc && (
                      <img src={msg.imgSrc} alt="uploaded" style={{ maxWidth: 180, borderRadius: 5, marginBottom: 6, display: 'block' }} />
                    )}
                    {msg.role === 'assistant' ? (
                      <>
                        <div dangerouslySetInnerHTML={{ __html: formatResponse(typeof msg.content === 'string' ? msg.content : '') }} />
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="sources-row">
                            {msg.sources.map((s, i) => <span key={i} className="source-tag">📚 {s}</span>)}
                          </div>
                        )}
                      </>
                    ) : (
                      <p>{typeof msg.content === 'string' ? msg.content : msg.content?.find?.((b: ContentBlock) => b.type === 'text')?.text || ''}</p>
                    )}
                  </div>
                </div>
              ))}

              {isStreaming && messages.length > 0 && typeof messages[messages.length - 1].content === 'string' && (messages[messages.length - 1] as ChatMessage).content === '' && (
                <div className="msg">
                  <div className="avatar ai">AI</div>
                  <div className="bubble ai">
                    <div className="typing-indicator">
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="input-area">
              {pendingImage && (
                <div className="img-preview">
                  <img src={pendingImage.src} alt="preview" />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>Image attached</div>
                    <div style={{ fontSize: 10, fontFamily: '\'DM Mono\',monospace', color: 'var(--muted)' }}>Ready to analyze</div>
                  </div>
                  <button className="remove-img" onClick={() => setPendingImage(null)}>✕</button>
                </div>
              )}
              <div className="hint-row">
                {['Solve: ', 'Check my working: ', 'Explain: ', 'Common mistakes in: '].map((hint, i) => (
                  <div key={i} className="hint-tag" onClick={() => setInputValue(hint)}>
                    {['Solve a question', 'Check my working', 'Explain concept', 'Common mistakes'][i]}
                  </div>
                ))}
              </div>
              <div className="input-row">
                <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Upload exam paper">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                <textarea
                  ref={inputRef}
                  className="input-box"
                  rows={1}
                  placeholder="Type a Cambridge 9709 question or paste your working..."
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKey}
                  style={{ height: 'auto' }}
                  onInput={e => {
                    const t = e.currentTarget;
                    t.style.height = 'auto';
                    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                  }}
                />
                <button className="send-btn" id="sendBtn" onClick={sendMessage} disabled={isStreaming}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ─── EXAM PANEL ─── */}
          <div className={`panel${activeTab === 'exam' ? ' active' : ''}`}>
            <div className="exam-panel">

              {/* Setup */}
              {examView === 'setup' && (
                <div className="exam-setup">
                  <div className="exam-setup-title">Cambridge 9709 Mock Exam</div>
                  <div className="exam-setup-sub">Generate authentic Cambridge-style questions with RAG-enhanced context from past papers</div>
                  {examError && (
                    <div style={{ background: 'var(--red-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 16 }}>{examError}</div>
                  )}
                  <div className="setup-grid">
                    <div className="setup-field">
                      <label>Number of Questions</label>
                      <select className="setup-select" value={numQuestions} onChange={e => setNumQuestions(parseInt(e.target.value))}>
                        {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} Questions</option>)}
                      </select>
                    </div>
                    <div className="setup-field">
                      <label>Difficulty</label>
                      <select className="setup-select" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                        <option value="mixed">Mixed (Progressive)</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="exam">Authentic Cambridge</option>
                      </select>
                    </div>
                    <div className="setup-field">
                      <label>Time Limit</label>
                      <select className="setup-select" value={timeLimit} onChange={e => setTimeLimit(parseInt(e.target.value))}>
                        <option value={0}>No Limit</option>
                        <option value={30}>30 Minutes</option>
                        <option value={45}>45 Minutes</option>
                        <option value={60}>1 Hour</option>
                        <option value={75}>75 Minutes</option>
                        <option value={90}>90 Minutes</option>
                      </select>
                    </div>
                    <div className="setup-field">
                      <label>Marking Style</label>
                      <select className="setup-select" value={markingStyle} onChange={e => setMarkingStyle(e.target.value)}>
                        <option value="strict">Strict (Cambridge)</option>
                        <option value="lenient">Lenient (Learning)</option>
                      </select>
                    </div>
                  </div>
                  <div className="setup-field" style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 9, fontFamily: '\'DM Mono\',monospace', color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Topics (select at least one)</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setSelectedTopics(ALL_EXAM_TOPICS)} style={{ fontSize: 10, fontFamily: '\'DM Mono\',monospace', background: 'var(--faint)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'var(--ink2)' }}>Select All</button>
                        <button onClick={() => setSelectedTopics([])} style={{ fontSize: 10, fontFamily: '\'DM Mono\',monospace', background: 'var(--faint)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'var(--muted)' }}>Clear</button>
                      </div>
                    </div>
                    {PAPER_GROUPS.map(group => {
                      const allChecked = group.topics.every(t => selectedTopics.includes(t));
                      const someChecked = group.topics.some(t => selectedTopics.includes(t));
                      return (
                        <div key={group.paper} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, paddingBottom: 4, borderBottom: `1px solid ${group.color}30` }}>
                            <span style={{ fontSize: 10, fontFamily: '\'DM Mono\',monospace', fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: group.color + '18', color: group.color, border: `1px solid ${group.color}40` }}>{group.code}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink2)', flex: 1 }}>{group.paper}</span>
                            <button
                              onClick={() => {
                                if (allChecked) setSelectedTopics(prev => prev.filter(t => !group.topics.includes(t)));
                                else setSelectedTopics(prev => [...new Set([...prev, ...group.topics])]);
                              }}
                              style={{ fontSize: 10, fontFamily: '\'DM Mono\',monospace', background: allChecked ? group.color : someChecked ? group.color + '30' : 'var(--faint)', color: allChecked ? 'white' : group.color, border: `1px solid ${group.color}50`, borderRadius: 4, padding: '1px 7px', cursor: 'pointer' }}
                            >{allChecked ? '✓ All' : 'Select'}</button>
                          </div>
                          <div className="topic-checkboxes" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                            {group.topics.map(topic => (
                              <label key={topic} className={`topic-cb${selectedTopics.includes(topic) ? ' checked' : ''}`} style={{ borderLeft: `2px solid ${selectedTopics.includes(topic) ? group.color : 'transparent'}` }}>
                                <input
                                  type="checkbox"
                                  checked={selectedTopics.includes(topic)}
                                  onChange={e => setSelectedTopics(prev => e.target.checked ? [...prev, topic] : prev.filter(t => t !== topic))}
                                />
                                {topic}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button className="start-exam-btn" onClick={startExam} disabled={selectedTopics.length === 0}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    Start Exam
                  </button>
                </div>
              )}

              {/* Active Exam */}
              {examView === 'active' && (
                <div className="active-exam">
                  <div style={{ background: 'var(--ink)', borderRadius: '12px 12px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: '\'DM Mono\',monospace', fontSize: 10, color: '#6060a0', letterSpacing: '.08em' }}>
                        CAMBRIDGE 9709 MOCK EXAM
                        {examRagSources.length > 0 && <span style={{ color: '#4040a0', marginLeft: 8 }}>· RAG Enhanced</span>}
                      </div>
                      <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>
                        {examQuestions.length > 0
                          ? `${examQuestions.length}-Question ${difficulty === 'exam' ? 'Cambridge Paper' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Exam`
                          : 'Generating questions...'}
                      </div>
                    </div>
                    <div className={timerClass}>
                      {examTotalTime > 0 ? formatTimerDisplay(examTimeRemaining) : '∞'}
                    </div>
                  </div>
                  <div className="progress-bar-outer">
                    <div className="progress-bar-inner" style={{ width: timerProgress + '%' }}></div>
                  </div>

                  <div className="questions-area">
                    {isGenerating ? (
                      <div className="loading-questions">
                        <div className="loading-spinner"></div>
                        <div>Generating Cambridge questions with RAG context...</div>
                      </div>
                    ) : examQuestions.length === 0 ? (
                      <div className="loading-questions">No questions loaded.</div>
                    ) : (
                      examQuestions.map((q, i) => {
                        const diff = (q.difficulty || '').toLowerCase();
                        const cls = diff === 'hard' ? 'hard' : diff === 'easy' ? 'easy' : 'medium';
                        return (
                          <div key={q.id} className="exam-question-card">
                            <div className="q-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span className="q-num">Question {i + 1}</span>
                                <span className={`badge ${cls}`}>{q.difficulty || 'Medium'}</span>
                                <span className="q-topic-badge">{q.topic}</span>
                              </div>
                              <span className="q-marks">[{q.marks} marks]</span>
                            </div>
                            <div className="q-text">{q.question}</div>
                            {q.math_expression && <div className="q-math">{q.math_expression}</div>}
                            <textarea
                              className="answer-area"
                              placeholder="Write your working here... Show all steps for method marks."
                              value={examAnswers[i] || ''}
                              onChange={e => {
                                const updated = [...examAnswers];
                                updated[i] = e.target.value;
                                setExamAnswers(updated);
                              }}
                            />
                            <div style={{ fontSize: 10, fontFamily: '\'DM Mono\',monospace', color: 'var(--muted)', marginTop: 5 }}>💡 {q.hint}</div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="exam-footer">
                    <div className="q-progress-text">
                      {isGenerating ? 'Generating questions...' : isGrading ? 'Grading...' :
                        examQuestions.length > 0 ? `${examQuestions.length} questions · ${examQuestions.reduce((a, q) => a + q.marks, 0)} marks total` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={resetExam} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>
                        Cancel
                      </button>
                      <button
                        className="submit-exam-btn"
                        onClick={submitExam}
                        disabled={isGenerating || isGrading || examQuestions.length === 0}
                      >
                        {isGrading ? 'Grading...' : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                            Submit &amp; Grade
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Results */}
              {examView === 'results' && gd && (
                <div className="results-panel">
                  <div className="results-header">
                    <div className="results-grade" style={{ color: gradeColor(gd.cambridgeGrade) }}>
                      {gd.cambridgeGrade}{gd.percentage >= 90 && gd.cambridgeGrade === 'A' ? '*' : ''}
                    </div>
                    <div className="results-label">{gd.overallFeedback}</div>
                    <div className="results-stats">
                      <div className="result-stat"><div className="result-stat-num">{gd.totalMarks}/{gd.totalAvailable}</div><div className="result-stat-label">Score</div></div>
                      <div className="result-stat"><div className="result-stat-num">{Math.round(gd.percentage)}%</div><div className="result-stat-label">Percentage</div></div>
                      <div className="result-stat"><div className="result-stat-num">{gd._answeredCount}/{examQuestions.length}</div><div className="result-stat-label">Attempted</div></div>
                      <div className="result-stat"><div className="result-stat-num">{gd._timeTaken || '—'}</div><div className="result-stat-label">Time Used</div></div>
                    </div>
                  </div>
                  <div className="results-body">
                    {(gd.results || []).map((r, i) => {
                      const q = examQuestions[i] || {} as ExamQuestion;
                      const pct = r.marksAvailable > 0 ? r.marksAwarded / r.marksAvailable : 0;
                      const scoreClass = pct >= 0.8 ? 'result-score-badge score-full' : pct >= 0.4 ? 'result-score-badge score-partial' : 'result-score-badge score-zero';
                      return (
                        <div key={i} className="result-q-row">
                          <div className="result-q-top">
                            <span className={scoreClass}>{r.marksAwarded}/{r.marksAvailable} marks</span>
                            <span style={{ fontSize: 12, fontWeight: 500 }}>Q{i + 1}: {q.topic || ''}</span>
                            {q.difficulty && <span className={`badge ${(q.difficulty || '').toLowerCase()}`}>{q.difficulty}</span>}
                          </div>
                          <div className="result-feedback">{r.feedback}</div>
                          <div className="result-answer-box"><strong>Model answer:</strong> {r.modelAnswer || q.model_answer || 'See mark scheme'}</div>
                        </div>
                      );
                    })}
                    <button className="new-exam-btn" onClick={resetExam}>← New Exam</button>
                    <button className="new-exam-btn" style={{ background: 'var(--ink)', marginTop: 8 }} onClick={() => setActiveTab('history')}>📊 View Full History</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── HISTORY PANEL ─── */}
          <div className={`panel${activeTab === 'history' ? ' active' : ''}`}>
            <div className="history-panel">
              {examHistory.length === 0 ? (
                <div className="history-empty">
                  <div className="history-empty-icon">📋</div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No exam history yet</div>
                  <div style={{ fontSize: 12 }}>Complete an exam in Exam Mode to see your stats here.</div>
                </div>
              ) : (
                <>
                  <div className="history-header">
                    <div className="history-title">Exam History &amp; Performance</div>
                    <button className="clear-history-btn" onClick={clearHistory}>Clear All</button>
                  </div>
                  <div className="history-stats-row">
                    <div className="h-stat"><div className="h-stat-num">{examHistory.length}</div><div className="h-stat-label">Exams Taken</div></div>
                    <div className="h-stat"><div className="h-stat-num">{avgExamScore !== null ? avgExamScore + '%' : '—'}</div><div className="h-stat-label">Average Score</div></div>
                    <div className="h-stat"><div className="h-stat-num" style={{ color: gradeColor(bestGrade) }}>{bestGrade}</div><div className="h-stat-label">Best Grade</div></div>
                  </div>
                  {topicPerf.length > 0 && (
                    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 9, fontFamily: '\'DM Mono\',monospace', color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>Performance by Topic</div>
                      {topicPerf.map(t => (
                        <div key={t.topic} className="perf-row">
                          <div className="perf-label">{t.topic}</div>
                          <div className="perf-bar-outer"><div className="perf-bar-inner" style={{ width: t.pct + '%', background: barColor(t.pct) }}></div></div>
                          <div className="perf-pct">{t.pct}%</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {examHistory.map(h => (
                    <div key={h.id} className="history-card">
                      <div className="hc-top">
                        <div className="hc-grade" style={{ color: gradeColor(h.grade) }}>{h.grade}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{Math.round(h.percentage)}% · {h.totalMarks}/{h.totalAvailable} marks</div>
                          <div className="hc-date">{h.date}</div>
                        </div>
                      </div>
                      <div className="hc-meta">
                        {h.topics?.map(t => <span key={t} className="hc-tag">{t}</span>)}
                        {h.difficulty && <span className="hc-tag">{h.difficulty}</span>}
                        <span className="hc-tag">{h.numQ}Q</span>
                      </div>
                      {h.feedback && <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 7, lineHeight: 1.5 }}>{h.feedback}</div>}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
