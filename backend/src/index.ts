import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS設定
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',');
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

// DynamoDB設定
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  } : undefined,
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const SESSIONS_TABLE = process.env.DYNAMODB_TABLE || 'cylink-sessions';

// Socket.io設定（500人以上対応）
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  perMessageDeflate: {
    threshold: 1024,
  },
  maxHttpBufferSize: 1e6,
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
  createdAt: string;
  updatedAt: string;
}

interface Session {
  id: string;
  name: string;
  createdAt: string;
  color: string;
  effect: EffectType;
  connectedUsers: number;
  mode: SessionMode;
  program: Program | null;
  programStartTime: number | null;
  isProgramRunning: boolean;
}

// メモリキャッシュ（リアルタイム用）
const sessionCache = new Map<string, Session>();

// DynamoDB操作関数
const saveSessionToDynamo = async (session: Session): Promise<void> => {
  try {
    await docClient.send(new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: {
        sessionId: session.id,
        ...session,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7日後に自動削除
      },
    }));
    console.log(`💾 Session saved to DynamoDB: ${session.id}`);
  } catch (error) {
    console.error('DynamoDB save error:', error);
  }
};

const getSessionFromDynamo = async (sessionId: string): Promise<Session | null> => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    }));
    if (result.Item) {
      const { sessionId: _, ttl, ...sessionData } = result.Item;
      return sessionData as Session;
    }
    return null;
  } catch (error) {
    console.error('DynamoDB get error:', error);
    return null;
  }
};

const deleteSessionFromDynamo = async (sessionId: string): Promise<void> => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: SESSIONS_TABLE,
      Key: { sessionId },
    }));
    console.log(`🗑️ Session deleted from DynamoDB: ${sessionId}`);
  } catch (error) {
    console.error('DynamoDB delete error:', error);
  }
};

// セッション取得（キャッシュ優先、なければDynamoDB）
const getSession = async (sessionId: string): Promise<Session | null> => {
  // キャッシュをチェック
  let session = sessionCache.get(sessionId);
  if (session) {
    return session;
  }

  // DynamoDBから取得
  session = await getSessionFromDynamo(sessionId);
  if (session) {
    sessionCache.set(sessionId, session);
  }
  return session;
};

// セッション保存（キャッシュとDynamoDB両方）
const saveSession = async (session: Session): Promise<void> => {
  sessionCache.set(session.id, session);
  await saveSessionToDynamo(session);
};

// ヘルスチェック
app.get('/health', (req, res) => {
  const roomStats: { [key: string]: number } = {};
  sessionCache.forEach((session, id) => {
    roomStats[id] = session.connectedUsers;
  });

  res.json({
    status: 'ok',
    timestamp: new Date(),
    totalConnections: io.engine.clientsCount,
    sessions: roomStats,
    dynamoDbTable: SESSIONS_TABLE,
  });
});

// セッション作成API
app.post('/api/sessions', async (req, res) => {
  const { name } = req.body;
  const sessionId = uuidv4();

  const session: Session = {
    id: sessionId,
    name: name || 'Unnamed Event',
    createdAt: new Date().toISOString(),
    color: '#FFFFFF',
    effect: 'none',
    connectedUsers: 0,
    mode: 'manual',
    program: null,
    programStartTime: null,
    isProgramRunning: false,
  };

  await saveSession(session);

  res.json({ sessionId, session });
});

// セッション情報取得API
app.get('/api/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ session });
});

// プログラム保存API
app.post('/api/sessions/:sessionId/program', async (req, res) => {
  const { sessionId } = req.params;
  const { program } = req.body;

  const session = await getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const newProgram: Program = {
    ...program,
    id: program.id || uuidv4(),
    createdAt: program.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  session.program = newProgram;
  await saveSession(session);

  res.json({ success: true, program: newProgram });
});

// プログラム取得API
app.get('/api/sessions/:sessionId/program', async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
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
  if (userCountBroadcastQueue.has(sessionId)) {
    clearTimeout(userCountBroadcastQueue.get(sessionId)!);
  }

  const timer = setTimeout(async () => {
    const session = await getSession(sessionId);
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
  socket.on('join-session', async (data: { sessionId: string; isAdmin: boolean }) => {
    const { sessionId, isAdmin: admin } = data;
    const session = await getSession(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    currentSessionId = sessionId;
    isAdmin = admin;
    socket.join(sessionId);

    if (!admin) {
      session.connectedUsers++;
      sessionCache.set(sessionId, session);
      // DynamoDBへの保存は非同期で行う（リアルタイム性のため）
      saveSessionToDynamo(session);
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

    broadcastUserCount(sessionId);

    console.log(`✅ User joined session: ${sessionId} (Admin: ${admin}, Users: ${session.connectedUsers})`);
  });

  // 管理者からの色変更（手動モード時のみ）
  socket.on('change-color', async (data: { sessionId: string; color: string; effect?: EffectType }) => {
    const { sessionId, color, effect } = data;
    const session = await getSession(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (session.mode === 'program' && session.isProgramRunning) {
      socket.emit('error', { message: 'Program is running. Cannot change color manually.' });
      return;
    }

    session.color = color;
    session.effect = effect || 'none';
    sessionCache.set(sessionId, session);
    saveSessionToDynamo(session);

    io.to(sessionId).emit('color-change', { color, effect: session.effect });

    console.log(`🎨 Color changed in session ${sessionId}: ${color} (effect: ${session.effect})`);
  });

  // エフェクトトリガー（手動モード時のみ）
  socket.on('trigger-effect', async (data: { sessionId: string; effectType: EffectType }) => {
    const { sessionId, effectType } = data;
    const session = await getSession(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (session.mode === 'program' && session.isProgramRunning) {
      socket.emit('error', { message: 'Program is running. Cannot trigger effect manually.' });
      return;
    }

    session.effect = effectType;
    sessionCache.set(sessionId, session);
    saveSessionToDynamo(session);

    io.to(sessionId).emit('trigger-effect', { effectType });

    console.log(`⚡ Effect triggered in session ${sessionId}: ${effectType}`);
  });

  // モード切替
  socket.on('change-mode', async (data: { sessionId: string; mode: SessionMode }) => {
    const { sessionId, mode } = data;
    const session = await getSession(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (session.isProgramRunning) {
      socket.emit('error', { message: 'Cannot change mode while program is running.' });
      return;
    }

    session.mode = mode;
    sessionCache.set(sessionId, session);
    saveSessionToDynamo(session);

    io.to(sessionId).emit('mode-change', { mode });

    console.log(`🔄 Mode changed in session ${sessionId}: ${mode}`);
  });

  // プログラム開始
  socket.on('start-program', async (data: { sessionId: string }) => {
    const { sessionId } = data;
    const session = await getSession(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (!session.program || session.program.segments.length === 0) {
      socket.emit('error', { message: 'No program to run' });
      return;
    }

    const startTime = Date.now() + 1000;

    session.mode = 'program';
    session.isProgramRunning = true;
    session.programStartTime = startTime;
    sessionCache.set(sessionId, session);
    saveSessionToDynamo(session);

    io.to(sessionId).emit('program-start', {
      program: session.program,
      startTime,
    });

    console.log(`▶️ Program started in session ${sessionId} at ${new Date(startTime).toISOString()}`);

    const duration = session.program.totalDuration;
    setTimeout(async () => {
      const currentSession = await getSession(sessionId);
      if (currentSession && currentSession.isProgramRunning) {
        currentSession.isProgramRunning = false;
        currentSession.programStartTime = null;
        sessionCache.set(sessionId, currentSession);
        saveSessionToDynamo(currentSession);

        io.to(sessionId).emit('program-stop', { reason: 'completed' });
        console.log(`⏹️ Program completed in session ${sessionId}`);
      }
    }, duration + 1000);
  });

  // プログラム停止
  socket.on('stop-program', async (data: { sessionId: string }) => {
    const { sessionId } = data;
    const session = await getSession(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    session.isProgramRunning = false;
    session.programStartTime = null;
    sessionCache.set(sessionId, session);
    saveSessionToDynamo(session);

    io.to(sessionId).emit('program-stop', { reason: 'manual' });

    console.log(`⏹️ Program manually stopped in session ${sessionId}`);
  });

  // ユーザーからの色変更リクエスト（手動モード時のみ）
  socket.on('user-color-change', async (data: { sessionId: string; color: string }) => {
    const { sessionId, color } = data;
    const session = await getSession(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (session.mode === 'program' && session.isProgramRunning) {
      socket.emit('control-locked', { message: 'Program is running' });
      return;
    }

    socket.emit('color-change', { color, effect: 'none' });
  });

  // 切断処理
  socket.on('disconnect', async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);

    if (currentSessionId && !isAdmin) {
      const session = sessionCache.get(currentSessionId);
      if (session) {
        session.connectedUsers = Math.max(0, session.connectedUsers - 1);
        sessionCache.set(currentSessionId, session);
        saveSessionToDynamo(session);
        broadcastUserCount(currentSessionId);
      }
    }
  });
});

// 定期的なキャッシュクリーンアップ（メモリリーク防止）
setInterval(() => {
  sessionCache.forEach((session, id) => {
    if (session.connectedUsers === 0) {
      sessionCache.delete(id);
      console.log(`🧹 Removed from cache: ${id}`);
    }
  });
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready (optimized for 500+ users)`);
  console.log(`🌐 CORS enabled for: ${corsOrigins.join(', ')}`);
  console.log(`💾 DynamoDB table: ${SESSIONS_TABLE}`);
});
