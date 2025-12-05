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
  { name: '赤', color: '#FF0000' },
  { name: 'オレンジ', color: '#FF8800' },
  { name: '黄', color: '#FFFF00' },
  { name: '緑', color: '#00FF00' },
  { name: '青', color: '#0088FF' },
  { name: '紫', color: '#8800FF' },
  { name: 'ピンク', color: '#FF00FF' },
  { name: '白', color: '#FFFFFF' },
  { name: '黒', color: '#000000' },
];

// エフェクト一覧
const EFFECTS: { name: string; type: EffectType; description: string }[] = [
  { name: '通常', type: 'none', description: '単色表示' },
  { name: 'ゆっくり点滅', type: 'slow-flash', description: '1秒間隔' },
  { name: '速く点滅', type: 'fast-flash', description: '0.2秒間隔' },
  { name: 'ストロボ', type: 'strobe', description: '超高速' },
  { name: 'フェード', type: 'fade', description: '明滅' },
  { name: 'レインボー', type: 'rainbow', description: '虹色' },
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

  const eventUrl = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/event/${sessionId}`
    : '';

  // イベント作成
  const createEvent = async () => {
    if (!eventName.trim()) {
      alert('イベント名を入力してください');
      return;
    }

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
        console.log('管理者接続成功');
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
      alert('イベント作成に失敗しました');
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
    if (!socket || !sessionId || program.segments.length === 0) {
      alert('プログラムにセグメントがありません');
      return;
    }

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
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/program`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program }),
      });

      if (response.ok) {
        alert('プログラムを保存しました');
      } else {
        throw new Error('保存失敗');
      }
    } catch (error) {
      console.error('プログラム保存エラー:', error);
      alert('プログラムの保存に失敗しました');
    }
  };

  // セグメント追加
  const addSegment = () => {
    const lastSegment = program.segments[program.segments.length - 1];
    const startTime = lastSegment ? lastSegment.endTime : 0;
    const endTime = startTime + 5000; // デフォルト5秒

    const newSegment: ProgramSegment = {
      id: uuidv4(),
      startTime,
      endTime,
      color: '#FF0000',
      effect: 'none',
    };

    const newSegments = [...program.segments, newSegment];
    const totalDuration = Math.max(...newSegments.map(s => s.endTime));

    setProgram({
      ...program,
      segments: newSegments,
      totalDuration,
    });

    setSelectedSegmentId(newSegment.id);
    setEditingSegment(newSegment);
  };

  // セグメント更新
  const updateSegment = (updatedSegment: ProgramSegment) => {
    const newSegments = program.segments.map(s =>
      s.id === updatedSegment.id ? updatedSegment : s
    );
    const totalDuration = Math.max(...newSegments.map(s => s.endTime));

    setProgram({
      ...program,
      segments: newSegments,
      totalDuration,
    });
    setEditingSegment(updatedSegment);
  };

  // セグメント削除
  const deleteSegment = (segmentId: string) => {
    const newSegments = program.segments.filter(s => s.id !== segmentId);
    const totalDuration = newSegments.length > 0 ? Math.max(...newSegments.map(s => s.endTime)) : 0;

    setProgram({
      ...program,
      segments: newSegments,
      totalDuration,
    });

    if (selectedSegmentId === segmentId) {
      setSelectedSegmentId(null);
      setEditingSegment(null);
    }
  };

  // プレビュー再生/停止
  const togglePreview = () => {
    if (isPreviewPlaying) {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
      setIsPreviewPlaying(false);
    } else {
      setIsPreviewPlaying(true);
      previewIntervalRef.current = setInterval(() => {
        setPreviewTime(prev => {
          const next = prev + 100;
          if (next >= program.totalDuration) {
            if (previewIntervalRef.current) {
              clearInterval(previewIntervalRef.current);
            }
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
      if (socket) {
        socket.disconnect();
      }
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
    };
  }, [socket]);

  if (!isCreated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        {/* 背景装飾 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-lg w-full">
          {/* ロゴ/ブランド */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-4 shadow-2xl shadow-purple-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">Cylink</h1>
            <p className="text-purple-200">リアルタイムライトコントロール</p>
          </div>

          {/* カード */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
            <button
              onClick={() => router.push('/')}
              className="mb-6 text-purple-300 hover:text-white transition flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              戻る
            </button>

            <h2 className="text-2xl font-bold text-white mb-6">
              新しいイベントを作成
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-2">
                  イベント名
                </label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createEvent()}
                  placeholder="例: 春のコンサート 2025"
                  className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                />
              </div>

              <button
                onClick={createEvent}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-4 px-6 rounded-xl transition duration-200 shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                イベントを作成
              </button>
            </div>

            {/* 機能説明 */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <p className="text-purple-200 text-sm text-center mb-4">主な機能</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3">
                  <div className="text-2xl mb-1">🎨</div>
                  <p className="text-xs text-purple-200">カラー制御</p>
                </div>
                <div className="p-3">
                  <div className="text-2xl mb-1">✨</div>
                  <p className="text-xs text-purple-200">エフェクト</p>
                </div>
                <div className="p-3">
                  <div className="text-2xl mb-1">🎬</div>
                  <p className="text-xs text-purple-200">プログラム</p>
                </div>
              </div>
            </div>
          </div>

          {/* フッター */}
          <p className="text-center text-purple-300/50 text-sm mt-6">
            500人同時接続対応
          </p>
        </div>
      </div>
    );
  }

  // プログラムエディタ
  if (showProgramEditor) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-6xl mx-auto">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setShowProgramEditor(false)}
              className="text-gray-400 hover:text-white"
            >
              ← 管理画面に戻る
            </button>
            <h1 className="text-2xl font-bold">プログラム編集</h1>
            <button
              onClick={saveProgram}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
            >
              保存
            </button>
          </div>

          {/* プレビュー */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={togglePreview}
                className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg flex items-center gap-2"
              >
                {isPreviewPlaying ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    停止
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    プレビュー
                  </>
                )}
              </button>
              <div className="text-lg font-mono">
                {formatTime(previewTime)} / {formatTime(program.totalDuration)}
              </div>
              <div
                className="w-16 h-16 rounded-lg border-2 border-gray-600"
                style={{ backgroundColor: getPreviewColor() }}
              />
            </div>

            {/* プログレスバー */}
            <div className="relative h-2 bg-gray-700 rounded-full">
              <div
                className="absolute h-full bg-indigo-500 rounded-full"
                style={{ width: `${(previewTime / Math.max(program.totalDuration, 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* タイムライン */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">タイムライン</h2>
              <button
                onClick={addSegment}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                セグメント追加
              </button>
            </div>

            {/* タイムラインビジュアル */}
            <div className="relative h-20 bg-gray-700 rounded-lg overflow-hidden mb-4">
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
                    className={`absolute h-full cursor-pointer border-2 ${
                      selectedSegmentId === segment.id ? 'border-white' : 'border-transparent'
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: segment.color,
                    }}
                  >
                    <div className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1 rounded">
                      {formatTime(segment.startTime)}
                    </div>
                  </div>
                );
              })}

              {/* 再生位置インジケーター */}
              {isPreviewPlaying && (
                <div
                  className="absolute w-0.5 h-full bg-red-500"
                  style={{ left: `${(previewTime / Math.max(program.totalDuration, 1)) * 100}%` }}
                />
              )}
            </div>

            {/* セグメントリスト */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {program.segments.length === 0 ? (
                <p className="text-gray-400 text-center py-4">
                  セグメントがありません。「セグメント追加」をクリックして追加してください。
                </p>
              ) : (
                program.segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    onClick={() => {
                      setSelectedSegmentId(segment.id);
                      setEditingSegment(segment);
                    }}
                    className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer ${
                      selectedSegmentId === segment.id ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <div className="text-gray-400 w-8">#{index + 1}</div>
                    <div
                      className="w-8 h-8 rounded border border-gray-500"
                      style={{ backgroundColor: segment.color }}
                    />
                    <div className="flex-1">
                      <div className="font-mono">
                        {formatTime(segment.startTime)} → {formatTime(segment.endTime)}
                      </div>
                      <div className="text-sm text-gray-400">
                        {EFFECTS.find(e => e.type === segment.effect)?.name || '通常'}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSegment(segment.id);
                      }}
                      className="text-red-400 hover:text-red-300 p-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">セグメント編集</h2>

              <div className="grid grid-cols-2 gap-4">
                {/* 開始時間 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">開始時間</label>
                  <input
                    type="text"
                    value={formatTime(editingSegment.startTime)}
                    onChange={(e) => {
                      const ms = parseTime(e.target.value);
                      updateSegment({ ...editingSegment, startTime: ms });
                    }}
                    className="w-full bg-gray-700 px-3 py-2 rounded-lg font-mono"
                    placeholder="0:00.0"
                  />
                </div>

                {/* 終了時間 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">終了時間</label>
                  <input
                    type="text"
                    value={formatTime(editingSegment.endTime)}
                    onChange={(e) => {
                      const ms = parseTime(e.target.value);
                      updateSegment({ ...editingSegment, endTime: ms });
                    }}
                    className="w-full bg-gray-700 px-3 py-2 rounded-lg font-mono"
                    placeholder="0:05.0"
                  />
                </div>

                {/* 色選択 */}
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">色</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((preset) => (
                      <button
                        key={preset.color}
                        onClick={() => updateSegment({ ...editingSegment, color: preset.color })}
                        className={`w-10 h-10 rounded-lg border-2 ${
                          editingSegment.color === preset.color ? 'border-white' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: preset.color }}
                        title={preset.name}
                      />
                    ))}
                    <input
                      type="color"
                      value={editingSegment.color}
                      onChange={(e) => updateSegment({ ...editingSegment, color: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* エフェクト選択 */}
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">エフェクト</label>
                  <div className="grid grid-cols-3 gap-2">
                    {EFFECTS.map((effect) => (
                      <button
                        key={effect.type}
                        onClick={() => updateSegment({ ...editingSegment, effect: effect.type })}
                        className={`px-3 py-2 rounded-lg text-sm ${
                          editingSegment.effect === effect.type
                            ? 'bg-indigo-600'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {effect.name}
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* 背景装飾 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 mb-6 border border-white/20">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{eventName}</h1>
                <p className="text-purple-300 text-sm">イベント管理画面</p>
              </div>
            </div>
            <div className="text-right bg-white/10 rounded-xl px-6 py-3">
              <p className="text-purple-300 text-xs uppercase tracking-wider">接続中</p>
              <p className="text-4xl font-bold text-white">{connectedUsers}<span className="text-lg text-purple-300 ml-1">人</span></p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* QRコード */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/20">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              参加用QRコード
            </h2>
            <div className="flex justify-center mb-4 bg-white rounded-xl p-4">
              {eventUrl && (
                <QRCodeSVG value={eventUrl} size={180} level="H" />
              )}
            </div>
            <p className="text-xs text-purple-300 text-center break-all bg-white/5 rounded-lg p-2">
              {eventUrl}
            </p>
          </div>

          {/* 現在の状態 */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/20">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              現在の色
            </h2>
            <div
              className="w-full h-36 rounded-xl shadow-inner mb-4 border-4 border-white/20"
              style={{ backgroundColor: currentColor }}
            />
            <div className="flex justify-between items-center">
              <p className="font-mono text-sm text-white bg-white/10 px-3 py-1 rounded-lg">{currentColor}</p>
              <span className={`px-4 py-2 rounded-full text-sm font-medium ${
                mode === 'program'
                  ? 'bg-purple-500/30 text-purple-200 border border-purple-400/30'
                  : 'bg-green-500/30 text-green-200 border border-green-400/30'
              }`}>
                {mode === 'program' ? 'プログラム' : '手動'}
              </span>
            </div>
          </div>

          {/* モード切替 */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/20">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
              モード切替
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => changeMode('manual')}
                disabled={isProgramRunning}
                className={`w-full py-4 px-6 rounded-xl font-bold transition duration-200 flex items-center justify-center gap-2 ${
                  mode === 'manual'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 border border-white/10'
                } ${isProgramRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                </svg>
                手動モード
              </button>
              <button
                onClick={() => changeMode('program')}
                disabled={isProgramRunning}
                className={`w-full py-4 px-6 rounded-xl font-bold transition duration-200 flex items-center justify-center gap-2 ${
                  mode === 'program'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 border border-white/10'
                } ${isProgramRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                プログラムモード
              </button>
            </div>
          </div>
        </div>

        {/* プログラム制御 */}
        {mode === 'program' && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 mb-6 border border-white/20">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              プログラム制御
            </h2>
            <div className="flex flex-wrap gap-4 items-center">
              <button
                onClick={() => setShowProgramEditor(true)}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-xl transition duration-200 border border-white/20 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                編集
              </button>

              {isProgramRunning ? (
                <button
                  onClick={stopProgram}
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-3 px-8 rounded-xl transition duration-200 shadow-lg shadow-red-500/30 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  停止
                </button>
              ) : (
                <button
                  onClick={startProgram}
                  disabled={program.segments.length === 0}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-8 rounded-xl transition duration-200 shadow-lg shadow-green-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  スタート
                </button>
              )}

              <div className="text-purple-300 bg-white/5 px-4 py-2 rounded-lg">
                <span className="text-white font-bold">{program.segments.length}</span> セグメント
                <span className="mx-2 text-purple-400">|</span>
                <span className="text-white font-bold">{formatTime(program.totalDuration)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 手動モード時のカラーコントロール */}
        {mode === 'manual' && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/20">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              カラーコントロール
            </h2>

            {/* プリセットカラー */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-purple-300 mb-4 uppercase tracking-wider">プリセット</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.color}
                    onClick={() => changeColor(preset.color)}
                    disabled={isProgramRunning}
                    className={`flex flex-col items-center p-3 rounded-xl transition disabled:opacity-50 ${
                      currentColor === preset.color
                        ? 'bg-white/20 ring-2 ring-purple-400'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div
                      className="w-12 h-12 rounded-xl shadow-lg mb-2 border-2 border-white/20"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="text-xs text-white/80">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* カスタムカラー */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-purple-300 mb-4 uppercase tracking-wider">カスタム</h3>
              <div className="flex gap-6 items-center bg-white/5 rounded-xl p-4">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => changeColor(e.target.value)}
                  disabled={isProgramRunning}
                  className="w-24 h-24 rounded-xl cursor-pointer disabled:opacity-50 border-2 border-white/20"
                />
                <div>
                  <p className="text-sm text-purple-300 mb-1">
                    カラーピッカーで自由に色を選択
                  </p>
                  <p className="font-mono text-2xl font-bold text-white">{currentColor}</p>
                </div>
              </div>
            </div>

            {/* エフェクト */}
            <div>
              <h3 className="text-sm font-medium text-purple-300 mb-4 uppercase tracking-wider">エフェクト</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {EFFECTS.filter(e => e.type !== 'none').map((effect) => (
                  <button
                    key={effect.type}
                    onClick={() => triggerEffect(effect.type)}
                    disabled={isProgramRunning}
                    className={`py-4 px-4 rounded-xl font-bold transition duration-200 disabled:opacity-50 ${
                      currentEffect === effect.type
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/30'
                        : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                    }`}
                  >
                    <div className="font-semibold">{effect.name}</div>
                    <div className="text-xs opacity-70">{effect.description}</div>
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
