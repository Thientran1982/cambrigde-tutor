'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import ResponseFormatter from '@/components/ResponseFormatter';
import SourceCitations from '@/components/SourceCitations';
import type { Message, ExamQuestion, ExamHistory, ExamSettings, GradingResponse } from '@/lib/types';
// ─── CSS-in-JS styles ────────────────────────────────────────────────────────
const S = {
  app:        { display:'flex', flexDirection:'column' as const, height:'100vh', overflow:'hidden' },
  header:     { background:'#1a1a2e', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'2px solid #4f46e5', flexShrink:0 },
  logoBadge:  { background:'#4f46e5', color:'white', fontFamily:"'DM Mono',monospace", fontSize:10, fontWeight:500, padding:'3px 8px', borderRadius:4, letterSpacing:'.05em' },
  headerTitle:{ color:'white', fontSize:16, fontWeight:700, letterSpacing:'-.02em' },
  headerSub:  { color:'#8080b0', fontSize:11, fontFamily:"'DM Mono',monospace", marginTop:1 },
  levelBadge: { display:'flex', alignItems:'center', gap:6, background:'rgba(212,175,55,.13)', border:'1px solid rgba(212,175,55,.3)', borderRadius:20, padding:'4px 12px' },
  levelDot:   { width:6, height:6, borderRadius:'50%', background:'#d97706' },
  levelText:  { color:'#d97706', fontSize:11, fontWeight:500, fontFamily:"'DM Mono',monospace" },
  tabs:       { display:'flex', background:'white', borderBottom:'1px solid #dddcf0', flexShrink:0, padding:'0 20px' },
  tab:        { padding:'10px 18px', fontSize:12, fontWeight:500, color:'#6b6b8a', cursor:'pointer', borderBottom:'2px solid transparent', transition:'all .15s', display:'flex', alignItems:'center', gap:6 },
  tabActive:  { color:'#4f46e5', borderBottomColor:'#4f46e5' },
  layout:     { display:'flex', flex:1, overflow:'hidden' },
  sidebar:    { width:220, background:'white', borderRight:'1px solid #dddcf0', display:'flex', flexDirection:'column' as const, overflowY:'auto' as const, flexShrink:0 },
  sideSection:{ padding:14, borderBottom:'1px solid #dddcf0' },
  sideLabel:  { fontSize:9, fontFamily:"'DM Mono',monospace", color:'#6b6b8a', letterSpacing:'.1em', textTransform:'uppercase' as const, marginBottom:9 },
  chip:       { display:'flex', alignItems:'center', gap:7, padding:'6px 9px', borderRadius:6, cursor:'pointer', fontSize:12, color:'#2d2d4e', marginBottom:3, border:'1px solid transparent' },
  chipActive: { background:'#4f46e5', color:'white', borderColor:'#4f46e5' },
  quickBtn:   { background:'#f0eff8', border:'1px solid #dddcf0', borderRadius:5, padding:'6px 8px', fontSize:11, color:'#2d2d4e', cursor:'pointer', marginBottom:4, transition:'all .15s', lineHeight:1.35, display:'block', width:'100%', textAlign:'left' as const },
  statRow:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginTop:6 },
  statBox:    { background:'#f0eff8', border:'1px solid #dddcf0', borderRadius:6, padding:'7px 8px', textAlign:'center' as const },
  statNum:    { fontSize:18, fontWeight:700, color:'#4f46e5', fontFamily:"'DM Mono',monospace" },
  statLabel:  { fontSize:9, color:'#6b6b8a', marginTop:1, fontFamily:"'DM Mono',monospace" },
  main:       { flex:1, display:'flex', flexDirection:'column' as const, overflow:'hidden', minWidth:0 },
  chatArea:   { flex:1, overflowY:'auto' as const, padding:'20px 24px', display:'flex', flexDirection:'column' as const, gap:16 },
  msg:        { display:'flex', gap:9, alignItems:'flex-start' },
  avatar:     { width:31, height:31, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0, fontFamily:"'DM Mono',monospace" },
  avatarAI:   { background:'#1a1a2e', color:'#4f46e5', border:'1px solid #dddcf0' },
  avatarUser: { background:'#4f46e5', color:'white' },
  bubble:     { maxWidth:'78%', background:'white', border:'1px solid #dddcf0', borderRadius:'4px 11px 11px 11px', padding:'12px 15px', fontSize:13, lineHeight:1.68, color:'#1a1a2e' },
  bubbleUser: { background:'#4f46e5', borderColor:'#4f46e5', color:'white', borderRadius:'11px 4px 11px 11px' },
  inputArea:  { borderTop:'1px solid #dddcf0', background:'white', padding:'12px 18px', flexShrink:0 },
  hintRow:    { display:'flex', gap:5, marginBottom:9, flexWrap:'wrap' as const },
  hintTag:    { background:'#f0eff8', border:'1px solid #dddcf0', borderRadius:5, padding:'3px 9px', fontSize:10, color:'#6b6b8a', cursor:'pointer', fontFamily:"'DM Mono',monospace" },
  inputRow:   { display:'flex', gap:7, alignItems:'flex-end' },
  inputBox:   { flex:1, border:'1.5px solid #dddcf0', borderRadius:9, padding:'9px 13px', fontFamily:"'Syne',sans-serif", fontSize:13, color:'#1a1a2e', background:'#f8f8fd', resize:'none' as const, outline:'none', minHeight:42, maxHeight:120 },
  iconBtn:    { width:42, height:42, border:'1.5px solid #dddcf0', borderRadius:9, background:'white', color:'#6b6b8a', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  sendBtn:    { width:42, height:42, background:'#4f46e5', border:'none', borderRadius:9, color:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
};
// ─── TOPICS ──────────────────────────────────────────────────────────────────
const ALL_TOPICS = [
  'Integration','Differentiation','Algebra and Functions','Trigonometry',
  'Coordinate Geometry','Sequences and Series','Probability and Statistics',
  'Normal Distribution','Kinematics','Forces and Newton Laws','Vectors','Complex Numbers',
];
// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Home() {
  // Tutor state
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState('');
  const [isStreaming, setIsStreaming]    = useState(false);
  const [currentTopic, setCurrentTopic] = useState('All Topics');
  const [qCount, setQCount]             = useState(0);
  const [pendingImg, setPendingImg]      = useState<{data:string;type:string;preview:string}|null>(null);
  const [msgSources, setMsgSources]     = useState<Record<number,string[]>>({});
  // Tab
  const [tab, setTab] = useState<'tutor'|'exam'|'history'>('tutor');

  // Exam state
  const [examTopics, setExamTopics]     = useState<string[]>(['Integration','Differentiation','Algebra and Functions','Trigonometry','Coordinate Geometry','Sequences and Series']);
  const [numQ, setNumQ]                 = useState(5);
  const [difficulty, setDifficulty]     = useState('mixed');
  const [timeLimit, setTimeLimit]       = useState(35);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [examAnswers, setExamAnswers]   = useState<string[]>([]);
  const [examPhase, setExamPhase]       = useState<'setup'|'active'|'results'>('setup');
  const [examLoading, setExamLoading]   = useState(false);
  const [grading, setGrading]           = useState<GradingResponse|null>(null);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [timeLeft, setTimeLeft]         = useState(0);
  const [totalTime, setTotalTime]       = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const [examSources, setExamSources]   = useState<string[]>([]);
  // History
  const [history, setHistory]           = useState<ExamHistory[]>([]);
  const chatRef    = useRef<HTMLDivElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const saved = localStorage.getItem('cam_exam_history_v2');
    if (saved) setHistory(JSON.parse(saved));
  }, []);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isStreaming]);
  // ── Timer ─────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);
  const submitExam = useCallback(async (qs: ExamQuestion[], ans: string[], settings: ExamSettings) => {
    stopTimer();
    setGradingLoading(true);
    try {
      const resp = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: qs, answers: ans, examSettings: settings }),
      });
      const data: GradingResponse = await resp.json();
      setGrading(data);
      setExamPhase('results');

      // Save to history
      const grade = data.cambridgeGrade + (data.percentage >= 90 && data.cambridgeGrade === 'A' ? '*' : '');
      const record: ExamHistory = {
        id: Date.now(),
        date: new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }),
        grade, percentage: Math.round(data.percentage),
        totalMarks: data.totalMarks, totalAvailable: data.totalAvailable,
        topics: settings.topics, difficulty: settings.difficulty, numQ: settings.numQ,
        feedback: data.overallFeedback, results: data.results, questions: qs,
        sources: data.sources,
      };
      setHistory(prev => {
        const next = [record, ...prev].slice(0, 50);
        localStorage.setItem('cam_exam_history_v2', JSON.stringify(next));
        return next;
      });
    } catch (e) {
      console.error('Grade error', e);
    }
    setGradingLoading(false);
  }, [stopTimer]);
  const startTimer = useCallback((seconds: number, qs: ExamQuestion[], ans: string[], settings: ExamSettings) => {
    setTimeLeft(seconds); setTotalTime(seconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { submitExam(qs, ans, settings); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [submitExam]);
  // ── Send chat message ──────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (isStreaming || (!input.trim() && !pendingImg)) return;
    const text = input.trim();
    setInput(''); setIsStreaming(true); setQCount(c => c + 1);
    // Build user message
    let userContent: Message['content'];
    if (pendingImg) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: pendingImg.type, data: pendingImg.data } },
        { type: 'text', text: text || 'Analyze this Cambridge exam paper and solve with full working.' },
      ];
    } else {
      userContent = (currentTopic !== 'All Topics' ? `[Focus: ${currentTopic}]\n\n` : '') + text;
    }
    const newMessages: Message[] = [...messages, { role: 'user', content: userContent }];
    setMessages(newMessages);
    setPendingImg(null);
    // Placeholder for streaming
    const aiIdx = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          topic: currentTopic,
          useRAG: true,
        }),
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'text') {
              accumulated += parsed.text;
              setMessages(prev => prev.map((m, i) => i === aiIdx ? { ...m, content: accumulated } : m));
            } else if (parsed.type === 'sources') {
              setMsgSources(prev => ({ ...prev, [aiIdx]: parsed.sources }));
            }
          } catch {}
        }
      }
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: accumulated }]);
    } catch (e) {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `Error: ${(e as Error).message}` }]);
    }
    setIsStreaming(false);
  };
  // ── Exam generation ────────────────────────────────────────────────────────
  const startExam = async () => {
    if (!examTopics.length) { alert('Select at least one topic'); return; }
    setExamLoading(true); setExamPhase('active'); setExamQuestions([]); setGrading(null);
    try {
      const resp = await fetch('/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: examTopics, numQuestions: numQ, difficulty }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setExamQuestions(data.questions);
      setExamAnswers(new Array(data.questions.length).fill(''));
      setExamSources(data.sources || []);
      if (timeLimit > 0) {
        const settings: ExamSettings = { numQ, difficulty, timeLimitMin: timeLimit, markingStyle: 'auto', topics: examTopics };
        startTimer(timeLimit * 60, data.questions, new Array(data.questions.length).fill(''), settings);
      }
    } catch (e) {
      alert('Error generating exam: ' + (e as Error).message);
      setExamPhase('setup');
    }
    setExamLoading(false);
  };
  const handleSubmitExam = () => {
    const settings: ExamSettings = { numQ, difficulty, timeLimitMin: timeLimit, markingStyle:'auto', topics: examTopics };
    submitExam(examQuestions, examAnswers, settings);
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target!.result as string;
      setPendingImg({ data: dataUrl.split(',')[1], type: file.type || 'image/jpeg', preview: dataUrl });
    };
    reader.readAsDataURL(file); e.target.value = '';
  };
  const formatTimer = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const timerColor  = timeLeft <= 60 ? '#f87171' : timeLeft <= 300 ? '#fbbf24' : 'white';
  const gradeColor = (g: string) => ({'A*':'#d97706','A':'#059669','B':'#0891b2','C':'#6b6b8a','U':'#dc2626'})[g[0]] || '#6b6b8a';
  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.app}>

      {/* HEADER */}
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={S.logoBadge}>CAIE 9709</span>
              <span style={S.headerTitle}>Cambridge A-Level Tutor</span>
            </div>
            <div style={S.headerSub}>Pure Mathematics · Statistics · Mechanics · RAG-powered</div>
          </div>
        </div>
        <div style={S.levelBadge}>
          <div style={{ ...S.levelDot, animation:'pulse 2s infinite' }}/>
          <span style={S.levelText}>{qCount >= 3 ? 'Active session' : qCount >= 1 ? 'Assessing' : 'Ready'}</span>
        </div>
      </div>
      {/* TABS */}
      <div style={S.tabs}>
        {(['tutor','exam','history'] as const).map(t => (
          <div key={t} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }} onClick={() => setTab(t)}>
            {t === 'tutor' ? '🎓' : t === 'exam' ? '📝' : '📊'} {t.charAt(0).toUpperCase() + t.slice(1)}{t === 'history' ? ' & Stats' : t === 'exam' ? ' Mode' : ' Chat'}
          </div>
        ))}
      </div>
      <div style={S.layout}>
        {/* SIDEBAR */}
        <div style={S.sidebar}>
          <div style={S.sideSection}>
            <div style={S.sideLabel}>Paper Topics</div>
            {['All Topics','Pure 1','Pure 2/3','Statistics 1','Mechanics'].map(t => (
              <div key={t} style={{ ...S.chip, ...(currentTopic === t ? S.chipActive : {}) }}
                onClick={() => setCurrentTopic(t)}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', opacity:.5 }}/>
                {t}
              </div>
            ))}
          </div>
          <div style={S.sideSection}>
            <div style={S.sideLabel}>Quick Practice</div>
            {[
              ['Integration by Parts', 'Give me a hard integration by parts question from Cambridge 9709'],
              ['Binomial Theorem', 'Give me a Cambridge binomial theorem expansion question with mark scheme'],
              ['Normal Distribution', 'Give me a normal distribution question from Cambridge Statistics 1'],
              ['Kinematics', 'Give me a kinematics problem with variable acceleration from Cambridge Mechanics'],
              ['3D Vectors', 'Give me a Cambridge 9709 3D vectors question with dot product'],
            ].map(([label, prompt]) => (
              <button key={label} style={S.quickBtn} onClick={() => { setInput(prompt); setTab('tutor'); setTimeout(() => textareaRef.current?.focus(), 100); }}>{label}</button>
            ))}
          </div>
          <div style={S.sideSection}>
            <div style={S.sideLabel}>Session Stats</div>
            <div style={S.statRow}>
              <div style={S.statBox}><div style={S.statNum}>{qCount}</div><div style={S.statLabel}>Questions</div></div>
              <div style={S.statBox}><div style={S.statNum}>{history.length}</div><div style={S.statLabel}>Exams</div></div>
            </div>
            <div style={{ ...S.statRow, marginTop:5 }}>
              <div style={{ ...S.statBox, gridColumn:'span 2' }}>
                <div style={S.statNum}>{history.length ? Math.round(history.reduce((a,h) => a+h.percentage,0)/history.length) + '%' : '—'}</div>
                <div style={S.statLabel}>Avg Score</div>
              </div>
            </div>
          </div>
          <div style={S.sideSection}>
            <div style={S.sideLabel}>Shortcuts</div>
            <button style={S.quickBtn} onClick={() => setTab('exam')}> Start New Exam</button>
            <button style={S.quickBtn} onClick={() => { setInput('What are the top 5 examiner traps in Cambridge 9709?'); setTab('tutor'); }}> Examiner Traps</button>
            <button style={S.quickBtn} onClick={() => { setInput('Give me a complete A* revision strategy for Cambridge 9709'); setTab('tutor'); }}>★ A* Strategy</button>
          </div>
        </div>
        {/* MAIN */}
        <div style={S.main}>
          {/* ── TUTOR TAB ─────────────────────────────────────────────── */}
          {tab === 'tutor' && (
            <>
              <div style={S.chatArea} ref={chatRef}>
                {/* Welcome */}
                <div style={{ background:'linear-gradient(135deg,#1a1a2e,#2d2d4e)', borderRadius:12, padding:22, color:'white', border:'1px solid rgba(79,70,229,.35)' }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:'#6060a0', letterSpacing:'.1em', marginBottom:7 }}>CAMBRIDGE 9709 · RAG-POWERED WITH OFFICIAL DOCUMENTS</div>
                  <div style={{ fontFamily:"'Crimson Pro',serif", fontSize:24, fontWeight:600, marginBottom:5 }}>Your Elite A* Exam Coach</div>
                  <div style={{ fontSize:12, color:'#9090b8', marginBottom:16, lineHeight:1.5 }}>Answers grounded in official Cambridge syllabus, past papers & mark schemes</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {[['📐','Step-by-step with M & A mark logic'],['🎯','Cambridge mark scheme simulation'],['📚','RAG: cites official Cambridge docs'],['📝','Targeted CAIE practice questions'],['🖼️','Upload scanned exam papers'],['★','A* grade strategy & exam tips']].map(([icon,text]) => (
                      <div key={text} style={{ background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:'9px 11px', fontSize:11, color:'#c0c0d8', lineHeight:1.3 }}>
                        <span style={{ display:'block', marginBottom:4 }}>{icon}</span>{text}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Messages */}
                {messages.map((m, i) => (
                  <div key={i}>
                    <div style={{ ...S.msg, ...(m.role === 'user' ? { flexDirection:'row-reverse' } : {}) }}>
                      <div style={{ ...S.avatar, ...(m.role === 'user' ? S.avatarUser : S.avatarAI) }}>
                        {m.role === 'user' ? 'U' : 'AI'}
                      </div>
                      <div style={{ ...S.bubble, ...(m.role === 'user' ? S.bubbleUser : {}) }}>
                        {m.role === 'user' ? (
                          typeof m.content === 'string' ? m.content :
                          (m.content as {type:string;text?:string}[]).find(b => b.type === 'text')?.text || ''
                        ) : (
                          typeof m.content === 'string' && m.content
                            ? <ResponseFormatter text={m.content as string}/>
                            : <div style={{ display:'flex', gap:4, padding:'4px 0' }}>
                                {[0,1,2].map(d => <span key={d} style={{ width:6, height:6, borderRadius:'50%', background:'#6b6b8a', display:'inline-block', animation:`blink 1.2s ${d*0.2}s infinite` }}/>)}
                              </div>
                        )}
                      </div>
                    </div>
                    {m.role === 'assistant' && msgSources[i] && (
                      <div style={{ marginLeft:40 }}>
                        <SourceCitations sources={msgSources[i]} ragUsed={true}/>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Input */}
              <div style={S.inputArea}>
                {pendingImg && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f0eff8', border:'1px solid #dddcf0', borderRadius:7, padding:'7px 11px', marginBottom:8 }}>
                    <img src={pendingImg.preview} alt="upload" style={{ width:40, height:40, objectFit:'cover', borderRadius:5 }}/>
                    <div style={{ fontSize:12 }}>Paper uploaded</div>
                    <button onClick={() => setPendingImg(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'#6b6b8a', fontSize:16 }}>✕</button>
                  </div>
                )}
                <div style={S.hintRow}>
                  {['Solve: ','Check my working: ','Explain: ','Common mistakes in: '].map(h => (
                    <span key={h} style={S.hintTag} onClick={() => setInput(h)}>{h.replace(': ','')}</span>
                  ))}
                </div>
                <div style={S.inputRow}>
                  <button style={S.iconBtn} onClick={() => fileRef.current?.click()} title="Upload exam paper">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFileUpload}/>
                  <textarea
                    ref={textareaRef}
                    style={S.inputBox}
                    value={input}
                    onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; }}
                    onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }}
                    placeholder="Type a Cambridge 9709 question, paste your working, or upload a scan..."
                    rows={1}
                  />
                  <button style={{ ...S.sendBtn, ...(isStreaming ? { background:'#dddcf0', cursor:'not-allowed' } : {}) }} onClick={sendMessage} disabled={isStreaming}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </div>
            </>
          )}
          {/* ── EXAM TAB ──────────────────────────────────────────────── */}
          {tab === 'exam' && (
            <div style={{ flex:1, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:20 }}>
              {/* SETUP */}
              {examPhase === 'setup' && (
                <div style={{ background:'white', border:'1px solid #dddcf0', borderRadius:14, padding:24 }}>
                  <div style={{ fontFamily:"'Crimson Pro',serif", fontSize:20, fontWeight:600, marginBottom:4 }}>Generate Custom Exam</div>
                  <div style={{ fontSize:12, color:'#6b6b8a', marginBottom:20 }}>AI generates Cambridge-style questions grounded in official past papers and mark schemes via RAG.</div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
                    {[
                      ['Number of Questions', 'numQ', [[3,'3 questions (~20 min)'],[5,'5 questions (~35 min)'],[8,'8 questions (~55 min)'],[10,'10 questions (~75 min)']]],
                      ['Difficulty', 'difficulty', [['easy','Easy (AS foundation)'],['mixed','Mixed (Easy → Hard)'],['hard','Hard (A* target)'],['exam','Cambridge realistic']]],
                      ['Time Limit', 'timeLimit', [[0,'No timer'],[20,'20 minutes'],[35,'35 minutes'],[50,'50 minutes'],[75,'75 minutes'],[90,'90 minutes']]],
                    ].map(([label, field, opts]) => (
                      <div key={field as string}>
                        <label style={{ display:'block', fontSize:9, fontFamily:"'DM Mono',monospace", color:'#6b6b8a', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:6 }}>{label as string}</label>
                        <select style={{ width:'100%', border:'1.5px solid #dddcf0', borderRadius:8, padding:'8px 11px', fontFamily:"'Syne',sans-serif", fontSize:12, color:'#1a1a2e', background:'#f8f8fd', outline:'none' }}
                          value={field === 'numQ' ? numQ : field === 'difficulty' ? difficulty : timeLimit}
                          onChange={e => { const v = field==='difficulty'?e.target.value:parseInt(e.target.value); field==='numQ'?setNumQ(v as number):field==='difficulty'?setDifficulty(v as string):setTimeLimit(v as number); }}>
                          {(opts as [string|number, string][]).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <label style={{ display:'block', fontSize:9, fontFamily:"'DM Mono',monospace", color:'#6b6b8a', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>Topics to Include</label>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:20 }}>
                    {ALL_TOPICS.map(t => {
                      const checked = examTopics.includes(t);
                      return (
                        <label key={t} style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 9px', border:`1.5px solid ${checked?'#4f46e5':'#dddcf0'}`, borderRadius:7, cursor:'pointer', fontSize:11, background:checked?'#f0eff8':'white', color:checked?'#4f46e5':'#2d2d4e', fontWeight:checked?500:400 }}>
                          <input type="checkbox" checked={checked} onChange={e => setExamTopics(prev => e.target.checked ? [...prev,t] : prev.filter(x=>x!==t))} style={{ accentColor:'#4f46e5' }}/>
                          {t}
                        </label>
                      );
                    })}
                  </div>
                  <button style={{ width:'100%', background:'#4f46e5', color:'white', border:'none', borderRadius:10, padding:13, fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
                    onClick={startExam}>
                    ▶ Generate &amp; Start Exam
                  </button>
                </div>
              )}
              {/* ACTIVE EXAM */}
              {examPhase === 'active' && (
                <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                  <div style={{ background:'#1a1a2e', borderRadius:'12px 12px 0 0', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#6060a0', letterSpacing:'.08em' }}>CAMBRIDGE 9709 · AI GENERATED · RAG-GROUNDED</div>
                      <div style={{ color:'white', fontSize:14, fontWeight:600 }}>{numQ}-Question {difficulty === 'exam' ? 'Cambridge Paper' : difficulty.charAt(0).toUpperCase()+difficulty.slice(1)} Exam</div>
                    </div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:22, fontWeight:500, color: timeLimit > 0 ? timerColor : 'white' }}>
                      {timeLimit > 0 ? formatTimer(timeLeft) : '∞'}
                    </div>
                  </div>
                  {timeLimit > 0 && (
                    <div style={{ height:4, background:'rgba(255,255,255,.1)', overflow:'hidden' }}>
                      <div style={{ height:'100%', background:'#4f46e5', width:`${(timeLeft/totalTime)*100}%`, transition:'width .5s' }}/>
                    </div>
                  )}
                  {examLoading ? (
                    <div style={{ background:'white', border:'1px solid #dddcf0', borderTop:'none', borderRadius:'0 0 12px 12px', padding:40, textAlign:'center', color:'#6b6b8a' }}>
                      <div style={{ width:32, height:32, border:'3px solid #dddcf0', borderTopColor:'#4f46e5', borderRadius:'50%', animation:'spin .8s linear infinite', margin:'0 auto 12px' }}/>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:12 }}>Generating Cambridge-style questions...</div>
                    </div>
                  ) : (
                    <div style={{ background:'white', border:'1px solid #dddcf0', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden' }}>
                      {examQuestions.map((q, i) => {
                        const dc = q.difficulty==='Hard'?'#c2410c':q.difficulty==='Easy'?'#059669':'#d97706';
                        const db = q.difficulty==='Hard'?'#fff7ed':q.difficulty==='Easy'?'#d1fae5':'#fef3c7';
                        return (
                          <div key={q.id} style={{ borderBottom:'1px solid #dddcf0', padding:'20px 22px' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:500, color:'#4f46e5', background:'#f0eff8', padding:'3px 9px', borderRadius:10, border:'1px solid #dddcf0' }}>Question {i+1}</span>
                                <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", padding:'2px 7px', borderRadius:10, background:db, color:dc, border:`1px solid ${dc}40` }}>{q.difficulty}</span>
                                <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", padding:'2px 7px', borderRadius:4, background:'#fef3c7', color:'#d97706', border:'1px solid #fde68a' }}>{q.topic}</span>
                              </div>
                              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:'#6b6b8a' }}>[{q.marks} marks]</span>
                            </div>
                            <div style={{ fontSize:13.5, lineHeight:1.7, marginBottom:12 }}>{q.question}</div>
                            {q.math_expression && (
                              <div style={{ background:'#f8f9ff', border:'1px solid #e0e3ff', borderRadius:6, padding:'9px 13px', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#3730a3', margin:'8px 0', lineHeight:1.6 }}>{q.math_expression}</div>
                            )}
                            <textarea
                              style={{ width:'100%', minHeight:90, border:'1.5px solid #dddcf0', borderRadius:8, padding:'10px 13px', fontFamily:"'DM Mono',monospace", fontSize:12, color:'#1a1a2e', background:'#f8f8fd', resize:'vertical', outline:'none', lineHeight:1.6 }}
                              placeholder="Write your working here... Show all steps for method marks."
                              value={examAnswers[i] || ''}
                              onChange={e => setExamAnswers(prev => { const n=[...prev]; n[i]=e.target.value; return n; })}
                            />
                            <div style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:'#6b6b8a', marginTop:5 }}>💡 {q.hint}</div>
                          </div>
                        );
                      })}
                      {examSources.length > 0 && (
                        <div style={{ padding:'12px 22px' }}>
                          <SourceCitations sources={examSources} ragUsed={true}/>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ background:'white', borderTop:'1px solid #dddcf0', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:'#6b6b8a' }}>
                      {examQuestions.length > 0 ? `${examQuestions.length} questions · ${examQuestions.reduce((a,q)=>a+q.marks,0)} marks total` : 'Loading...'}
                    </span>
                    <button
                      style={{ background: gradingLoading ? '#dddcf0' : '#059669', color: gradingLoading ? '#6b6b8a' : 'white', border:'none', borderRadius:9, padding:'10px 22px', fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:600, cursor: gradingLoading ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:7 }}
                      onClick={handleSubmitExam} disabled={gradingLoading || examLoading}>
                      {gradingLoading ? ' Grading...' : '✓ Submit & Grade'}
                    </button>
                  </div>
                </div>
              )}
              {/* RESULTS */}
              {examPhase === 'results' && grading && (
                <div style={{ background:'white', border:'1px solid #dddcf0', borderRadius:14, overflow:'hidden' }}>
                  <div style={{ background:'linear-gradient(135deg,#1a1a2e,#2d2d4e)', padding:22, color:'white' }}>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:48, fontWeight:500, lineHeight:1, marginBottom:4, color: gradeColor(grading.cambridgeGrade) }}>
                      {grading.cambridgeGrade}{grading.percentage >= 90 && grading.cambridgeGrade === 'A' ? '*' : ''}
                    </div>
                    <div style={{ fontSize:12, color:'#9090b8', marginBottom:14 }}>{grading.overallFeedback}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                      {[[`${grading.totalMarks}/${grading.totalAvailable}`,'Score'],[`${Math.round(grading.percentage)}%`,'Percentage'],[`${grading.results.filter(r=>r.marksAwarded>0).length}/${grading.results.length}`,'Attempted'],['—','Time Used']].map(([v,l]) => (
                        <div key={l} style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:9, textAlign:'center' }}>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:17, fontWeight:500 }}>{v}</div>
                          <div style={{ fontSize:9, color:'#7070a0', marginTop:2, fontFamily:"'DM Mono',monospace" }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:'18px 20px' }}>
                    {grading.results.map((r, i) => {
                      const q = examQuestions[i];
                      const pct = r.marksAvailable > 0 ? r.marksAwarded / r.marksAvailable : 0;
                      const sc = pct >= 0.8 ? { bg:'#d1fae5', col:'#059669', border:'#6ee7b7' } : pct >= 0.4 ? { bg:'#fef3c7', col:'#d97706', border:'#fde68a' } : { bg:'#fee2e2', col:'#dc2626', border:'#fca5a5' };
                      return (
                        <div key={i} style={{ border:'1px solid #dddcf0', borderRadius:8, padding:'12px 14px', marginBottom:10 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:10, background:sc.bg, color:sc.col, border:`1px solid ${sc.border}` }}>{r.marksAwarded}/{r.marksAvailable} marks</span>
                            <span style={{ fontSize:12, fontWeight:500 }}>Q{i+1}: {q?.topic}</span>
                            {r.mMarks !== undefined && <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", padding:'2px 6px', borderRadius:4, background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe' }}>M: {r.mMarks}/{r.mMarksAvailable}</span>}
                            {r.aMarks !== undefined && <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", padding:'2px 6px', borderRadius:4, background:'#d1fae5', color:'#059669', border:'1px solid #6ee7b7' }}>A: {r.aMarks}/{r.aMarksAvailable}</span>}
                          </div>
                          <div style={{ fontSize:12, color:'#2d2d4e', lineHeight:1.6, background:'#f0eff8', borderRadius:6, padding:'9px 12px', marginBottom:6 }}>{r.feedback}</div>
                          {r.examinerNote && <div style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:'#d97706', background:'#fef3c7', borderRadius:5, padding:'5px 9px' }}>💡 {r.examinerNote}</div>}
                          <div style={{ fontSize:11, fontFamily:"'DM Mono',monospace", color:'#6b6b8a', marginTop:6 }}><strong style={{ color:'#1a1a2e' }}>Model answer:</strong> {r.modelAnswer}</div>
                        </div>
                      );
                    })}
                    {grading.sources?.length > 0 && <SourceCitations sources={grading.sources} ragUsed={grading.ragUsed}/>}
                    {(grading.weakTopics?.length > 0) && (
                      <div style={{ background:'#fff7ed', border:'1px solid #fdba74', borderRadius:8, padding:'10px 14px', marginTop:8 }}>
                        <div style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:'#c2410c', marginBottom:5 }}>WEAK AREAS — PRIORITISE THESE</div>
                        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                          {grading.weakTopics.map(t => <span key={t} style={{ fontSize:11, background:'white', border:'1px solid #fdba74', borderRadius:4, padding:'2px 8px', color:'#c2410c' }}>{t}</span>)}
                        </div>
                      </div>
                    )}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
                      <button style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:9, padding:11, fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:600, cursor:'pointer' }} onClick={() => { setExamPhase('setup'); setGrading(null); }}>← New Exam</button>
                      <button style={{ background:'#1a1a2e', color:'white', border:'none', borderRadius:9, padding:11, fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:600, cursor:'pointer' }} onClick={() => setTab('history')}>📊 View History</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* ── HISTORY TAB ───────────────────────────────────────────── */}
          {tab === 'history' && (
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
              {history.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 20px', color:'#6b6b8a' }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
                  <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>No exam history yet</div>
                  <div style={{ fontSize:12 }}>Complete an exam in Exam Mode tab to see your stats here.</div>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ fontSize:16, fontWeight:600 }}>Exam History & Performance</div>
                    <button style={{ fontSize:11, color:'#dc2626', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}
                      onClick={() => { if(confirm('Clear all history?')){ setHistory([]); localStorage.removeItem('cam_exam_history_v2'); } }}>Clear All</button>
                  </div>
                  {/* Summary stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:18 }}>
                    {[
                      [history.length, 'Exams Taken'],
                      [Math.round(history.reduce((a,h)=>a+h.percentage,0)/history.length) + '%', 'Average Score'],
                      [history.reduce((best,h) => { const o=['A*','A','B','C','U']; return o.indexOf(h.grade)<o.indexOf(best)?h.grade:best; },'U'), 'Best Grade'],
                    ].map(([v,l]) => (
                      <div key={l as string} style={{ background:'white', border:'1px solid #dddcf0', borderRadius:10, padding:12, textAlign:'center' }}>
                        <div style={{ fontSize:22, fontWeight:700, fontFamily:"'DM Mono',monospace", color:'#4f46e5' }}>{v}</div>
                        <div style={{ fontSize:10, color:'#6b6b8a', marginTop:2, fontFamily:"'DM Mono',monospace" }}>{l as string}</div>
                      </div>
                    ))}
                  </div>
                  {/* Topic performance */}
                  {(() => {
                    const topicScores: Record<string,{e:number;a:number}> = {};
                    history.forEach(h => h.results?.forEach((r,i) => {
                      const t = h.questions?.[i]?.topic || 'Unknown';
                      if (!topicScores[t]) topicScores[t]={e:0,a:0};
                      topicScores[t].e += r.marksAwarded||0;
                      topicScores[t].a += r.marksAvailable||1;
                    }));
                    const perf = Object.entries(topicScores).map(([t,s])=>({t,p:Math.round(s.e/s.a*100)})).sort((a,b)=>a.p-b.p);
                    if (!perf.length) return null;
                    return (
                      <div style={{ background:'white', border:'1px solid #dddcf0', borderRadius:10, padding:16, marginBottom:16 }}>
                        <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", color:'#6b6b8a', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:10 }}>Performance by Topic</div>
                        {perf.map(({t,p}) => (
                          <div key={t} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                            <div style={{ fontSize:11, color:'#2d2d4e', width:140, flexShrink:0 }}>{t}</div>
                            <div style={{ flex:1, height:6, background:'#dddcf0', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', borderRadius:3, background: p>=70?'#059669':p>=50?'#d97706':'#dc2626', width:`${p}%` }}/>
                            </div>
                            <div style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:'#6b6b8a', width:35, textAlign:'right' }}>{p}%</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {/* History cards */}
                  {history.map(h => (
                    <div key={h.id} style={{ background:'white', border:'1px solid #dddcf0', borderRadius:10, padding:'14px 16px', marginBottom:10 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:600, color: gradeColor(h.grade) }}>{h.grade}</div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:13, fontWeight:500, fontFamily:"'DM Mono',monospace" }}>{h.percentage}%</div>
                          <div style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:'#6b6b8a' }}>{h.date}</div>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom: h.feedback ? 8 : 0 }}>
                        {[`${h.numQ} questions`,`${h.totalMarks}/${h.totalAvailable} marks`,h.difficulty,...(h.topics||[]).slice(0,2),...(h.topics?.length>2?[`+${h.topics.length-2} more`]:[])].map(tag => (
                          <span key={tag} style={{ fontSize:10, fontFamily:"'DM Mono',monospace", padding:'2px 7px', borderRadius:4, background:'#f0eff8', color:'#6b6b8a', border:'1px solid #dddcf0' }}>{tag}</span>
                        ))}
                      </div>
                      {h.feedback && <div style={{ fontSize:11, color:'#6b6b8a', lineHeight:1.5 }}>{h.feedback}</div>}
                      {h.sources?.length ? <SourceCitations sources={h.sources} ragUsed={true}/> : null}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes blink { 0%,100%{opacity:.25} 50%{opacity:1} }
        @keyframes spin  { to{transform:rotate(360deg)} }
        button:hover { opacity: .9; }
      `}</style>
    </div>
  );
}