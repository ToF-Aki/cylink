'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// エフェクト
const EFFECTS = [
  { name: 'ゆっくり点滅', type: 'slow-flash' },
  { name: '速く点滅', type: 'fast-flash' },
];

export default function AdminPage() {
  const router = useRouter();
  const [eventName, setEventName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [currentColor, setCurrentColor] = useState('#FFFFFF');
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isCreated, setIsCreated] = useState(false);

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

      // WebSocket接続
      const newSocket = io(API_URL, {
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        console.log('管理者接続成功');
        newSocket.emit('join-session', { sessionId: data.sessionId, isAdmin: true });
      });

      newSocket.on('user-count', (data) => {
        setConnectedUsers(data.count);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('イベント作成エラー:', error);
      alert('イベント作成に失敗しました');
    }
  };

  // 色変更
  const changeColor = (color: string) => {
    if (!socket || !sessionId) return;

    setCurrentColor(color);
    socket.emit('change-color', { sessionId, color, effect: null });
  };

  // エフェクト実行
  const triggerEffect = (effectType: string) => {
    if (!socket || !sessionId) return;

    socket.emit('trigger-effect', { sessionId, effectType });
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
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

            {/* 現在の色 */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-center">現在の色</h2>
              <div
                className="w-full h-40 rounded-lg border-4 border-gray-300 shadow-inner"
                style={{ backgroundColor: currentColor }}
              />
              <p className="text-center mt-2 font-mono text-sm">{currentColor}</p>
            </div>
          </div>
        </div>

        {/* カラーパレット */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-semibold mb-4">カラーコントロール</h2>

          {/* プリセットカラー */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">プリセット</h3>
            <div className="grid grid-cols-4 gap-3">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.color}
                  onClick={() => changeColor(preset.color)}
                  className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-50 transition"
                >
                  <div
                    className="w-16 h-16 rounded-lg border-2 border-gray-300 shadow-md mb-2"
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
                className="w-20 h-20 rounded-lg cursor-pointer"
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
            <h3 className="text-sm font-medium text-gray-700 mb-3">エフェクト（白色）</h3>
            <div className="grid grid-cols-2 gap-3">
              {EFFECTS.map((effect) => (
                <button
                  key={effect.type}
                  onClick={() => triggerEffect(effect.type)}
                  className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition duration-200 flex items-center justify-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span>{effect.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
