/**
 * Cylink 500人負荷テストスクリプト
 *
 * 使用方法:
 *   npx ts-node load-test.ts
 *
 * 環境変数:
 *   TEST_URL: バックエンドURL (デフォルト: http://localhost:3001)
 *   TEST_USERS: 同時接続ユーザー数 (デフォルト: 500)
 *   TEST_DURATION: テスト時間（秒） (デフォルト: 60)
 */

import { io, Socket } from 'socket.io-client';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3001';
const TEST_USERS = parseInt(process.env.TEST_USERS || '500', 10);
const TEST_DURATION = parseInt(process.env.TEST_DURATION || '60', 10) * 1000;
const RAMP_UP_TIME = 10000; // 10秒かけて接続

interface TestStats {
  connected: number;
  disconnected: number;
  errors: number;
  colorChangesReceived: number;
  effectsReceived: number;
  programStartReceived: number;
  avgLatency: number;
  latencies: number[];
}

const stats: TestStats = {
  connected: 0,
  disconnected: 0,
  errors: 0,
  colorChangesReceived: 0,
  effectsReceived: 0,
  programStartReceived: 0,
  avgLatency: 0,
  latencies: [],
};

const sockets: Socket[] = [];
let sessionId: string | null = null;
let adminSocket: Socket | null = null;

// カラー変更を定期的に送信するための色配列
const COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF'];

async function createSession(): Promise<string> {
  const response = await fetch(`${TEST_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Load Test Session' }),
  });
  const data = await response.json() as { sessionId: string };
  return data.sessionId;
}

function createUserSocket(userId: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const socket = io(TEST_URL, {
      transports: ['websocket'],
      forceNew: true,
      timeout: 30000,
    });

    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      stats.latencies.push(latency);
      stats.connected++;
      socket.emit('join-session', { sessionId, isAdmin: false });
      resolve(socket);
    });

    socket.on('color-change', () => {
      stats.colorChangesReceived++;
    });

    socket.on('trigger-effect', () => {
      stats.effectsReceived++;
    });

    socket.on('program-start', () => {
      stats.programStartReceived++;
    });

    socket.on('disconnect', () => {
      stats.disconnected++;
    });

    socket.on('connect_error', (error: Error) => {
      stats.errors++;
      console.error(`User ${userId} connection error:`, error.message);
      reject(error);
    });

    socket.on('error', (error: unknown) => {
      stats.errors++;
      console.error(`User ${userId} error:`, error);
    });

    // タイムアウト
    setTimeout(() => {
      if (!socket.connected) {
        stats.errors++;
        reject(new Error(`User ${userId} connection timeout`));
      }
    }, 30000);
  });
}

function createAdminSocket(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(TEST_URL, {
      transports: ['websocket'],
      forceNew: true,
    });

    socket.on('connect', () => {
      socket.emit('join-session', { sessionId, isAdmin: true });
      console.log('Admin connected');
      resolve(socket);
    });

    socket.on('user-count', (data: { count: number }) => {
      console.log(`Current users: ${data.count}`);
    });

    socket.on('connect_error', (error: Error) => {
      reject(error);
    });
  });
}

function printStats() {
  const avgLatency = stats.latencies.length > 0
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0;
  const maxLatency = stats.latencies.length > 0 ? Math.max(...stats.latencies) : 0;
  const minLatency = stats.latencies.length > 0 ? Math.min(...stats.latencies) : 0;

  console.log('\n========================================');
  console.log('           LOAD TEST RESULTS           ');
  console.log('========================================');
  console.log(`Target Users:        ${TEST_USERS}`);
  console.log(`Test Duration:       ${TEST_DURATION / 1000}s`);
  console.log('----------------------------------------');
  console.log(`Connected:           ${stats.connected}`);
  console.log(`Disconnected:        ${stats.disconnected}`);
  console.log(`Errors:              ${stats.errors}`);
  console.log(`Success Rate:        ${((stats.connected / TEST_USERS) * 100).toFixed(1)}%`);
  console.log('----------------------------------------');
  console.log(`Color Changes Recv:  ${stats.colorChangesReceived}`);
  console.log(`Effects Recv:        ${stats.effectsReceived}`);
  console.log(`Program Start Recv:  ${stats.programStartReceived}`);
  console.log('----------------------------------------');
  console.log(`Avg Latency:         ${avgLatency}ms`);
  console.log(`Min Latency:         ${minLatency}ms`);
  console.log(`Max Latency:         ${maxLatency}ms`);
  console.log('========================================\n');
}

async function runLoadTest() {
  console.log('🚀 Starting Cylink Load Test');
  console.log(`URL: ${TEST_URL}`);
  console.log(`Users: ${TEST_USERS}`);
  console.log(`Duration: ${TEST_DURATION / 1000}s`);
  console.log('');

  // セッション作成
  console.log('Creating test session...');
  try {
    sessionId = await createSession();
    console.log(`Session created: ${sessionId}`);
  } catch (error) {
    console.error('Failed to create session:', error);
    process.exit(1);
  }

  // 管理者接続
  console.log('Connecting admin...');
  try {
    adminSocket = await createAdminSocket();
  } catch (error) {
    console.error('Failed to connect admin:', error);
    process.exit(1);
  }

  // ユーザー接続（段階的に）
  console.log(`\nConnecting ${TEST_USERS} users over ${RAMP_UP_TIME / 1000}s...`);
  const delayPerUser = RAMP_UP_TIME / TEST_USERS;

  for (let i = 0; i < TEST_USERS; i++) {
    setTimeout(async () => {
      try {
        const socket = await createUserSocket(i);
        sockets.push(socket);
      } catch (error) {
        // エラーはすでにカウント済み
      }
    }, i * delayPerUser);

    // 進捗表示
    if ((i + 1) % 100 === 0) {
      setTimeout(() => {
        console.log(`Progress: ${stats.connected}/${TEST_USERS} users connected`);
      }, i * delayPerUser + 500);
    }
  }

  // 接続完了を待つ
  await new Promise(resolve => setTimeout(resolve, RAMP_UP_TIME + 5000));
  console.log(`\n✅ Connection phase complete: ${stats.connected}/${TEST_USERS} users`);

  // 色変更テスト
  console.log('\n📡 Starting color change broadcast test...');
  let colorIndex = 0;
  const colorChangeInterval = setInterval(() => {
    if (adminSocket && adminSocket.connected) {
      const color = COLORS[colorIndex % COLORS.length];
      adminSocket.emit('change-color', { sessionId, color });
      colorIndex++;
    }
  }, 2000); // 2秒ごとに色変更

  // エフェクトテスト
  setTimeout(() => {
    console.log('⚡ Testing effect broadcast...');
    if (adminSocket && adminSocket.connected) {
      adminSocket.emit('trigger-effect', { sessionId, effectType: 'slow-flash' });
    }
  }, 10000);

  // プログラムモードテスト
  setTimeout(async () => {
    console.log('🎬 Testing program mode...');

    // プログラム作成
    const program = {
      id: 'test-program',
      name: 'Load Test Program',
      segments: [
        { id: 'seg1', startTime: 0, endTime: 5000, color: '#FF0000', effect: 'none' },
        { id: 'seg2', startTime: 5000, endTime: 10000, color: '#00FF00', effect: 'fade' },
        { id: 'seg3', startTime: 10000, endTime: 15000, color: '#0000FF', effect: 'rainbow' },
      ],
      totalDuration: 15000,
    };

    try {
      await fetch(`${TEST_URL}/api/sessions/${sessionId}/program`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program }),
      });

      if (adminSocket && adminSocket.connected) {
        adminSocket.emit('start-program', { sessionId });
      }
    } catch (error) {
      console.error('Program test error:', error);
    }
  }, 20000);

  // テスト終了待機
  console.log(`\n⏳ Running test for ${TEST_DURATION / 1000} seconds...`);
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION - RAMP_UP_TIME - 5000));

  // クリーンアップ
  console.log('\n🧹 Cleaning up...');
  clearInterval(colorChangeInterval);

  if (adminSocket) {
    adminSocket.disconnect();
  }

  sockets.forEach(socket => {
    socket.disconnect();
  });

  // 少し待ってから結果表示
  await new Promise(resolve => setTimeout(resolve, 2000));
  printStats();

  // 結果判定
  const successRate = (stats.connected / TEST_USERS) * 100;
  if (successRate >= 95 && stats.errors < 10) {
    console.log('✅ LOAD TEST PASSED');
    process.exit(0);
  } else {
    console.log('❌ LOAD TEST FAILED');
    console.log(`   Success rate: ${successRate.toFixed(1)}% (required: 95%)`);
    console.log(`   Errors: ${stats.errors} (max allowed: 10)`);
    process.exit(1);
  }
}

// メイン実行
runLoadTest().catch(error => {
  console.error('Load test failed:', error);
  process.exit(1);
});
