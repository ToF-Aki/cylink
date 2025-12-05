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
      {/* 背景 */}
      <div className="fixed inset-0 bg-[var(--bg-primary)]">
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
          {/* ブランド */}
          <div className={`text-center mb-12 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
            <h1 className="font-display text-5xl font-bold tracking-tight mb-4 text-gradient">
              Cylink
            </h1>
            <p className="text-[var(--text-secondary)] text-base leading-relaxed">
              スマホがライトになる。会場がひとつになる。
            </p>
          </div>

          {/* アクションボタン */}
          <div className={`space-y-4 ${mounted ? 'animate-slide-up delay-150' : 'opacity-0'}`}>
            <button
              onClick={() => router.push('/admin')}
              className="btn btn-primary btn-lg btn-full"
            >
              <span>イベントを作成</span>
            </button>

            <button
              onClick={() => router.push('/join')}
              className="btn btn-secondary btn-lg btn-full"
            >
              <span>イベントに参加</span>
            </button>
          </div>

          {/* フィーチャー */}
          <div className={`mt-14 ${mounted ? 'animate-slide-up delay-300' : 'opacity-0'}`}>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-bold text-gradient mb-1">500+</div>
                <div className="text-xs text-[var(--text-muted)]">同時接続</div>
              </div>
              <div>
                <div className="text-xl font-bold text-gradient mb-1">0.1s</div>
                <div className="text-xs text-[var(--text-muted)]">遅延</div>
              </div>
              <div>
                <div className="text-xl font-bold text-gradient mb-1">無料</div>
                <div className="text-xs text-[var(--text-muted)]">利用料</div>
              </div>
            </div>
          </div>

          {/* フッター */}
          <div className={`mt-16 text-center ${mounted ? 'animate-fade-in delay-500' : 'opacity-0'}`}>
            <div className="text-xs text-[var(--text-muted)] font-mono tracking-wider">
              v1.0.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
