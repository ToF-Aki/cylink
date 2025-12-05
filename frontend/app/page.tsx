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
    <div className="min-h-screen relative overflow-hidden noise-overlay scan-lines">
      {/* 動的な背景グラデーション */}
      <div className="fixed inset-0 bg-[#050508]">
        {/* メイングロー */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.15) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 left-1/4 w-[600px] h-[600px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(255,0,170,0.1) 0%, transparent 70%)', animationDelay: '1s' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', animationDelay: '2s' }}
        />

        {/* 浮遊する光の粒子 */}
        <div className="absolute top-[20%] left-[15%] w-2 h-2 bg-[#00f5ff] rounded-full animate-float opacity-60" style={{ animationDelay: '0s' }} />
        <div className="absolute top-[60%] left-[80%] w-1.5 h-1.5 bg-[#ff00aa] rounded-full animate-float opacity-50" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[40%] left-[70%] w-1 h-1 bg-[#8b5cf6] rounded-full animate-float opacity-40" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[75%] left-[25%] w-2 h-2 bg-[#c4ff00] rounded-full animate-float opacity-30" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-[30%] left-[85%] w-1 h-1 bg-[#00f5ff] rounded-full animate-float opacity-50" style={{ animationDelay: '0.5s' }} />
      </div>

      {/* メインコンテンツ */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        <div className={`max-w-md w-full ${mounted ? 'animate-scale-in' : 'opacity-0'}`}>

          {/* ロゴ・ブランド */}
          <div className="text-center mb-12">
            {/* アイコン */}
            <div className={`inline-block mb-6 ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00f5ff] via-[#8b5cf6] to-[#ff00aa] p-[2px] animate-neon-flicker">
                  <div className="w-full h-full rounded-2xl bg-[#0a0a0f] flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[#00f5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                </div>
                {/* グロー効果 */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00f5ff] to-[#ff00aa] opacity-30 blur-xl -z-10" />
              </div>
            </div>

            {/* タイトル */}
            <h1
              className={`text-5xl font-bold tracking-tight mb-3 text-gradient-neon ${mounted ? 'animate-slide-up delay-100' : 'opacity-0'}`}
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              CYLINK
            </h1>

            {/* サブタイトル */}
            <p className={`text-white/50 text-lg tracking-wide ${mounted ? 'animate-slide-up delay-200' : 'opacity-0'}`}>
              スマホをライトに。会場を一つに。
            </p>
          </div>

          {/* ボタングループ */}
          <div className={`space-y-4 ${mounted ? 'animate-slide-up delay-300' : 'opacity-0'}`}>
            {/* 管理者ボタン */}
            <button
              onClick={() => router.push('/admin')}
              className="group relative w-full overflow-hidden rounded-2xl p-[1px] transition-all duration-500 hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#00f5ff] via-[#8b5cf6] to-[#ff00aa] opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center justify-center gap-3 bg-[#0a0a0f] rounded-2xl px-8 py-5 transition-all group-hover:bg-[#0a0a0f]/80">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#00f5ff] group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="font-semibold text-lg bg-gradient-to-r from-[#00f5ff] to-[#8b5cf6] bg-clip-text text-transparent group-hover:from-white group-hover:to-white transition-all">
                  イベントを作成
                </span>
              </div>
            </button>

            {/* 参加者ボタン */}
            <button
              onClick={() => router.push('/join')}
              className="group relative w-full overflow-hidden rounded-2xl border border-white/10 hover:border-[#00f5ff]/50 transition-all duration-500 hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#00f5ff]/5 to-[#ff00aa]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center justify-center gap-3 px-8 py-5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white/60 group-hover:text-[#00f5ff] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="font-semibold text-lg text-white/80 group-hover:text-white transition-colors">
                  イベントに参加
                </span>
              </div>
            </button>
          </div>

          {/* 説明テキスト */}
          <div className={`mt-12 text-center ${mounted ? 'animate-slide-up delay-400' : 'opacity-0'}`}>
            <div className="flex items-center justify-center gap-8 text-sm text-white/30">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00f5ff]" />
                <span>リアルタイム同期</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#ff00aa]" />
                <span>500人同時接続</span>
              </div>
            </div>
          </div>

          {/* バージョン */}
          <div className={`mt-16 text-center ${mounted ? 'animate-slide-up delay-500' : 'opacity-0'}`}>
            <span className="font-mono text-xs text-white/20 tracking-widest">v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
