'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function EventPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [color, setColor] = useState('#FFFFFF');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [eventName, setEventName] = useState('');
  const [error, setError] = useState('');
  const [showShareMessage, setShowShareMessage] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashInterval, setFlashInterval] = useState<NodeJS.Timeout | null>(null);
  const [baseColor, setBaseColor] = useState('#FFFFFF');

  // フラッシュエフェクト処理
  const handleFlashEffect = (effectType: string) => {
    // 既存のフラッシュを停止
    if (flashInterval) {
      clearInterval(flashInterval);
      setFlashInterval(null);
    }

    // 現在の色を保存
    setBaseColor(color);
    setIsFlashing(true);

    // フラッシュ間隔を設定
    const interval = effectType === 'slow-flash' ? 1000 : 200;
    let isWhite = false;

    const timer = setInterval(() => {
      isWhite = !isWhite;
      setColor(isWhite ? '#FFFFFF' : baseColor);
    }, interval);

    setFlashInterval(timer);

    // 5秒後にフラッシュを停止
    setTimeout(() => {
      clearInterval(timer);
      setColor(baseColor);
      setIsFlashing(false);
      setFlashInterval(null);
    }, 5000);
  };

  useEffect(() => {
    // baseColorを更新（フラッシュ中でない場合のみ）
    if (!isFlashing) {
      setBaseColor(color);
    }
  }, [color, isFlashing]);

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

    fetchSession();

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

    newSocket.on('color-change', (data) => {
      console.log('色変更:', data.color);
      setColor(data.color);
    });

    newSocket.on('error', (data) => {
      console.error('エラー:', data.message);
      setError(data.message);
    });

    newSocket.on('trigger-effect', (data: { effectType: string }) => {
      console.log('エフェクト受信:', data.effectType);
      handleFlashEffect(data.effectType);
    });

    setSocket(newSocket);

    // スクリーンをオンのままにする（可能な場合）
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((wakeLock) => {
          console.log('スクリーンロック有効化');
        })
        .catch((err) => {
          console.log('スクリーンロック失敗:', err);
        });
    }

    return () => {
      newSocket.disconnect();
      // フラッシュインターバルのクリーンアップ
      if (flashInterval) {
        clearInterval(flashInterval);
      }
    };
  }, [resolvedParams.sessionId, flashInterval]);

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
      backgroundColor: color,
      transition: 'background-color 0.3s ease'
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
            color: color === '#FFFFFF' || color === '#FFFF00' ? '#000000' : '#FFFFFF',
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
            {isConnected ? '接続中' : '接続待機中...'}
          </span>
        </div>
      </div>

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
              color: color === '#FFFFFF' || color === '#FFFF00' ? '#000000' : '#FFFFFF',
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
                color: color === '#FFFFFF' || color === '#FFFF00' ? '#000000' : '#FFFFFF',
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
