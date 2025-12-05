'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden grain-overlay">
      {/* 背景 - シンプルなグラデーション */}
      <div className="fixed inset-0 bg-[var(--bg-primary)]">
        {/* 暖色系のグロー */}
        <div
          className="absolute top-0 right-0 w-[600px] h-[600px] opacity-30"
          style={{
            background: 'radial-gradient(circle at center, rgba(245, 158, 11, 0.15) 0%, transparent 60%)',
            transform: 'translate(20%, -30%)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[500px] h-[500px] opacity-20"
          style={{
            background: 'radial-gradient(circle at center, rgba(217, 119, 6, 0.2) 0%, transparent 60%)',
            transform: 'translate(-30%, 30%)',
          }}
        />
      </div>

      {/* メインコンテンツ */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        <div className="container-app">
          {/* ロゴ・ブランド */}
          <div className={`text-center mb-16 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
            {/* ロゴアイコン */}
            <div className="inline-flex items-center justify-center w-16 h-16 mb-8 rounded-2xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-tertiary)] glow-amber">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-[var(--bg-primary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>

            {/* タイトル */}
            <h1 className="font-display text-4xl font-bold tracking-tight mb-4 text-gradient">
              Cylink
            </h1>

            {/* サブタイトル */}
            <p className="text-[var(--text-secondary)] text-lg">
              スマホがライトになる。
              <br />
              会場がひとつになる。
            </p>
          </div>

          {/* アクションボタン */}
          <div className={`space-y-4 ${mounted ? 'animate-slide-up delay-150' : 'opacity-0'}`}>
            {/* イベント作成 */}
            <button
              onClick={() => router.push('/admin')}
              className="btn btn-primary btn-lg btn-full"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>イベントを作成</span>
            </button>

            {/* イベント参加 */}
            <button
              onClick={() => router.push('/join')}
              className="btn btn-secondary btn-lg btn-full"
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
                  d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                />
              </svg>
              <span>イベントに参加</span>
            </button>
          </div>

          {/* フィーチャー */}
          <div className={`mt-16 ${mounted ? 'animate-slide-up delay-300' : 'opacity-0'}`}>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gradient mb-1">500+</div>
                <div className="text-xs text-[var(--text-muted)]">同時接続</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gradient mb-1">0.1s</div>
                <div className="text-xs text-[var(--text-muted)]">遅延</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gradient mb-1">無料</div>
                <div className="text-xs text-[var(--text-muted)]">利用料</div>
              </div>
            </div>
          </div>

          {/* フッター */}
          <div className={`mt-20 text-center ${mounted ? 'animate-fade-in delay-500' : 'opacity-0'}`}>
            <div className="text-xs text-[var(--text-muted)] font-mono tracking-wider">
              v1.0.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
