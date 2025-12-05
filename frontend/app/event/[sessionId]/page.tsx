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

export default function EventPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [displayColor, setDisplayColor] = useState('#FFFFFF');
  const [baseColor, setBaseColor] = useState('#FFFFFF');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [eventName, setEventName] = useState('');
  const [error, setError] = useState('');
  const [showShareMessage, setShowShareMessage] = useState(false);
  const [currentEffect, setCurrentEffect] = useState<EffectType>('none');
  const [mode, setMode] = useState<SessionMode>('manual');
  const [isProgramRunning, setIsProgramRunning] = useState(false);
  const [isControlLocked, setIsControlLocked] = useState(false);
  const [mounted, setMounted] = useState(false);

  // エフェクト用のref
  const effectIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnimationRef = useRef<number | null>(null);
  const rainbowIndexRef = useRef(0);

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

  useEffect(() => {
    const sessionId = resolvedParams.sessionId;

    const fetchSession = async () => {
      try {
        const response = await fetch(`${API_URL}/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error('セッションが見つかりません');
        }
        const data = await response.json();
        setEventName(data.session.name);
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
        startProgram(data.program, data.programStartTime);
      } else {
        applyEffect(data.color, data.effect);
        setIsControlLocked(data.mode === 'program' && data.isProgramRunning);
      }
    });

    newSocket.on('color-change', (data: { color: string; effect?: EffectType }) => {
      if (!isProgramRunning) {
        applyEffect(data.color, data.effect || 'none');
      }
    });

    newSocket.on('trigger-effect', (data: { effectType: EffectType }) => {
      if (!isProgramRunning) {
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
      }
    });

    newSocket.on('program-start', (data: { program: Program; startTime: number }) => {
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
      if (programAnimationRef.current) {
        cancelAnimationFrame(programAnimationRef.current);
      }
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, [resolvedParams.sessionId, applyEffect, startProgram, stopProgram, clearEffects, isProgramRunning, baseColor]);

  const handleShare = async () => {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${eventName} - Cylink`,
          text: `${eventName}のライトイベントに参加しよう！`,
          url: shareUrl,
        });
      } catch (err) {
        console.log('シェアキャンセル:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShowShareMessage(true);
        setTimeout(() => setShowShareMessage(false), 2000);
      } catch (err) {
        console.error('コピー失敗:', err);
      }
    }
  };

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
      <div className="min-h-screen flex items-center justify-center bg-[#050508] p-4 noise-overlay">
        <div className="fixed inset-0">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,0,100,0.2) 0%, transparent 70%)' }}
          />
        </div>

        <div className={`relative max-w-md w-full ${mounted ? 'animate-scale-in' : 'opacity-0'}`}>
          <div className="glass-strong rounded-3xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#ff0066] to-[#ff00aa] p-[2px]">
              <div className="w-full h-full rounded-2xl bg-[#0a0a0f] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#ff0066]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white mb-3">エラー</h1>
            <p className="text-white/60 mb-8">{error}</p>

            <button
              onClick={() => router.push('/')}
              className="group relative w-full overflow-hidden rounded-2xl p-[1px] transition-all duration-500 hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#00f5ff] via-[#8b5cf6] to-[#ff00aa] opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center justify-center gap-3 bg-[#0a0a0f] rounded-2xl px-8 py-4 transition-all group-hover:bg-[#0a0a0f]/80">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#00f5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="font-semibold text-white">ホームに戻る</span>
              </div>
            </button>
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
        transition: currentEffect === 'none' && !isProgramRunning ? 'background-color 0.3s ease' : 'none'
      }}
    >
      {/* 上部: 接続状況バッジ */}
      <div className="fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] pointer-events-none">
        <div className="flex justify-center pt-4 px-4">
          <div
            className={`
              inline-flex items-center gap-2 px-4 py-2 rounded-full
              backdrop-blur-xl transition-all duration-500
              ${mounted ? 'animate-slide-up' : 'opacity-0'}
            `}
            style={{
              background: isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
            }}
          >
            <div className="relative">
              <div
                className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-[#00f5ff]' : 'bg-[#ff0066]'}`}
              />
              {isConnected && (
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#00f5ff] animate-ping opacity-75" />
              )}
            </div>

            <span
              className="text-sm font-medium"
              style={{ color: textColor }}
            >
              {isConnected
                ? (isProgramRunning ? 'PROGRAM RUNNING' : 'CONNECTED')
                : 'CONNECTING...'
              }
            </span>

            {mode === 'program' && (
              <div
                className="ml-1 px-2 py-0.5 rounded text-xs font-mono font-semibold"
                style={{
                  background: isDarkBg ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.2)',
                  color: isDarkBg ? '#c4b5fd' : '#7c3aed',
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
            <div className="relative inline-block">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-24 h-24 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke={textColor}
                strokeWidth={1}
                style={{
                  opacity: 0.4,
                  filter: isDarkBg ? 'drop-shadow(0 0 20px rgba(255,255,255,0.3))' : 'drop-shadow(0 0 20px rgba(0,0,0,0.2))',
                }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>

            <p
              className="mt-4 text-sm font-medium tracking-widest uppercase"
              style={{
                color: textColor,
                opacity: 0.5,
              }}
            >
              Synchronized
            </p>
          </div>
        </div>
      )}

      {/* 下部: イベント情報とシェアボタン */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div
          className="px-6 pt-16 pb-8"
          style={{
            background: isDarkBg
              ? 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 100%)'
              : 'linear-gradient(to top, rgba(255,255,255,0.3) 0%, transparent 100%)',
          }}
        >
          <div className={`text-center mb-4 ${mounted ? 'animate-slide-up delay-100' : 'opacity-0'}`}>
            <p
              className="text-sm font-medium tracking-wide"
              style={{ color: textColor, opacity: 0.8 }}
            >
              {eventName || 'Event'}
            </p>
          </div>

          <button
            onClick={handleShare}
            className={`
              group relative w-full overflow-hidden rounded-2xl transition-all duration-300
              active:scale-[0.98] pointer-events-auto
              ${mounted ? 'animate-slide-up delay-200' : 'opacity-0'}
            `}
            style={{
              background: isDarkBg
                ? 'rgba(255,255,255,0.15)'
                : 'rgba(0,0,0,0.1)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
            }}
          >
            <div className="flex items-center justify-center gap-3 px-8 py-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 transition-transform group-hover:scale-110"
                fill="none"
                viewBox="0 0 24 24"
                stroke={textColor}
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              <span
                className="font-semibold text-base tracking-wide"
                style={{ color: textColor }}
              >
                Share
              </span>
            </div>
          </button>

          {showShareMessage && (
            <div className="mt-4 text-center animate-scale-in">
              <span
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
                style={{
                  background: isDarkBg ? 'rgba(0,245,255,0.2)' : 'rgba(0,200,200,0.2)',
                  color: isDarkBg ? '#00f5ff' : '#006666',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                URLをコピーしました
              </span>
            </div>
          )}
        </div>
      </div>

      {/* CYLINKブランディング */}
      <div
        className={`fixed bottom-[env(safe-area-inset-bottom)] right-4 pb-2 z-40 pointer-events-none ${mounted ? 'animate-slide-up delay-300' : 'opacity-0'}`}
      >
        <span
          className="font-mono text-xs tracking-widest"
          style={{
            color: textColor,
            opacity: 0.2,
          }}
        >
          CYLINK
        </span>
      </div>
    </div>
  );
}
