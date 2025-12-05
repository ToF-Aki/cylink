'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

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
}

// レインボーカラー配列
const RAINBOW_COLORS = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
  '#0000FF', '#4B0082', '#9400D3'
];

// ユーザーが選べる色
const USER_COLORS = [
  '#FF0000', // 赤
  '#FF7F00', // オレンジ
  '#FFFF00', // 黄
  '#00FF00', // 緑
  '#00FFFF', // シアン
  '#0000FF', // 青
  '#FF00FF', // マゼンタ
  '#FFFFFF', // 白
];

export default function EventPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [displayColor, setDisplayColor] = useState('#FFFFFF');
  const [baseColor, setBaseColor] = useState('#FFFFFF');
  const [, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [currentEffect, setCurrentEffect] = useState<EffectType>('none');
  const [mode, setMode] = useState<SessionMode>('manual');
  const [isProgramRunning, setIsProgramRunning] = useState(false);
  const [isControlLocked, setIsControlLocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userSelectedColor, setUserSelectedColor] = useState('#FFFFFF');
  const [isStrobeActive, setIsStrobeActive] = useState(false);

  // エフェクト用のref
  const effectIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnimationRef = useRef<number | null>(null);
  const rainbowIndexRef = useRef(0);
  const userStrobeRef = useRef<NodeJS.Timeout | null>(null);

  // プログラム再生用
  const programRef = useRef<Program | null>(null);
  const programStartTimeRef = useRef<number | null>(null);
  const programAnimationRef = useRef<number | null>(null);
  const serverTimeOffsetRef = useRef<number>(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // エフェクトをクリア
  const clearEffects = useCallback(() => {
    if (effectIntervalRef.current) {
      clearInterval(effectIntervalRef.current);
      effectIntervalRef.current = null;
    }
    if (fadeAnimationRef.current) {
      cancelAnimationFrame(fadeAnimationRef.current);
      fadeAnimationRef.current = null;
    }
  }, []);

  // ユーザーストロボをクリア
  const clearUserStrobe = useCallback(() => {
    if (userStrobeRef.current) {
      clearInterval(userStrobeRef.current);
      userStrobeRef.current = null;
    }
    setIsStrobeActive(false);
  }, []);

  // フェードエフェクト
  const startFadeEffect = useCallback((color: string) => {
    clearEffects();
    let brightness = 1;
    let direction = -1;
    const step = 0.02;

    const animate = () => {
      brightness += direction * step;
      if (brightness <= 0.2) {
        brightness = 0.2;
        direction = 1;
      } else if (brightness >= 1) {
        brightness = 1;
        direction = -1;
      }

      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const newR = Math.round(r * brightness);
      const newG = Math.round(g * brightness);
      const newB = Math.round(b * brightness);
      const newColor = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;

      setDisplayColor(newColor);
      fadeAnimationRef.current = requestAnimationFrame(animate);
    };

    fadeAnimationRef.current = requestAnimationFrame(animate);
  }, [clearEffects]);

  // レインボーエフェクト
  const startRainbowEffect = useCallback(() => {
    clearEffects();
    rainbowIndexRef.current = 0;

    effectIntervalRef.current = setInterval(() => {
      rainbowIndexRef.current = (rainbowIndexRef.current + 1) % RAINBOW_COLORS.length;
      setDisplayColor(RAINBOW_COLORS[rainbowIndexRef.current]);
    }, 500);
  }, [clearEffects]);

  // ストロボエフェクト
  const startStrobeEffect = useCallback((color: string) => {
    clearEffects();
    let isOn = true;

    effectIntervalRef.current = setInterval(() => {
      isOn = !isOn;
      setDisplayColor(isOn ? color : '#000000');
    }, 50);
  }, [clearEffects]);

  // 点滅エフェクト
  const startFlashEffect = useCallback((color: string, interval: number) => {
    clearEffects();
    let isWhite = false;

    effectIntervalRef.current = setInterval(() => {
      isWhite = !isWhite;
      setDisplayColor(isWhite ? '#FFFFFF' : color);
    }, interval);
  }, [clearEffects]);

  // エフェクト適用
  const applyEffect = useCallback((color: string, effect: EffectType) => {
    clearEffects();
    setBaseColor(color);

    switch (effect) {
      case 'none':
        setDisplayColor(color);
        break;
      case 'slow-flash':
        startFlashEffect(color, 1000);
        break;
      case 'fast-flash':
        startFlashEffect(color, 200);
        break;
      case 'strobe':
        startStrobeEffect(color);
        break;
      case 'fade':
        startFadeEffect(color);
        break;
      case 'rainbow':
        startRainbowEffect();
        break;
      default:
        setDisplayColor(color);
    }
  }, [clearEffects, startFlashEffect, startStrobeEffect, startFadeEffect, startRainbowEffect]);

  // プログラム再生ループ
  const runProgramLoop = useCallback(() => {
    if (!programRef.current || !programStartTimeRef.current) {
      return;
    }

    const now = Date.now() - serverTimeOffsetRef.current;
    const elapsed = now - programStartTimeRef.current;
    const program = programRef.current;

    let currentSegment: ProgramSegment | null = null;
    for (const segment of program.segments) {
      if (elapsed >= segment.startTime && elapsed < segment.endTime) {
        currentSegment = segment;
        break;
      }
    }

    if (currentSegment) {
      applyEffect(currentSegment.color, currentSegment.effect);
    }

    if (elapsed < program.totalDuration) {
      programAnimationRef.current = requestAnimationFrame(runProgramLoop);
    }
  }, [applyEffect]);

  // プログラム開始
  const startProgram = useCallback((program: Program, startTime: number) => {
    programRef.current = program;
    programStartTimeRef.current = startTime;
    setIsProgramRunning(true);
    setIsControlLocked(true);

    const waitTime = startTime - (Date.now() - serverTimeOffsetRef.current);
    if (waitTime > 0) {
      setTimeout(() => {
        programAnimationRef.current = requestAnimationFrame(runProgramLoop);
      }, waitTime);
    } else {
      programAnimationRef.current = requestAnimationFrame(runProgramLoop);
    }
  }, [runProgramLoop]);

  // プログラム停止
  const stopProgram = useCallback(() => {
    if (programAnimationRef.current) {
      cancelAnimationFrame(programAnimationRef.current);
      programAnimationRef.current = null;
    }
    clearEffects();
    programRef.current = null;
    programStartTimeRef.current = null;
    setIsProgramRunning(false);
    setIsControlLocked(false);
    setDisplayColor('#FFFFFF');
  }, [clearEffects]);

  // ユーザーが色を選択
  const handleUserColorSelect = (color: string) => {
    clearUserStrobe();
    setUserSelectedColor(color);
    setDisplayColor(color);
  };

  // ユーザーがストロボを切り替え
  const handleUserStrobe = () => {
    if (isStrobeActive) {
      clearUserStrobe();
      setDisplayColor(userSelectedColor);
    } else {
      setIsStrobeActive(true);
      let isOn = true;
      userStrobeRef.current = setInterval(() => {
        isOn = !isOn;
        setDisplayColor(isOn ? userSelectedColor : '#000000');
      }, 50);
    }
  };

  useEffect(() => {
    const sessionId = resolvedParams.sessionId;

    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_URL}/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error('セッションが見つかりません');
        }
      } catch (err) {
        setError('イベントが見つかりませんでした');
        console.error(err);
      }
    };

    const syncServerTime = async () => {
      try {
        const start = Date.now();
        const response = await fetch(`${API_URL}/api/time`);
        const data = await response.json();
        const end = Date.now();
        const latency = (end - start) / 2;
        serverTimeOffsetRef.current = Date.now() - (data.serverTime + latency);
      } catch (err) {
        console.error('時刻同期失敗:', err);
      }
    };

    fetchSession();
    syncServerTime();

    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      newSocket.emit('join-session', { sessionId, isAdmin: false });
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('sync-state', (data: {
      mode: SessionMode;
      color: string;
      effect: EffectType;
      program: Program | null;
      programStartTime: number | null;
      isProgramRunning: boolean;
      serverTime: number;
    }) => {
      setMode(data.mode);
      serverTimeOffsetRef.current = Date.now() - data.serverTime;

      if (data.isProgramRunning && data.program && data.programStartTime) {
        clearUserStrobe();
        startProgram(data.program, data.programStartTime);
      } else if (data.mode === 'program') {
        clearUserStrobe();
        applyEffect(data.color, data.effect);
        setIsControlLocked(data.isProgramRunning);
      } else {
        // manualモードの場合はユーザー操作を許可
        setIsControlLocked(false);
      }
    });

    newSocket.on('color-change', (data: { color: string; effect?: EffectType }) => {
      if (!isProgramRunning && mode === 'program') {
        clearUserStrobe();
        applyEffect(data.color, data.effect || 'none');
      }
    });

    newSocket.on('trigger-effect', (data: { effectType: EffectType }) => {
      if (!isProgramRunning && mode === 'program') {
        clearUserStrobe();
        setCurrentEffect(data.effectType);
        applyEffect(baseColor, data.effectType);

        setTimeout(() => {
          setCurrentEffect('none');
          applyEffect(baseColor, 'none');
        }, 5000);
      }
    });

    newSocket.on('mode-change', (data: { mode: SessionMode }) => {
      setMode(data.mode);
      if (data.mode === 'manual') {
        setIsControlLocked(false);
        // manualモードに切り替わったらユーザー選択色を表示
        clearUserStrobe();
        setDisplayColor(userSelectedColor);
      }
    });

    newSocket.on('program-start', (data: { program: Program; startTime: number }) => {
      clearUserStrobe();
      startProgram(data.program, data.startTime);
    });

    newSocket.on('program-stop', () => {
      stopProgram();
    });

    newSocket.on('control-locked', () => {
      setIsControlLocked(true);
    });

    newSocket.on('error', (data: { message: string }) => {
      setError(data.message);
    });

    setSocket(newSocket);

    let wakeLock: WakeLockSentinel | null = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLock = lock;
        })
        .catch(() => {});
    }

    return () => {
      newSocket.disconnect();
      clearEffects();
      clearUserStrobe();
      if (programAnimationRef.current) {
        cancelAnimationFrame(programAnimationRef.current);
      }
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, [resolvedParams.sessionId, applyEffect, startProgram, stopProgram, clearEffects, clearUserStrobe, isProgramRunning, baseColor, mode, userSelectedColor]);

  // テキスト色の決定（明るい背景には暗いテキスト）
  const getTextColor = (bgColor: string) => {
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  };

  const textColor = getTextColor(displayColor);
  const isDarkBg = textColor === '#FFFFFF';

  if (error) {
    return (
      <div className="min-h-screen relative overflow-hidden grain-overlay">
        <div className="fixed inset-0 bg-[var(--bg-primary)]">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20"
            style={{
              background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.3) 0%, transparent 60%)',
            }}
          />
        </div>

        <div className="relative z-10 min-h-screen flex items-center justify-center px-6">
          <div className={`container-app ${mounted ? 'animate-scale-in' : 'opacity-0'}`}>
            <div className="card-elevated p-8 text-center">
              <h1 className="font-display text-2xl font-bold mb-3">エラー</h1>
              <p className="text-[var(--text-secondary)] mb-8">{error}</p>

              <button
                onClick={() => router.push('/')}
                className="btn btn-primary btn-lg btn-full"
              >
                <span>ホームに戻る</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fullscreen-light"
      style={{
        backgroundColor: displayColor,
        transition: currentEffect === 'none' && !isProgramRunning && !isStrobeActive ? 'background-color 0.3s ease' : 'none'
      }}
    >
      {/* 上部: 接続状況バッジ */}
      <div className="fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] pointer-events-none">
        <div className="flex justify-center pt-4 px-4">
          <div
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-full
              backdrop-blur-xl transition-all duration-500
              ${mounted ? 'animate-slide-down' : 'opacity-0'}
            `}
            style={{
              background: isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
            }}
          >
            <div className="relative">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-300`}
                style={{
                  background: isConnected ? '#22c55e' : '#ef4444',
                  boxShadow: isConnected ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
                }}
              />
              {isConnected && (
                <div
                  className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-75"
                  style={{ background: '#22c55e' }}
                />
              )}
            </div>

            <span
              className="text-sm font-medium font-display tracking-wide"
              style={{ color: textColor }}
            >
              {isConnected
                ? (isProgramRunning ? 'SYNC' : 'LIVE')
                : '接続中...'
              }
            </span>

            {mode === 'program' && isProgramRunning && (
              <div
                className="ml-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold"
                style={{
                  background: isDarkBg ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.2)',
                  color: isDarkBg ? '#fbbf24' : '#d97706',
                }}
              >
                AUTO
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 中央: プログラムモード時のインジケーター */}
      {isControlLocked && (
        <div className="fixed inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className={`text-center ${mounted ? 'animate-scale-in' : 'opacity-0'}`}>
            <p
              className="text-sm font-display font-medium tracking-widest uppercase"
              style={{
                color: textColor,
                opacity: 0.4,
              }}
            >
              Synchronized
            </p>
          </div>
        </div>
      )}

      {/* 下部: manualモード時のコントロール */}
      {mode === 'manual' && !isControlLocked && (
        <div className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
          <div
            className={`px-4 pt-8 pb-6 ${mounted ? 'animate-slide-up' : 'opacity-0'}`}
            style={{
              background: isDarkBg
                ? 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)'
                : 'linear-gradient(to top, rgba(255,255,255,0.5) 0%, transparent 100%)',
            }}
          >
            {/* 色選択ボタン */}
            <div className="flex justify-center gap-3 mb-4 flex-wrap">
              {USER_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleUserColorSelect(color)}
                  className={`w-12 h-12 rounded-full transition-all duration-200 active:scale-95 ${
                    userSelectedColor === color ? 'scale-110' : ''
                  }`}
                  style={{
                    backgroundColor: color,
                    boxShadow: userSelectedColor === color
                      ? `0 0 0 2px ${displayColor}, 0 0 0 4px ${textColor}`
                      : `0 2px 8px ${color}66`,
                  }}
                />
              ))}
            </div>

            {/* ストロボボタン */}
            <button
              onClick={handleUserStrobe}
              className={`w-full py-4 rounded-2xl font-display font-semibold text-base tracking-wide transition-all duration-200 active:scale-[0.98] ${
                isStrobeActive ? 'animate-pulse' : ''
              }`}
              style={{
                background: isStrobeActive
                  ? (isDarkBg ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)')
                  : (isDarkBg ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'),
                color: textColor,
                border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
              }}
            >
              {isStrobeActive ? 'ストロボ停止' : 'ストロボ'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
