'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// 型定義
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
  createdAt?: Date;
  updatedAt?: Date;
}

// プリセットカラー
const PRESET_COLORS = [
  { name: 'Red', color: '#FF0000' },
  { name: 'Orange', color: '#FF8800' },
  { name: 'Yellow', color: '#FFFF00' },
  { name: 'Lime', color: '#00FF00' },
  { name: 'Cyan', color: '#00F5FF' },
  { name: 'Blue', color: '#0088FF' },
  { name: 'Purple', color: '#8800FF' },
  { name: 'Pink', color: '#FF00AA' },
  { name: 'White', color: '#FFFFFF' },
];

// エフェクト一覧
const EFFECTS: { name: string; type: EffectType; icon: string }[] = [
  { name: 'Slow Flash', type: 'slow-flash', icon: '💫' },
  { name: 'Fast Flash', type: 'fast-flash', icon: '⚡' },
  { name: 'Strobe', type: 'strobe', icon: '🔥' },
  { name: 'Fade', type: 'fade', icon: '🌊' },
  { name: 'Rainbow', type: 'rainbow', icon: '🌈' },
];

// 時間をフォーマット（mm:ss.ms）
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds}`;
};

// 時間文字列をミリ秒に変換
const parseTime = (timeStr: string): number => {
  const match = timeStr.match(/^(\d+):(\d{2})(?:\.(\d))?$/);
  if (!match) return 0;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const tenths = match[3] ? parseInt(match[3], 10) : 0;
  return (minutes * 60 + seconds) * 1000 + tenths * 100;
};

export default function AdminPage() {
  const router = useRouter();
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

  // プログラム編集
  const [showProgramEditor, setShowProgramEditor] = useState(false);
  const [program, setProgram] = useState<Program>({
    id: uuidv4(),
    name: 'プログラム',
    segments: [],
    totalDuration: 0,
  });
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [editingSegment, setEditingSegment] = useState<ProgramSegment | null>(null);

  // プレビュー用
  const [previewTime, setPreviewTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const eventUrl = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/event/${sessionId}`
    : '';

  // イベント作成
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

      // 既存のプログラムを読み込み
      const programResponse = await fetch(`${API_URL}/api/sessions/${data.sessionId}/program`);
      const programData = await programResponse.json();
      if (programData.program) {
        setProgram(programData.program);
      }

      // WebSocket接続
      const newSocket = io(API_URL, {
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        newSocket.emit('join-session', { sessionId: data.sessionId, isAdmin: true });
      });

      newSocket.on('user-count', (data: { count: number }) => {
        setConnectedUsers(data.count);
      });

      newSocket.on('sync-state', (data: {
        mode: SessionMode;
        color: string;
        effect: EffectType;
        isProgramRunning: boolean;
      }) => {
        setMode(data.mode);
        setCurrentColor(data.color);
        setCurrentEffect(data.effect);
        setIsProgramRunning(data.isProgramRunning);
      });

      newSocket.on('mode-change', (data: { mode: SessionMode }) => {
        setMode(data.mode);
      });

      newSocket.on('program-start', () => {
        setIsProgramRunning(true);
      });

      newSocket.on('program-stop', () => {
        setIsProgramRunning(false);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('イベント作成エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 色変更
  const changeColor = (color: string, effect: EffectType = 'none') => {
    if (!socket || !sessionId || isProgramRunning) return;
    setCurrentColor(color);
    setCurrentEffect(effect);
    socket.emit('change-color', { sessionId, color, effect });
  };

  // エフェクトトリガー
  const triggerEffect = (effectType: EffectType) => {
    if (!socket || !sessionId || isProgramRunning) return;
    setCurrentEffect(effectType);
    socket.emit('trigger-effect', { sessionId, effectType });
  };

  // モード切替
  const changeMode = (newMode: SessionMode) => {
    if (!socket || !sessionId || isProgramRunning) return;
    socket.emit('change-mode', { sessionId, mode: newMode });
    setMode(newMode);
  };

  // プログラム開始
  const startProgram = () => {
    if (!socket || !sessionId || program.segments.length === 0) return;
    socket.emit('start-program', { sessionId });
  };

  // プログラム停止
  const stopProgram = () => {
    if (!socket || !sessionId) return;
    socket.emit('stop-program', { sessionId });
  };

  // プログラム保存
  const saveProgram = async () => {
    if (!sessionId) return;
    try {
      await fetch(`${API_URL}/api/sessions/${sessionId}/program`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program }),
      });
    } catch (error) {
      console.error('プログラム保存エラー:', error);
    }
  };

  // セグメント追加
  const addSegment = () => {
    const lastSegment = program.segments[program.segments.length - 1];
    const startTime = lastSegment ? lastSegment.endTime : 0;
    const endTime = startTime + 5000;

    const newSegment: ProgramSegment = {
      id: uuidv4(),
      startTime,
      endTime,
      color: '#FF0000',
      effect: 'none',
    };

    const newSegments = [...program.segments, newSegment];
    const totalDuration = Math.max(...newSegments.map(s => s.endTime));

    setProgram({ ...program, segments: newSegments, totalDuration });
    setSelectedSegmentId(newSegment.id);
    setEditingSegment(newSegment);
  };

  // セグメント更新
  const updateSegment = (updatedSegment: ProgramSegment) => {
    const newSegments = program.segments.map(s =>
      s.id === updatedSegment.id ? updatedSegment : s
    );
    const totalDuration = Math.max(...newSegments.map(s => s.endTime));
    setProgram({ ...program, segments: newSegments, totalDuration });
    setEditingSegment(updatedSegment);
  };

  // セグメント削除
  const deleteSegment = (segmentId: string) => {
    const newSegments = program.segments.filter(s => s.id !== segmentId);
    const totalDuration = newSegments.length > 0 ? Math.max(...newSegments.map(s => s.endTime)) : 0;
    setProgram({ ...program, segments: newSegments, totalDuration });
    if (selectedSegmentId === segmentId) {
      setSelectedSegmentId(null);
      setEditingSegment(null);
    }
  };

  // プレビュー再生/停止
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

  // プレビュー用の現在色取得
  const getPreviewColor = (): string => {
    for (const segment of program.segments) {
      if (previewTime >= segment.startTime && previewTime < segment.endTime) {
        return segment.color;
      }
    }
    return '#FFFFFF';
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [socket]);

  // イベント作成画面
  if (!isCreated) {
    return (
      <div className="min-h-screen relative overflow-hidden noise-overlay">
        {/* 背景 */}
        <div className="fixed inset-0 bg-[#050508]">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full animate-pulse-glow"
            style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.12) 0%, transparent 70%)' }}
          />
          <div
            className="absolute top-1/4 right-1/3 w-[400px] h-[400px] rounded-full animate-pulse-glow"
            style={{ background: 'radial-gradient(circle, rgba(255,0,170,0.1) 0%, transparent 70%)', animationDelay: '2s' }}
          />
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
          <div className={`max-w-md w-full ${mounted ? 'animate-scale-in' : 'opacity-0'}`}>
            {/* 戻るボタン */}
            <button
              onClick={() => router.push('/')}
              className={`mb-8 flex items-center gap-2 text-white/40 hover:text-[#00f5ff] transition-colors ${mounted ? 'animate-slide-up' : 'opacity-0'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">ホームに戻る</span>
            </button>

            {/* ヘッダー */}
            <div className={`text-center mb-10 ${mounted ? 'animate-slide-up delay-100' : 'opacity-0'}`}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00f5ff]/20 to-[#ff00aa]/20 border border-[#00f5ff]/30 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#00f5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">イベントを作成</h1>
              <p className="text-white/40">参加者がスマホで接続できるイベントを作成</p>
            </div>

            {/* 入力カード */}
            <div className={`glass-strong rounded-3xl p-8 ${mounted ? 'animate-slide-up delay-200' : 'opacity-0'}`}>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-3">
                    イベント名
                  </label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createEvent()}
                    placeholder="例: Summer Festival 2025"
                    className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-lg focus:border-[#00f5ff]/50 focus:ring-2 focus:ring-[#00f5ff]/20 outline-none transition-all"
                  />
                </div>

                <button
                  onClick={createEvent}
                  disabled={!eventName.trim() || isLoading}
                  className="group relative w-full overflow-hidden rounded-xl p-[1px] transition-all duration-500 hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00f5ff] to-[#ff00aa] opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="relative flex items-center justify-center gap-3 bg-[#0a0a0f] rounded-xl px-8 py-4 transition-all group-hover:bg-[#0a0a0f]/80">
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="font-semibold text-lg text-white">イベントを作成</span>
                      </>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* 機能紹介 */}
            <div className={`mt-10 grid grid-cols-3 gap-4 ${mounted ? 'animate-slide-up delay-300' : 'opacity-0'}`}>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-[#ff0000]/10 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-[#ff0000]" />
                </div>
                <p className="text-xs text-white/40">カラー制御</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-[#00f5ff]/10 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#00f5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-xs text-white/40">エフェクト</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs text-white/40">プログラム</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // プログラムエディタ
  if (showProgramEditor) {
    return (
      <div className="min-h-screen bg-[#050508] text-white p-4 noise-overlay">
        <div className="max-w-6xl mx-auto">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setShowProgramEditor(false)}
              className="flex items-center gap-2 text-white/40 hover:text-[#00f5ff] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              管理画面に戻る
            </button>
            <h1 className="text-xl font-bold text-gradient-neon">Program Editor</h1>
            <button
              onClick={saveProgram}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00f5ff] to-[#8b5cf6] text-[#050508] font-semibold hover:opacity-90 transition"
            >
              保存
            </button>
          </div>

          {/* プレビュー */}
          <div className="glass rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-6 mb-4">
              <button
                onClick={togglePreview}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#ff00aa] font-semibold transition hover:opacity-90"
              >
                {isPreviewPlaying ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                    Pause
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Preview
                  </>
                )}
              </button>
              <div className="font-mono text-lg text-white/60">
                <span className="text-white">{formatTime(previewTime)}</span>
                <span className="mx-2">/</span>
                {formatTime(program.totalDuration)}
              </div>
              <div
                className="w-14 h-14 rounded-xl border border-white/20 shadow-lg"
                style={{ backgroundColor: getPreviewColor(), boxShadow: `0 0 30px ${getPreviewColor()}40` }}
              />
            </div>

            {/* プログレスバー */}
            <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-[#00f5ff] to-[#ff00aa] rounded-full transition-all"
                style={{ width: `${(previewTime / Math.max(program.totalDuration, 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* タイムライン */}
          <div className="glass rounded-2xl p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white/80">Timeline</h2>
              <button
                onClick={addSegment}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#00f5ff]/30 text-[#00f5ff] hover:bg-[#00f5ff]/10 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Segment
              </button>
            </div>

            {/* タイムラインビジュアル */}
            <div className="relative h-20 bg-white/5 rounded-xl overflow-hidden mb-4 border border-white/10">
              {program.segments.map((segment) => {
                const left = (segment.startTime / Math.max(program.totalDuration, 1)) * 100;
                const width = ((segment.endTime - segment.startTime) / Math.max(program.totalDuration, 1)) * 100;

                return (
                  <div
                    key={segment.id}
                    onClick={() => {
                      setSelectedSegmentId(segment.id);
                      setEditingSegment(segment);
                    }}
                    className={`absolute h-full cursor-pointer transition-all ${
                      selectedSegmentId === segment.id ? 'ring-2 ring-white' : 'hover:brightness-110'
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: segment.color,
                    }}
                  >
                    <div className="absolute bottom-1 left-1 text-xs text-white/80 bg-black/50 px-1.5 py-0.5 rounded font-mono">
                      {formatTime(segment.startTime)}
                    </div>
                  </div>
                );
              })}

              {isPreviewPlaying && (
                <div
                  className="absolute w-0.5 h-full bg-white shadow-lg"
                  style={{ left: `${(previewTime / Math.max(program.totalDuration, 1)) * 100}%` }}
                />
              )}
            </div>

            {/* セグメントリスト */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {program.segments.length === 0 ? (
                <p className="text-white/30 text-center py-8">
                  No segments. Click "Add Segment" to create one.
                </p>
              ) : (
                program.segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    onClick={() => {
                      setSelectedSegmentId(segment.id);
                      setEditingSegment(segment);
                    }}
                    className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition ${
                      selectedSegmentId === segment.id ? 'bg-[#8b5cf6]/20 border border-[#8b5cf6]/30' : 'bg-white/5 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    <span className="text-white/30 w-8 font-mono text-sm">#{index + 1}</span>
                    <div
                      className="w-8 h-8 rounded-lg border border-white/20"
                      style={{ backgroundColor: segment.color }}
                    />
                    <div className="flex-1 font-mono text-sm">
                      {formatTime(segment.startTime)} → {formatTime(segment.endTime)}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSegment(segment.id);
                      }}
                      className="text-white/30 hover:text-[#ff00aa] transition p-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* セグメント編集パネル */}
          {editingSegment && (
            <div className="glass rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white/80 mb-4">Edit Segment</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/40 mb-2">Start Time</label>
                  <input
                    type="text"
                    value={formatTime(editingSegment.startTime)}
                    onChange={(e) => updateSegment({ ...editingSegment, startTime: parseTime(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl font-mono focus:border-[#00f5ff]/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/40 mb-2">End Time</label>
                  <input
                    type="text"
                    value={formatTime(editingSegment.endTime)}
                    onChange={(e) => updateSegment({ ...editingSegment, endTime: parseTime(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl font-mono focus:border-[#00f5ff]/50 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-white/40 mb-2">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((preset) => (
                      <button
                        key={preset.color}
                        onClick={() => updateSegment({ ...editingSegment, color: preset.color })}
                        className={`w-10 h-10 rounded-lg transition ${
                          editingSegment.color === preset.color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset.color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={editingSegment.color}
                      onChange={(e) => updateSegment({ ...editingSegment, color: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer border-2 border-white/20"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-white/40 mb-2">Effect</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => updateSegment({ ...editingSegment, effect: 'none' })}
                      className={`px-4 py-3 rounded-xl text-sm transition ${
                        editingSegment.effect === 'none' ? 'bg-[#00f5ff] text-[#050508]' : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      None
                    </button>
                    {EFFECTS.map((effect) => (
                      <button
                        key={effect.type}
                        onClick={() => updateSegment({ ...editingSegment, effect: effect.type })}
                        className={`px-4 py-3 rounded-xl text-sm transition ${
                          editingSegment.effect === effect.type ? 'bg-[#00f5ff] text-[#050508]' : 'bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        {effect.icon} {effect.name}
                      </button>
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
    <div className="min-h-screen bg-[#050508] p-4 noise-overlay">
      {/* 背景 */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.08) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(255,0,170,0.06) 0%, transparent 70%)', animationDelay: '2s' }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00f5ff] to-[#8b5cf6] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#050508]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{eventName}</h1>
                <p className="text-white/40 text-sm">Control Panel</p>
              </div>
            </div>
            <div className="glass-strong rounded-xl px-6 py-3">
              <p className="text-[#00f5ff] text-xs uppercase tracking-wider mb-1">Connected</p>
              <p className="text-4xl font-bold text-white">{connectedUsers}</p>
            </div>
          </div>
        </div>

        {/* グリッド */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* QRコード */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">QR Code</h2>
            <div className="qr-container mx-auto w-fit mb-4">
              {eventUrl && <QRCodeSVG value={eventUrl} size={160} level="H" />}
            </div>
            <p className="text-xs text-white/30 text-center break-all font-mono bg-white/5 rounded-lg p-2">
              {eventUrl}
            </p>
          </div>

          {/* 現在の色 */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Current Color</h2>
            <div
              className="w-full h-32 rounded-xl mb-4 border border-white/10 transition-colors"
              style={{ backgroundColor: currentColor, boxShadow: `0 0 40px ${currentColor}30` }}
            />
            <div className="flex justify-between items-center">
              <span className="font-mono text-sm text-white/60 bg-white/5 px-3 py-1 rounded-lg">{currentColor}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                mode === 'program'
                  ? 'bg-[#8b5cf6]/20 text-[#8b5cf6] border border-[#8b5cf6]/30'
                  : 'bg-[#00f5ff]/20 text-[#00f5ff] border border-[#00f5ff]/30'
              }`}>
                {mode === 'program' ? 'PROGRAM' : 'MANUAL'}
              </span>
            </div>
          </div>

          {/* モード切替 */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4">Mode</h2>
            <div className="space-y-3">
              <button
                onClick={() => changeMode('manual')}
                disabled={isProgramRunning}
                className={`w-full py-4 px-6 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
                  mode === 'manual'
                    ? 'bg-gradient-to-r from-[#00f5ff] to-[#8b5cf6] text-[#050508]'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                } ${isProgramRunning ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                </svg>
                Manual
              </button>
              <button
                onClick={() => changeMode('program')}
                disabled={isProgramRunning}
                className={`w-full py-4 px-6 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
                  mode === 'program'
                    ? 'bg-gradient-to-r from-[#8b5cf6] to-[#ff00aa] text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                } ${isProgramRunning ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Program
              </button>
            </div>
          </div>
        </div>

        {/* プログラム制御 */}
        {mode === 'program' && (
          <div className="glass rounded-2xl p-6 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <button
                onClick={() => setShowProgramEditor(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-white hover:bg-white/5 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Program
              </button>

              {isProgramRunning ? (
                <button
                  onClick={stopProgram}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#ff0000] to-[#ff00aa] text-white font-semibold transition hover:opacity-90"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop
                </button>
              ) : (
                <button
                  onClick={startProgram}
                  disabled={program.segments.length === 0}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00ff88] to-[#00f5ff] text-[#050508] font-semibold transition hover:opacity-90 disabled:opacity-40"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Start
                </button>
              )}

              <div className="text-white/40 font-mono text-sm bg-white/5 px-4 py-2 rounded-lg">
                {program.segments.length} segments • {formatTime(program.totalDuration)}
              </div>
            </div>
          </div>
        )}

        {/* 手動モード：カラーコントロール */}
        {mode === 'manual' && (
          <div className="glass rounded-2xl p-6">
            {/* プリセットカラー */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-4">Colors</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.color}
                    onClick={() => changeColor(preset.color)}
                    disabled={isProgramRunning}
                    className={`group flex flex-col items-center p-3 rounded-xl transition disabled:opacity-40 ${
                      currentColor === preset.color
                        ? 'bg-white/10 ring-2 ring-[#00f5ff]'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div
                      className="w-12 h-12 rounded-xl mb-2 border border-white/20 group-hover:scale-105 transition"
                      style={{ backgroundColor: preset.color, boxShadow: currentColor === preset.color ? `0 0 20px ${preset.color}60` : undefined }}
                    />
                    <span className="text-xs text-white/50">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* カスタムカラー */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-4">Custom</h3>
              <div className="flex gap-6 items-center bg-white/5 rounded-xl p-4">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => changeColor(e.target.value)}
                  disabled={isProgramRunning}
                  className="w-20 h-20 rounded-xl cursor-pointer disabled:opacity-40 border-2 border-white/20"
                />
                <div>
                  <p className="text-sm text-white/40 mb-1">Pick any color</p>
                  <p className="font-mono text-2xl font-bold text-white">{currentColor}</p>
                </div>
              </div>
            </div>

            {/* エフェクト */}
            <div>
              <h3 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-4">Effects</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {EFFECTS.map((effect) => (
                  <button
                    key={effect.type}
                    onClick={() => triggerEffect(effect.type)}
                    disabled={isProgramRunning}
                    className={`py-4 px-4 rounded-xl font-medium transition disabled:opacity-40 ${
                      currentEffect === effect.type
                        ? 'bg-gradient-to-r from-[#ff6b00] to-[#ff00aa] text-white'
                        : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="text-xl mb-1">{effect.icon}</div>
                    <div className="text-sm">{effect.name}</div>
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
