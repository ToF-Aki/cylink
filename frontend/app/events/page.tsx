'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Session {
  id: string;
  name: string;
  createdAt: string;
  connectedUsers: number;
  mode: 'manual' | 'program';
}

export default function EventsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/sessions`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError('イベントの取得に失敗しました');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sessionId: string, sessionName: string) => {
    if (!confirm(`「${sessionName}」を削除しますか？`)) return;

    try {
      setDeletingId(sessionId);
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      setSessions(sessions.filter(s => s.id !== sessionId));
    } catch (err) {
      alert('削除に失敗しました');
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEventCode = (sessionId: string) => {
    return sessionId.substring(0, 6).toUpperCase();
  };

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
      </div>

      {/* ヘッダー */}
      <div className="relative z-10 pt-[env(safe-area-inset-top)]">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <button
            onClick={() => router.push('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            戻る
          </button>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            イベント一覧
          </h1>
          <div style={{ width: '60px' }} />
        </div>
      </div>

      {/* コンテンツ */}
      <div className="relative z-10 px-4 py-6">
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              読み込み中...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--error)' }}>
              {error}
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                イベントがありません
              </p>
              <button
                onClick={() => router.push('/admin')}
                style={{
                  padding: '12px 24px',
                  background: 'var(--accent-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                イベントを作成
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={mounted ? 'animate-fade-in' : 'opacity-0'}
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {session.name}
                      </h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {formatDate(session.createdAt)}
                      </p>
                    </div>
                    <div
                      style={{
                        padding: '4px 10px',
                        background: 'var(--accent-primary)',
                        color: 'var(--bg-primary)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                      }}
                    >
                      {getEventCode(session.id)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => router.push(`/admin?session=${session.id}`)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-secondary)',
                        borderRadius: '10px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      管理画面を開く
                    </button>
                    <button
                      onClick={() => handleDelete(session.id, session.name)}
                      disabled={deletingId === session.id}
                      style={{
                        padding: '12px 16px',
                        background: deletingId === session.id ? 'var(--bg-tertiary)' : 'rgba(239, 68, 68, 0.1)',
                        color: deletingId === session.id ? 'var(--text-muted)' : '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '10px',
                        cursor: deletingId === session.id ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      {deletingId === session.id ? '...' : '削除'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
