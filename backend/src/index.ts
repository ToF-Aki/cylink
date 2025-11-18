import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS設定
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Socket.io設定（1000人規模対応）
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
  // パフォーマンス最適化
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
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

// セッション管理
interface Session {
  id: string;
  name: string;
  createdAt: Date;
  color: string;
  connectedUsers: number;
}

const sessions = new Map<string, Session>();

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// セッション作成API
app.post('/api/sessions', (req, res) => {
  const { name } = req.body;
  const sessionId = uuidv4();

  const session: Session = {
    id: sessionId,
    name: name || 'Unnamed Event',
    createdAt: new Date(),
    color: '#FFFFFF',
    connectedUsers: 0,
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

// WebSocket接続処理
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // セッション参加
  socket.on('join-session', (data: { sessionId: string; isAdmin: boolean }) => {
    const { sessionId, isAdmin } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    socket.join(sessionId);

    if (!isAdmin) {
      session.connectedUsers++;
      sessions.set(sessionId, session);
    }

    // 現在の色を送信
    socket.emit('color-change', { color: session.color });

    // 管理者には接続数を通知
    if (isAdmin) {
      socket.emit('user-count', { count: session.connectedUsers });
    } else {
      // 管理者に接続数更新を通知
      io.to(sessionId).emit('user-count', { count: session.connectedUsers });
    }

    console.log(`✅ User joined session: ${sessionId} (Admin: ${isAdmin})`);
  });

  // 管理者からの色変更
  socket.on('change-color', (data: { sessionId: string; color: string }) => {
    const { sessionId, color } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    session.color = color;
    sessions.set(sessionId, session);

    // セッション内の全ユーザーに色変更を通知
    io.to(sessionId).emit('color-change', { color });

    console.log(`🎨 Color changed in session ${sessionId}: ${color}`);
  });

  // エフェクトトリガー
  socket.on('trigger-effect', (data: { sessionId: string; effectType: string }) => {
    const { sessionId, effectType } = data;
    const session = sessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    // セッション内の全ユーザーにエフェクトを通知
    io.to(sessionId).emit('trigger-effect', { effectType });

    console.log(`⚡ Effect triggered in session ${sessionId}: ${effectType}`);
  });

  // 切断処理
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);

    // ユーザー数を減らす（全セッションをチェック）
    sessions.forEach((session, sessionId) => {
      const socketsInRoom = io.sockets.adapter.rooms.get(sessionId);
      if (socketsInRoom) {
        session.connectedUsers = Math.max(0, socketsInRoom.size - 1); // 管理者分を考慮
        sessions.set(sessionId, session);
        io.to(sessionId).emit('user-count', { count: session.connectedUsers });
      }
    });
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌐 CORS enabled for: ${corsOrigin}`);
});
