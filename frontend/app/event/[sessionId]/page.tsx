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

  // エフェクト用のref
  const effectIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnimationRef = useRef<number | null>(null);
  const rainbowIndexRef = useRef(0);

  // プログラム再生用
  const programRef = useRef<Program | null>(null);
  const programStartTimeRef = useRef<number | null>(null);
  const programAnimationRef = useRef<number | null>(null);
  const serverTimeOffsetRef = useRef<number>(0);

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

  // フェードエフェクト（明→暗→明をスムーズに）
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

      // 色を暗くする
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

  // ストロボエフェクト（超高速点滅）
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

    // 現在のセグメントを探す
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

    // まだプログラム実行中なら次のフレームをスケジュール
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

    // 開始時刻まで待機してから再生開始
    const waitTime = startTime - (Date.now() - serverTimeOffsetRef.current);
    if (waitTime > 0) {
      setTimeout(() => {
        programAnimationRef.current = requestAnimationFrame(runProgramLoop);
      }, waitTime);
    } else {
      // すでに開始時刻を過ぎている場合はすぐに開始
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

    // セッション情報を取得
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

    // サーバー時刻との差分を計算
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

    // WebSocket接続
    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('接続成功');
      setIsConnected(true);
      newSocket.emit('join-session', { sessionId, isAdmin: false });
    });

    newSocket.on('disconnect', () => {
      console.log('接続解除');
      setIsConnected(false);
    });

    // 初期状態同期
    newSocket.on('sync-state', (data: {
      mode: SessionMode;
      color: string;
      effect: EffectType;
      program: Program | null;
      programStartTime: number | null;
      isProgramRunning: boolean;
      serverTime: number;
    }) => {
      console.log('状態同期:', data);
      setMode(data.mode);

      // サーバー時刻オフセット更新
      serverTimeOffsetRef.current = Date.now() - data.serverTime;

      // プログラム実行中なら途中から再生
      if (data.isProgramRunning && data.program && data.programStartTime) {
        startProgram(data.program, data.programStartTime);
      } else {
        applyEffect(data.color, data.effect);
        setIsControlLocked(data.mode === 'program' && data.isProgramRunning);
      }
    });

    // 色変更
    newSocket.on('color-change', (data: { color: string; effect?: EffectType }) => {
      console.log('色変更:', data);
      if (!isProgramRunning) {
        applyEffect(data.color, data.effect || 'none');
      }
    });

    // エフェクトトリガー（後方互換性）
    newSocket.on('trigger-effect', (data: { effectType: EffectType }) => {
      console.log('エフェクト受信:', data.effectType);
      if (!isProgramRunning) {
        setCurrentEffect(data.effectType);
        applyEffect(baseColor, data.effectType);

        // 5秒後にエフェクト停止
        setTimeout(() => {
          setCurrentEffect('none');
          applyEffect(baseColor, 'none');
        }, 5000);
      }
    });

    // モード変更
    newSocket.on('mode-change', (data: { mode: SessionMode }) => {
      console.log('モード変更:', data.mode);
      setMode(data.mode);
      if (data.mode === 'manual') {
        setIsControlLocked(false);
      }
    });

    // プログラム開始
    newSocket.on('program-start', (data: { program: Program; startTime: number }) => {
      console.log('プログラム開始:', data);
      startProgram(data.program, data.startTime);
    });

    // プログラム停止
    newSocket.on('program-stop', (data: { reason: string }) => {
      console.log('プログラム停止:', data.reason);
      stopProgram();
    });

    // コントロールロック通知
    newSocket.on('control-locked', (data: { message: string }) => {
      console.log('コントロールロック:', data.message);
      setIsControlLocked(true);
    });

    newSocket.on('error', (data: { message: string }) => {
      console.error('エラー:', data.message);
      setError(data.message);
    });

    setSocket(newSocket);

    // スクリーンをオンのままにする（可能な場合）
    let wakeLock: WakeLockSentinel | null = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLock = lock;
          console.log('スクリーンロック有効化');
        })
        .catch((err) => {
          console.log('スクリーンロック失敗:', err);
        });
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

  // シェア機能
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
      // Web Share API非対応の場合はクリップボードにコピー
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShowShareMessage(true);
        setTimeout(() => setShowShareMessage(false), 2000);
      } catch (err) {
        console.error('コピー失敗:', err);
      }
    }
  };

  // テキスト色の決定
  const getTextColor = (bgColor: string) => {
    if (bgColor === '#FFFFFF' || bgColor === '#FFFF00' || bgColor === '#00FF00') {
      return '#000000';
    }
    return '#FFFFFF';
  };

  const textColor = getTextColor(displayColor);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">エラー</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: displayColor,
      transition: currentEffect === 'none' && !isProgramRunning ? 'background-color 0.3s ease' : 'none'
    }}>
      {/* 上部: 接続状況 */}
      <div style={{
        position: 'fixed',
        top: '16px',
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: '0 16px',
        zIndex: 10
      }}>
        <div
          style={{
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '9999px',
            padding: '8px 16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: textColor,
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#4ade80' : '#f87171'
            }}
          />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>
            {isConnected ? (isProgramRunning ? 'プログラム実行中' : '接続中') : '接続待機中...'}
          </span>
        </div>
      </div>

      {/* プログラムモード時のロックインジケーター */}
      {isControlLocked && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 5
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '8px'
          }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '64px', height: '64px', margin: '0 auto', opacity: 0.5 }}
              fill="none"
              viewBox="0 0 24 24"
              stroke={textColor}
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        </div>
      )}

      {/* 下部: イベント名とシェアボタン */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '48px 24px',
          paddingBottom: '32px',
          zIndex: 50,
          background: 'linear-gradient(to top, rgba(0,0,0,0.1), transparent)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <p
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: textColor,
            }}
          >
            {eventName || 'イベント'}
          </p>
        </div>

        {/* シェアボタン */}
        <button
          onClick={handleShare}
          style={{
            width: '100%',
            backgroundColor: 'rgba(255,255,255,0.95)',
            color: '#111827',
            fontWeight: 'bold',
            padding: '16px 24px',
            borderRadius: '9999px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '20px', height: '20px' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          <span>Share</span>
        </button>

        {/* コピー完了メッセージ */}
        {showShareMessage && (
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 500,
                backgroundColor: 'rgba(255,255,255,0.3)',
                padding: '8px 16px',
                borderRadius: '9999px',
                display: 'inline-block',
                backdropFilter: 'blur(4px)',
                color: textColor,
              }}
            >
              URLをコピーしました
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
