'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type EffectType = 'none' | 'slow-flash' | 'fast-flash' | 'strobe' | 'fade' | 'rainbow';
type SessionMode = 'manual' | 'program';

interface ProgramSegment {
  id: string;
  startTime: number;
  endTime: number;
  color: string;
  effect: EffectType;
}

interface Program {
  id: string;
  name: string;
  segments: ProgramSegment[];
  totalDuration: number;
}

const PRESET_COLORS = [
  '#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#00F5FF',
  '#0088FF', '#8800FF', '#FF00AA', '#FFFFFF', '#000000',
];

const EFFECTS: { name: string; type: EffectType }[] = [
  { name: 'Slow Flash', type: 'slow-flash' },
  { name: 'Fast Flash', type: 'fast-flash' },
  { name: 'Strobe', type: 'strobe' },
  { name: 'Fade', type: 'fade' },
  { name: 'Rainbow', type: 'rainbow' },
];

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const parseTime = (timeStr: string): number => {
  const match = timeStr.match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  return (parseInt(match[1], 10) * 60 + parseInt(match[2], 10)) * 1000;
};

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [eventName, setEventName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [currentColor, setCurrentColor] = useState('#FFFFFF');
  const [currentEffect, setCurrentEffect] = useState<EffectType>('none');
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isCreated, setIsCreated] = useState(false);
  const [mode, setMode] = useState<SessionMode>('manual');
  const [isProgramRunning, setIsProgramRunning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [showProgramEditor, setShowProgramEditor] = useState(false);
  const [program, setProgram] = useState<Program>({
    id: uuidv4(),
    name: 'プログラム',
    segments: [],
    totalDuration: 0,
  });
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [editingSegment, setEditingSegment] = useState<ProgramSegment | null>(null);

  const [previewTime, setPreviewTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);

    // URLパラメータからセッションIDを取得
    const existingSessionId = searchParams.get('session');
    if (existingSessionId) {
      loadExistingSession(existingSessionId);
    }
  }, [searchParams]);

  // 既存セッションを読み込む
  const loadExistingSession = async (id: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/sessions/${id}`);
      if (!response.ok) {
        throw new Error('Session not found');
      }
      const data = await response.json();
      const session = data.session;

      setSessionId(id);
      setEventName(session.name);
      setCurrentColor(session.color || '#FFFFFF');
      setCurrentEffect(session.effect || 'none');
      setMode(session.mode || 'manual');
      setIsProgramRunning(session.isProgramRunning || false);
      setIsCreated(true);

      if (session.program) {
        setProgram(session.program);
      }

      // WebSocket接続
      const newSocket = io(API_URL, { transports: ['websocket', 'polling'] });

      newSocket.on('connect', () => {
        newSocket.emit('join-session', { sessionId: id, isAdmin: true });
      });

      newSocket.on('user-count', (d: { count: number }) => setConnectedUsers(d.count));
      newSocket.on('sync-state', (d: { mode: SessionMode; color: string; effect: EffectType; isProgramRunning: boolean }) => {
        setMode(d.mode);
        setCurrentColor(d.color);
        setCurrentEffect(d.effect);
        setIsProgramRunning(d.isProgramRunning);
      });
      newSocket.on('mode-change', (d: { mode: SessionMode }) => setMode(d.mode));
      newSocket.on('program-start', () => setIsProgramRunning(true));
      newSocket.on('program-stop', () => setIsProgramRunning(false));

      setSocket(newSocket);
    } catch (error) {
      console.error('セッション読み込みエラー:', error);
      alert('セッションが見つかりませんでした');
      router.push('/events');
    } finally {
      setIsLoading(false);
    }
  };

  const eventUrl = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/event/${sessionId}`
    : '';

  const createEvent = async () => {
    if (!eventName.trim()) return;
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: eventName }),
      });

      const data = await response.json();
      setSessionId(data.sessionId);
      setIsCreated(true);

      const programResponse = await fetch(`${API_URL}/api/sessions/${data.sessionId}/program`);
      const programData = await programResponse.json();
      if (programData.program) {
        setProgram(programData.program);
      }

      const newSocket = io(API_URL, { transports: ['websocket', 'polling'] });

      newSocket.on('connect', () => {
        newSocket.emit('join-session', { sessionId: data.sessionId, isAdmin: true });
      });

      newSocket.on('user-count', (d: { count: number }) => setConnectedUsers(d.count));
      newSocket.on('sync-state', (d: { mode: SessionMode; color: string; effect: EffectType; isProgramRunning: boolean }) => {
        setMode(d.mode);
        setCurrentColor(d.color);
        setCurrentEffect(d.effect);
        setIsProgramRunning(d.isProgramRunning);
      });
      newSocket.on('mode-change', (d: { mode: SessionMode }) => setMode(d.mode));
      newSocket.on('program-start', () => setIsProgramRunning(true));
      newSocket.on('program-stop', () => setIsProgramRunning(false));

      setSocket(newSocket);
    } catch (error) {
      console.error('イベント作成エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const changeColor = (color: string, effect: EffectType = 'none') => {
    if (!socket || !sessionId || isProgramRunning) return;
    setCurrentColor(color);
    setCurrentEffect(effect);
    socket.emit('change-color', { sessionId, color, effect });
  };

  const triggerEffect = (effectType: EffectType) => {
    if (!socket || !sessionId || isProgramRunning) return;
    setCurrentEffect(effectType);
    socket.emit('trigger-effect', { sessionId, effectType });
  };

  const changeMode = (newMode: SessionMode) => {
    if (!socket || !sessionId || isProgramRunning) return;
    socket.emit('change-mode', { sessionId, mode: newMode });
    setMode(newMode);
  };

  const startProgram = () => {
    if (!socket || !sessionId || program.segments.length === 0) return;
    socket.emit('start-program', { sessionId });
  };

  const stopProgram = () => {
    if (!socket || !sessionId) return;
    socket.emit('stop-program', { sessionId });
  };

  const saveProgram = async () => {
    if (!sessionId) return;
    await fetch(`${API_URL}/api/sessions/${sessionId}/program`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program }),
    });
  };

  const addSegment = () => {
    const lastSegment = program.segments[program.segments.length - 1];
    const startTime = lastSegment ? lastSegment.endTime : 0;
    const newSegment: ProgramSegment = {
      id: uuidv4(),
      startTime,
      endTime: startTime + 5000,
      color: '#FF0000',
      effect: 'none',
    };
    const newSegments = [...program.segments, newSegment];
    setProgram({ ...program, segments: newSegments, totalDuration: Math.max(...newSegments.map(s => s.endTime)) });
    setSelectedSegmentId(newSegment.id);
    setEditingSegment(newSegment);
  };

  const updateSegment = (updated: ProgramSegment) => {
    const newSegments = program.segments.map(s => s.id === updated.id ? updated : s);
    setProgram({ ...program, segments: newSegments, totalDuration: Math.max(...newSegments.map(s => s.endTime)) });
    setEditingSegment(updated);
  };

  const deleteSegment = (id: string) => {
    const newSegments = program.segments.filter(s => s.id !== id);
    setProgram({ ...program, segments: newSegments, totalDuration: newSegments.length > 0 ? Math.max(...newSegments.map(s => s.endTime)) : 0 });
    if (selectedSegmentId === id) {
      setSelectedSegmentId(null);
      setEditingSegment(null);
    }
  };

  const togglePreview = () => {
    if (isPreviewPlaying) {
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
      setIsPreviewPlaying(false);
    } else {
      setIsPreviewPlaying(true);
      previewIntervalRef.current = setInterval(() => {
        setPreviewTime(prev => {
          const next = prev + 100;
          if (next >= program.totalDuration) {
            if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
            setIsPreviewPlaying(false);
            return 0;
          }
          return next;
        });
      }, 100);
    }
  };

  const getPreviewColor = (): string => {
    for (const segment of program.segments) {
      if (previewTime >= segment.startTime && previewTime < segment.endTime) {
        return segment.color;
      }
    }
    return '#FFFFFF';
  };

  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [socket]);

  // イベント作成画面
  if (!isCreated) {
    return (
      <div className="min-h-screen relative overflow-hidden grain-overlay">
        <div className="fixed inset-0 bg-[var(--bg-primary)]">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20"
            style={{ background: 'radial-gradient(circle at center, rgba(245, 158, 11, 0.2) 0%, transparent 60%)' }}
          />
        </div>

        <div className="relative z-10 min-h-screen flex flex-col px-6 safe-area-top safe-area-bottom">
          <header className="py-6">
            <button onClick={() => router.push('/')} className="btn btn-ghost">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>戻る</span>
            </button>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center pb-12">
            <div className="container-app">
              <div className={`text-center mb-10 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
                <h1 className="font-display text-3xl font-bold mb-3">イベントを作成</h1>
                <p className="text-[var(--text-secondary)]">参加者のスマホをライトにするイベントを作成</p>
              </div>

              <div className={`${mounted ? 'animate-slide-up delay-100' : 'opacity-0'}`}>
                <div className="card-elevated p-6">
                  <div className="space-y-5">
                    <label className="input-label">イベント名</label>
                    <input
                      type="text"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createEvent()}
                      placeholder="例: Summer Festival 2025"
                      className="input"
                      style={{ textAlign: 'left', letterSpacing: 'normal' }}
                    />
                    <button
                      onClick={createEvent}
                      disabled={!eventName.trim() || isLoading}
                      className="btn btn-primary btn-lg btn-full disabled:opacity-40"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>作成する</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // プログラムエディタ
  if (showProgramEditor) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] p-4 safe-area-top safe-area-bottom">
        <div className="container-wide">
          <header className="flex justify-between items-center mb-6">
            <button onClick={() => setShowProgramEditor(false)} className="btn btn-ghost">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>戻る</span>
            </button>
            <h1 className="font-display text-xl font-bold">Program Editor</h1>
            <button onClick={saveProgram} className="btn btn-primary">保存</button>
          </header>

          {/* プレビュー */}
          <div className="card-elevated p-6 mb-6">
            <div className="flex items-center gap-6 mb-4">
              <button onClick={togglePreview} className="btn btn-primary">
                {isPreviewPlaying ? 'Pause' : 'Preview'}
              </button>
              <div className="font-mono text-lg text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">{formatTime(previewTime)}</span>
                <span className="mx-2">/</span>
                {formatTime(program.totalDuration)}
              </div>
              <div
                className="w-14 h-14 rounded-xl"
                style={{ backgroundColor: getPreviewColor(), boxShadow: `0 0 30px ${getPreviewColor()}40` }}
              />
            </div>
            <div className="relative h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-[var(--accent-primary)] rounded-full transition-all"
                style={{ width: `${(previewTime / Math.max(program.totalDuration, 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* タイムライン */}
          <div className="card-elevated p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-display font-semibold">Timeline</h2>
              <button onClick={addSegment} className="btn btn-secondary">+ Add Segment</button>
            </div>

            <div className="relative h-20 bg-[var(--bg-tertiary)] rounded-xl overflow-hidden mb-4">
              {program.segments.map((segment) => {
                const left = (segment.startTime / Math.max(program.totalDuration, 1)) * 100;
                const width = ((segment.endTime - segment.startTime) / Math.max(program.totalDuration, 1)) * 100;
                return (
                  <div
                    key={segment.id}
                    onClick={() => { setSelectedSegmentId(segment.id); setEditingSegment(segment); }}
                    className={`absolute h-full cursor-pointer ${selectedSegmentId === segment.id ? 'ring-2 ring-white' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: segment.color }}
                  />
                );
              })}
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {program.segments.length === 0 ? (
                <p className="text-[var(--text-muted)] text-center py-8">セグメントがありません</p>
              ) : (
                program.segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    onClick={() => { setSelectedSegmentId(segment.id); setEditingSegment(segment); }}
                    className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition ${
                      selectedSegmentId === segment.id ? 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30' : 'bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <span className="text-[var(--text-muted)] w-8 font-mono text-sm">#{index + 1}</span>
                    <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: segment.color }} />
                    <div className="flex-1 font-mono text-sm">{formatTime(segment.startTime)} → {formatTime(segment.endTime)}</div>
                    <button onClick={(e) => { e.stopPropagation(); deleteSegment(segment.id); }} className="btn btn-ghost btn-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* セグメント編集 */}
          {editingSegment && (
            <div className="card-elevated p-6">
              <h2 className="font-display font-semibold mb-4">Edit Segment</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Start</label>
                  <input
                    type="text"
                    value={formatTime(editingSegment.startTime)}
                    onChange={(e) => updateSegment({ ...editingSegment, startTime: parseTime(e.target.value) })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="input-label">End</label>
                  <input
                    type="text"
                    value={formatTime(editingSegment.endTime)}
                    onChange={(e) => updateSegment({ ...editingSegment, endTime: parseTime(e.target.value) })}
                    className="input"
                  />
                </div>
                <div className="col-span-2">
                  <label className="input-label">Color</label>
                  <div className="color-grid">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => updateSegment({ ...editingSegment, color })}
                        className={`color-swatch ${editingSegment.color === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // メイン管理画面
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4 safe-area-top safe-area-bottom">
      <div className="container-wide">
        {/* ヘッダー */}
        <header className="card-elevated p-5 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-tertiary)] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[var(--bg-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h1 className="font-display text-xl font-bold">{eventName}</h1>
                <p className="text-sm text-[var(--text-muted)]">Control Panel</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--accent-primary)] uppercase tracking-wider mb-1">Connected</p>
              <p className="text-3xl font-bold font-display">{connectedUsers}</p>
            </div>
          </div>
        </header>

        {/* グリッド */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* QRコード */}
          <div className="card-elevated p-6">
            <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">QR Code</h2>
            <div className="qr-container mx-auto w-fit mb-4">
              {eventUrl && <QRCodeSVG value={eventUrl} size={160} level="H" />}
            </div>
            <p className="text-xs text-[var(--text-muted)] text-center break-all font-mono bg-[var(--bg-tertiary)] rounded-lg p-2">
              {eventUrl}
            </p>
          </div>

          {/* 現在の色 */}
          <div className="card-elevated p-6">
            <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Current</h2>
            <div
              className="w-full h-32 rounded-xl mb-4"
              style={{ backgroundColor: currentColor, boxShadow: `0 0 40px ${currentColor}30` }}
            />
            <div className="flex justify-between items-center">
              <span className="font-mono text-sm bg-[var(--bg-tertiary)] px-3 py-1 rounded-lg">{currentColor}</span>
              <span className={`badge ${mode === 'program' ? 'badge-warning' : 'badge-success'}`}>
                {mode === 'program' ? 'PROGRAM' : 'MANUAL'}
              </span>
            </div>
          </div>

          {/* モード */}
          <div className="card-elevated p-6">
            <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Mode</h2>
            <div className="space-y-3">
              <button
                onClick={() => changeMode('manual')}
                disabled={isProgramRunning}
                className={`btn btn-full ${mode === 'manual' ? 'btn-primary' : 'btn-secondary'} disabled:opacity-40`}
              >
                Manual
              </button>
              <button
                onClick={() => changeMode('program')}
                disabled={isProgramRunning}
                className={`btn btn-full ${mode === 'program' ? 'btn-primary' : 'btn-secondary'} disabled:opacity-40`}
              >
                Program
              </button>
            </div>
          </div>
        </div>

        {/* プログラム制御 */}
        {mode === 'program' && (
          <div className="card-elevated p-6 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <button onClick={() => setShowProgramEditor(true)} className="btn btn-secondary">Edit Program</button>
              {isProgramRunning ? (
                <button onClick={stopProgram} className="btn btn-primary" style={{ background: 'var(--error)' }}>Stop</button>
              ) : (
                <button onClick={startProgram} disabled={program.segments.length === 0} className="btn btn-primary disabled:opacity-40">Start</button>
              )}
              <span className="text-[var(--text-muted)] font-mono text-sm">
                {program.segments.length} segments • {formatTime(program.totalDuration)}
              </span>
            </div>
          </div>
        )}

        {/* 手動モード */}
        {mode === 'manual' && (
          <div className="card-elevated p-6">
            {/* カラー */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Colors</h3>
              <div className="color-grid">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => changeColor(color)}
                    disabled={isProgramRunning}
                    className={`color-swatch ${currentColor === color ? 'active' : ''} disabled:opacity-40`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* カスタムカラー */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Custom</h3>
              <div className="flex gap-6 items-center bg-[var(--bg-tertiary)] rounded-xl p-4">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => changeColor(e.target.value)}
                  disabled={isProgramRunning}
                  className="w-16 h-16 rounded-xl cursor-pointer disabled:opacity-40"
                />
                <div>
                  <p className="text-sm text-[var(--text-muted)] mb-1">Pick any color</p>
                  <p className="font-mono text-2xl font-bold">{currentColor}</p>
                </div>
              </div>
            </div>

            {/* エフェクト */}
            <div>
              <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider mb-4">Effects</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {EFFECTS.map((effect) => (
                  <button
                    key={effect.type}
                    onClick={() => triggerEffect(effect.type)}
                    disabled={isProgramRunning}
                    className={`btn ${currentEffect === effect.type ? 'btn-primary' : 'btn-secondary'} disabled:opacity-40`}
                  >
                    {effect.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-secondary)]">読み込み中...</div>}>
      <AdminPageContent />
    </Suspense>
  );
}
