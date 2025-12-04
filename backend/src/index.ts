import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS設定
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',');
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// Socket.io設定（500人以上対応）
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
  // パフォーマンス最適化（500人対応）
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  // 接続数最適化
  perMessageDeflate: {
    threshold: 1024, // 1KB以上のメッセージのみ圧縮
  },
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 45000,
});

// Redis Adapter設定（スケーリング対応）
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const pubClient = new Redis(redisUrl);
  const subClient = pubClient.duplicate();

  Promise.all([pubClient, subClient]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Redis adapter connected');
  });
}

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
  createdAt: Date;
  updatedAt: Date;
}

interface Session {
  id: string;
  name: string;
  createdAt: Date;
  color: string;
  effect: EffectType;
  connectedUsers: number;
  mode: SessionMode;
  program: Program | null;
  programStartTime: number | null;
  isProgramRunning: boolean;
}

const sessions = new Map<string, Session>();

// プログラムデータ保存ディレクトリ
const DATA_DIR = process.env.DATA_DIR || './data';
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// プログラムをファイルに保存
const saveProgramToFile = (sessionId: string, program: Program) => {
  const filePath = path.join(DATA_DIR, `program_${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(program, null, 2));
};

// プログラムをファイルから読み込み
const loadProgramFromFile = (sessionId: string): Program | null => {
  const filePath = path.join(DATA_DIR, `program_${sessionId}.json`);
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  }
  return null;
};

// ヘルスチェック
app.get('/health', (req, res) => {
  const roomStats: { [key: string]: number } = {};
  sessions.forEach((session, id) => {
    roomStats[id] = session.connectedUsers;
  });

  res.json({
    status: 'ok',
    timestamp: new Date(),
    totalConnections: io.engine.clientsCount,
    sessions: roomStats
  });
});

// セッション作成API
app.post('/api/sessions', (req, res) => {
  const { name } = req.body;
  const sessionId = uuidv4();

  // 既存のプログラムを読み込み
  const existingProgram = loadProgramFromFile(sessionId);

  const session: Session = {
    id: sessionId,
    name: name || 'Unnamed Event',
    createdAt: new Date(),
    color: '#FFFFFF',
    effect: 'none',
    connectedUsers: 0,
    mode: 'manual',
    program: existingProgram,
    programStartTime: null,
    isProgramRunning: false,
  };

  sessions.set(sessionId, session);

  res.json({ sessionId, session });
});

// セッション情報取得API
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ session });
});

// プログラム保存API
app.post('/api/sessions/:sessionId/program', (req, res) => {
  const { sessionId } = req.params;
  const { program } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const newProgram: Program = {
    ...program,
    id: program.id || uuidv4(),
    createdAt: program.createdAt || new Date(),
    updatedAt: new Date(),
  };

  session.program = newProgram;
  sessions.set(sessionId, session);
  saveProgramToFile(sessionId, newProgram);

  res.json({ success: true, program: newProgram });
});

// プログラム取得API
app.get('/api/sessions/:sessionId/program', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // メモリになければファイルから読み込み
  if (!session.program) {
    session.program = loadProgramFromFile(sessionId);
  }

  res.json({ program: session.program });
});

// サーバー時刻取得API（同期用）
app.get('/api/time', (req, res) => {
  res.json({ serverTime: Date.now() });
});

// 接続数ブロードキャスト（バッチ処理で最適化）
const userCountBroadcastQueue = new Map<string, NodeJS.Timeout>();

const broadcastUserCount = (sessionId: string) => {
  // 既存のタイマーをクリア
  if (userCountBroadcastQueue.has(sessionId)) {
    clearTimeout(userCountBroadcastQueue.get(sessionId)!);
  }

  // 100ms後にブロードキャスト（バッチ処理）
  const timer = setTimeout(() => {
    const session = sessions.get(sessionId);
    if (session) {
      io.to(sessionId).emit('user-count', { count: session.connectedUsers });
    }
    userCountBroadcastQueue.delete(sessionId);
  }, 100);

  userCountBroadcastQueue.set(sessionId, timer);
};

// WebSocket接続処理
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  let currentSessionId: string | null = null;
  let isAdmin = false;

  // セッション参加
  socket.on('join-session', (data: { sessionId: string; isAdmin: boolean }) => {
    const { sessionId, isAdmin: admin } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    currentSessionId = sessionId;
    isAdmin = admin;
    socket.join(sessionId);

    if (!admin) {
      session.connectedUsers++;
      sessions.set(sessionId, session);
    }

    // 現在の完全な状態を送信
    const syncState = {
      mode: session.mode,
      color: session.color,
      effect: session.effect,
      program: session.program,
      programStartTime: session.programStartTime,
      isProgramRunning: session.isProgramRunning,
      serverTime: Date.now(),
    };
    socket.emit('sync-state', syncState);

    // 接続数をブロードキャスト
    broadcastUserCount(sessionId);

    console.log(`✅ User joined session: ${sessionId} (Admin: ${admin}, Users: ${session.connectedUsers})`);
  });

  // 管理者からの色変更（手動モード時のみ）
  socket.on('change-color', (data: { sessionId: string; color: string; effect?: EffectType }) => {
    const { sessionId, color, effect } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    // プログラムモード実行中は手動変更を無視
    if (session.mode === 'program' && session.isProgramRunning) {
      socket.emit('error', { message: 'Program is running. Cannot change color manually.' });
      return;
    }

    session.color = color;
    session.effect = effect || 'none';
    sessions.set(sessionId, session);

    // セッション内の全ユーザーに色変更を通知
    io.to(sessionId).emit('color-change', { color, effect: session.effect });

    console.log(`🎨 Color changed in session ${sessionId}: ${color} (effect: ${session.effect})`);
  });

  // エフェクトトリガー（手動モード時のみ）
  socket.on('trigger-effect', (data: { sessionId: string; effectType: EffectType }) => {
    const { sessionId, effectType } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    // プログラムモード実行中は手動変更を無視
    if (session.mode === 'program' && session.isProgramRunning) {
      socket.emit('error', { message: 'Program is running. Cannot trigger effect manually.' });
      return;
    }

    session.effect = effectType;
    sessions.set(sessionId, session);

    // セッション内の全ユーザーにエフェクトを通知
    io.to(sessionId).emit('trigger-effect', { effectType });

    console.log(`⚡ Effect triggered in session ${sessionId}: ${effectType}`);
  });

  // モード切替
  socket.on('change-mode', (data: { sessionId: string; mode: SessionMode }) => {
    const { sessionId, mode } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    // プログラム実行中はモード切替不可
    if (session.isProgramRunning) {
      socket.emit('error', { message: 'Cannot change mode while program is running.' });
      return;
    }

    session.mode = mode;
    sessions.set(sessionId, session);

    // 全ユーザーに通知
    io.to(sessionId).emit('mode-change', { mode });

    console.log(`🔄 Mode changed in session ${sessionId}: ${mode}`);
  });

  // プログラム開始
  socket.on('start-program', (data: { sessionId: string }) => {
    const { sessionId } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (!session.program || session.program.segments.length === 0) {
      socket.emit('error', { message: 'No program to run' });
      return;
    }

    const startTime = Date.now() + 1000; // 1秒後に開始（同期のため）

    session.mode = 'program';
    session.isProgramRunning = true;
    session.programStartTime = startTime;
    sessions.set(sessionId, session);

    // 全ユーザーにプログラム開始を通知
    io.to(sessionId).emit('program-start', {
      program: session.program,
      startTime,
    });

    console.log(`▶️ Program started in session ${sessionId} at ${new Date(startTime).toISOString()}`);

    // プログラム終了タイマー
    const duration = session.program.totalDuration;
    setTimeout(() => {
      const currentSession = sessions.get(sessionId);
      if (currentSession && currentSession.isProgramRunning) {
        currentSession.isProgramRunning = false;
        currentSession.programStartTime = null;
        sessions.set(sessionId, currentSession);

        io.to(sessionId).emit('program-stop', { reason: 'completed' });
        console.log(`⏹️ Program completed in session ${sessionId}`);
      }
    }, duration + 1000); // 開始待機分を加算
  });

  // プログラム停止
  socket.on('stop-program', (data: { sessionId: string }) => {
    const { sessionId } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    session.isProgramRunning = false;
    session.programStartTime = null;
    sessions.set(sessionId, session);

    // 全ユーザーに停止を通知
    io.to(sessionId).emit('program-stop', { reason: 'manual' });

    console.log(`⏹️ Program manually stopped in session ${sessionId}`);
  });

  // ユーザーからの色変更リクエスト（手動モード時のみ）
  socket.on('user-color-change', (data: { sessionId: string; color: string }) => {
    const { sessionId, color } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    // プログラムモード実行中はユーザーの色変更を無視
    if (session.mode === 'program' && session.isProgramRunning) {
      socket.emit('control-locked', { message: 'Program is running' });
      return;
    }

    // 自分だけに色を適用（他のユーザーには影響しない）
    socket.emit('color-change', { color, effect: 'none' });
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);

    if (currentSessionId && !isAdmin) {
      const session = sessions.get(currentSessionId);
      if (session) {
        session.connectedUsers = Math.max(0, session.connectedUsers - 1);
        sessions.set(currentSessionId, session);
        broadcastUserCount(currentSessionId);
      }
    }
  });
});

// 定期的なセッションクリーンアップ（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24時間

  sessions.forEach((session, id) => {
    const age = now - session.createdAt.getTime();
    if (age > maxAge && session.connectedUsers === 0) {
      sessions.delete(id);
      console.log(`🧹 Cleaned up inactive session: ${id}`);
    }
  });
}, 60 * 60 * 1000); // 1時間ごと

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready (optimized for 500+ users)`);
  console.log(`🌐 CORS enabled for: ${corsOrigins.join(', ')}`);
});
