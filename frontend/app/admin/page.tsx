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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <button
            onClick={() => router.push('/')}
            className="mb-4 text-indigo-600 hover:text-indigo-800"
          >
            ← 戻る
          </button>

          <h1 className="text-3xl font-bold text-center text-indigo-600 mb-6">
            イベントを作成
          </h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                イベント名
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="例: 春のコンサート"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={createEvent}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
            >
              イベントを作成
            </button>
          </div>
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-indigo-600">{eventName}</h1>
            <div className="text-right">
              <p className="text-sm text-gray-600">接続中</p>
              <p className="text-3xl font-bold text-indigo-600">{connectedUsers}人</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* QRコード */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-center">
                参加用QRコード
              </h2>
              <div className="flex justify-center mb-4">
                {eventUrl && (
                  <QRCodeSVG value={eventUrl} size={200} level="H" />
                )}
              </div>
              <p className="text-xs text-gray-600 text-center break-all">
                {eventUrl}
              </p>
            </div>

            {/* 現在の色 & モード */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-center">現在の状態</h2>
              <div
                className="w-full h-32 rounded-lg border-4 border-gray-300 shadow-inner mb-4"
                style={{ backgroundColor: currentColor }}
              />
              <div className="flex justify-between items-center">
                <p className="font-mono text-sm">{currentColor}</p>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  mode === 'program' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                }`}>
                  {mode === 'program' ? 'プログラムモード' : '手動モード'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* モード切替 & プログラム制御 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">モード切替</h2>
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => changeMode('manual')}
              disabled={isProgramRunning}
              className={`flex-1 py-3 px-6 rounded-lg font-bold transition duration-200 ${
                mode === 'manual'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } ${isProgramRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              手動モード
            </button>
            <button
              onClick={() => changeMode('program')}
              disabled={isProgramRunning}
              className={`flex-1 py-3 px-6 rounded-lg font-bold transition duration-200 ${
                mode === 'program'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } ${isProgramRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              プログラムモード
            </button>
          </div>

          {/* プログラム制御 */}
          {mode === 'program' && (
            <div className="border-t pt-4">
              <div className="flex gap-4 items-center">
                <button
                  onClick={() => setShowProgramEditor(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
                >
                  プログラム編集
                </button>

                {isProgramRunning ? (
                  <button
                    onClick={stopProgram}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    停止
                  </button>
                ) : (
                  <button
                    onClick={startProgram}
                    disabled={program.segments.length === 0}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    スタート
                  </button>
                )}

                <div className="text-sm text-gray-600">
                  {program.segments.length}個のセグメント / {formatTime(program.totalDuration)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 手動モード時のカラーコントロール */}
        {mode === 'manual' && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-semibold mb-4">カラーコントロール</h2>

            {/* プリセットカラー */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">プリセット</h3>
              <div className="grid grid-cols-5 gap-3">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.color}
                    onClick={() => changeColor(preset.color)}
                    disabled={isProgramRunning}
                    className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-gray-300 shadow-md mb-2"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="text-xs text-gray-700">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* カスタムカラー */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">カスタム</h3>
              <div className="flex gap-4 items-center">
                <input
                  type="color"
                  value={currentColor}
                  onChange={(e) => changeColor(e.target.value)}
                  disabled={isProgramRunning}
                  className="w-20 h-20 rounded-lg cursor-pointer disabled:opacity-50"
                />
                <div>
                  <p className="text-sm text-gray-600">
                    カラーピッカーで自由に色を選択
                  </p>
                  <p className="font-mono text-lg font-semibold">{currentColor}</p>
                </div>
              </div>
            </div>

            {/* エフェクト */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">エフェクト</h3>
              <div className="grid grid-cols-3 gap-3">
                {EFFECTS.filter(e => e.type !== 'none').map((effect) => (
                  <button
                    key={effect.type}
                    onClick={() => triggerEffect(effect.type)}
                    disabled={isProgramRunning}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-3 px-4 rounded-lg shadow-lg transition duration-200 disabled:opacity-50"
                  >
                    <div className="font-semibold">{effect.name}</div>
                    <div className="text-xs opacity-80">{effect.description}</div>
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
