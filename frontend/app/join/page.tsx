'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

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
    <div className="min-h-screen relative overflow-hidden noise-overlay">
      {/* 動的な背景 */}
      <div className="fixed inset-0 bg-[#050508]">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.1) 0%, transparent 70%)', animationDelay: '1.5s' }}
        />

        {/* グリッドパターン */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      {/* メインコンテンツ */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        <div className={`max-w-md w-full ${mounted ? 'animate-scale-in' : 'opacity-0'}`}>

          {/* 戻るボタン */}
          <button
            onClick={() => router.push('/')}
            className={`mb-8 flex items-center gap-2 text-white/40 hover:text-[#00f5ff] transition-colors ${mounted ? 'animate-slide-up' : 'opacity-0'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">ホームに戻る</span>
          </button>

          {/* ヘッダー */}
          <div className={`text-center mb-10 ${mounted ? 'animate-slide-up delay-100' : 'opacity-0'}`}>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b5cf6]/20 to-[#00f5ff]/20 border border-[#8b5cf6]/30 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">イベントに参加</h1>
            <p className="text-white/40">QRコードをスキャンするか、コードを入力</p>
          </div>

          {/* 入力カード */}
          <div className={`glass-strong rounded-3xl p-8 ${mounted ? 'animate-slide-up delay-200' : 'opacity-0'}`}>
            <div className="space-y-6">
              {/* セッションID入力 */}
              <div>
                <label className="block text-sm font-medium text-white/60 mb-3">
                  セッションコード
                </label>
                <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`}>
                  <input
                    type="text"
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="例: abc123-def456"
                    className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-lg font-mono tracking-wider focus:border-[#8b5cf6]/50 focus:ring-2 focus:ring-[#8b5cf6]/20 outline-none transition-all"
                  />
                  {isFocused && (
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#8b5cf6]/10 to-[#00f5ff]/10 -z-10 blur-xl" />
                  )}
                </div>
              </div>

              {/* 参加ボタン */}
              <button
                onClick={handleJoin}
                disabled={!sessionId.trim()}
                className="group relative w-full overflow-hidden rounded-xl p-[1px] transition-all duration-500 hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#8b5cf6] to-[#00f5ff] opacity-80 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center justify-center gap-3 bg-[#0a0a0f] rounded-xl px-8 py-4 transition-all group-hover:bg-[#0a0a0f]/80">
                  <span className="font-semibold text-lg text-white">
                    参加する
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </button>
            </div>
          </div>

          {/* ヒント */}
          <div className={`mt-8 ${mounted ? 'animate-slide-up delay-300' : 'opacity-0'}`}>
            <div className="glass rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#00f5ff]/10 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#00f5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-medium mb-1">QRコードで簡単参加</h3>
                  <p className="text-white/40 text-sm leading-relaxed">
                    管理者が表示するQRコードをスマホのカメラでスキャンすると、自動的にイベントページに移動します
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
