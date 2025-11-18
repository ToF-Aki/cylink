'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');

  const handleJoin = () => {
    if (!sessionId.trim()) {
      alert('セッションIDを入力してください');
      return;
    }

    router.push(`/event/${sessionId}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-teal-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <button
          onClick={() => router.push('/')}
          className="mb-4 text-indigo-600 hover:text-indigo-800"
        >
          ← 戻る
        </button>

        <h1 className="text-3xl font-bold text-center text-indigo-600 mb-2">
          イベントに参加
        </h1>
        <p className="text-center text-gray-600 mb-8">
          QRコードをスキャンするか、セッションIDを入力
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              セッションID
            </label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="セッションIDを入力"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={handleJoin}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
          >
            参加する
          </button>
        </div>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h2 className="font-semibold text-sm text-gray-700 mb-2">
            QRコードをスキャンした場合
          </h2>
          <p className="text-xs text-gray-600">
            管理者が表示したQRコードをスマホのカメラでスキャンすると、自動的にイベントページに移動します
          </p>
        </div>
      </div>
    </div>
  );
}
