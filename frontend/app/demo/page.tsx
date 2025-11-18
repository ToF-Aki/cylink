'use client';

import { useState, useEffect } from 'react';

// デモ用カラーシーケンス
const DEMO_COLORS = [
  { name: '赤', color: '#FF0000', duration: 3000 },
  { name: 'オレンジ', color: '#FF8800', duration: 3000 },
  { name: '黄', color: '#FFFF00', duration: 3000 },
  { name: '緑', color: '#00FF00', duration: 3000 },
  { name: '青', color: '#0088FF', duration: 3000 },
  { name: '紫', color: '#8800FF', duration: 3000 },
  { name: 'ピンク', color: '#FF00FF', duration: 3000 },
  { name: '白', color: '#FFFFFF', duration: 3000 },
];

export default function DemoPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [color, setColor] = useState(DEMO_COLORS[0].color);
  const [colorName, setColorName] = useState(DEMO_COLORS[0].name);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % DEMO_COLORS.length;
        setColor(DEMO_COLORS[nextIndex].color);
        setColorName(DEMO_COLORS[nextIndex].name);
        return nextIndex;
      });
    }, DEMO_COLORS[currentIndex].duration);

    return () => clearInterval(interval);
  }, [currentIndex]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: color,
        transition: 'background-color 1s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* カラー名表示 */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: color === '#FFFFFF' || color === '#FFFF00' ? '#000000' : '#FFFFFF',
            textShadow: color === '#FFFFFF' || color === '#FFFF00' ? 'none' : '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          {colorName}
        </h1>
      </div>

      {/* デモラベル */}
      <div
        style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0,0,0,0.2)',
          borderRadius: '9999px',
          padding: '12px 24px',
          backdropFilter: 'blur(4px)',
        }}
      >
        <p
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: color === '#FFFFFF' || color === '#FFFF00' ? '#000000' : '#FFFFFF',
          }}
        >
          Cylink Demo - 自動カラー切り替え
        </p>
      </div>
    </div>
  );
}
