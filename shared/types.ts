// Cylink共通型定義

// エフェクトタイプ
export type EffectType =
  | 'none'           // 通常（単色）
  | 'slow-flash'     // ゆっくり点滅
  | 'fast-flash'     // 速く点滅
  | 'strobe'         // ストロボ
  | 'fade'           // フェード
  | 'rainbow';       // レインボー

// エフェクト定義
export interface EffectDefinition {
  name: string;
  type: EffectType;
  description: string;
}

// 利用可能なエフェクト一覧
export const AVAILABLE_EFFECTS: EffectDefinition[] = [
  { name: '通常', type: 'none', description: '単色表示' },
  { name: 'ゆっくり点滅', type: 'slow-flash', description: '1秒間隔で点滅' },
  { name: '速く点滅', type: 'fast-flash', description: '0.2秒間隔で点滅' },
  { name: 'ストロボ', type: 'strobe', description: '超高速点滅（50ms）' },
  { name: 'フェード', type: 'fade', description: '徐々に明滅' },
  { name: 'レインボー', type: 'rainbow', description: '虹色に変化' },
];

// プリセットカラー
export const PRESET_COLORS = [
  { name: '赤', color: '#FF0000' },
  { name: 'オレンジ', color: '#FF8800' },
  { name: '黄', color: '#FFFF00' },
  { name: '緑', color: '#00FF00' },
  { name: '青', color: '#0088FF' },
  { name: '紫', color: '#8800FF' },
  { name: 'ピンク', color: '#FF00FF' },
  { name: '白', color: '#FFFFFF' },
  { name: '黒', color: '#000000' },
];

// プログラムセグメント（タイムラインの1区間）
export interface ProgramSegment {
  id: string;
  startTime: number;    // 開始時間（ミリ秒）
  endTime: number;      // 終了時間（ミリ秒）
  color: string;        // 色（HEX）
  effect: EffectType;   // エフェクト
}

// プログラム全体
export interface Program {
  id: string;
  name: string;
  segments: ProgramSegment[];
  totalDuration: number; // 総時間（ミリ秒）
  createdAt: Date;
  updatedAt: Date;
}

// セッション状態
export type SessionMode = 'manual' | 'program';

// セッション情報（拡張版）
export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  color: string;
  effect: EffectType;
  connectedUsers: number;
  mode: SessionMode;
  program: Program | null;
  programStartTime: number | null;  // プログラム開始時刻（Unix timestamp）
  isProgramRunning: boolean;
}

// WebSocketイベント
export interface ColorChangeEvent {
  color: string;
  effect: EffectType;
}

export interface ProgramStartEvent {
  program: Program;
  startTime: number;  // サーバー時刻（Unix timestamp）
}

export interface ProgramStopEvent {
  reason: 'manual' | 'completed';
}

export interface ModeChangeEvent {
  mode: SessionMode;
}

export interface SyncStateEvent {
  mode: SessionMode;
  color: string;
  effect: EffectType;
  program: Program | null;
  programStartTime: number | null;
  isProgramRunning: boolean;
  serverTime: number;  // サーバー時刻（同期用）
}
