'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleJoin = () => {
    if (!sessionId.trim()) {
      return;
    }
    router.push(`/event/${sessionId}`);
  };

  return (
    <div className="min-h-screen relative overflow-hidden grain-overlay">
      {/* 背景 */}
      <div className="fixed inset-0 bg-[var(--bg-primary)]">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20"
          style={{
            background: 'radial-gradient(circle at center, rgba(245, 158, 11, 0.2) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* メインコンテンツ */}
      <div className="relative z-10 min-h-screen flex flex-col px-6 safe-area-top safe-area-bottom">
        {/* ヘッダー */}
        <header className="py-6">
          <button
            onClick={() => router.push('/')}
            className="btn btn-ghost"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>戻る</span>
          </button>
        </header>

        {/* メインエリア */}
        <main className="flex-1 flex flex-col items-center justify-center pb-12">
          <div className="container-app">
            {/* タイトル */}
            <div className={`text-center mb-10 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
              <h1 className="font-display text-3xl font-bold mb-3">
                イベントに参加
              </h1>
              <p className="text-[var(--text-secondary)]">
                コードを入力してイベントに参加
              </p>
            </div>

            {/* 入力フォーム */}
            <div className={`${mounted ? 'animate-slide-up delay-100' : 'opacity-0'}`}>
              <div className="card-elevated p-6">
                <div className="space-y-5">
                  {/* ラベル */}
                  <label className="input-label">
                    セッションコード
                  </label>

                  {/* 入力フィールド */}
                  <input
                    type="text"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="コードを入力"
                    className="input"
                    autoComplete="off"
                    autoCapitalize="off"
                  />

                  {/* 参加ボタン */}
                  <button
                    onClick={handleJoin}
                    disabled={!sessionId.trim()}
                    className="btn btn-primary btn-lg btn-full disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>参加する</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* ヒント */}
            <div className={`mt-8 ${mounted ? 'animate-slide-up delay-200' : 'opacity-0'}`}>
              <div className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-display font-medium mb-1">QRコードで簡単参加</h3>
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                      管理者が表示するQRコードをスキャンすると、自動的にイベントに参加できます
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
