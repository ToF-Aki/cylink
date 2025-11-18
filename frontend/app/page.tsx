'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-4xl font-bold text-center text-indigo-600 mb-2">
          Cylink
        </h1>
        <p className="text-center text-gray-600 mb-8">
          スマホをライトに変えて、イベントを盛り上げる
        </p>

        <div className="space-y-4">
          <button
            onClick={() => router.push('/admin')}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-lg transition duration-200 shadow-lg"
          >
            管理者としてイベントを作成
          </button>

          <button
            onClick={() => router.push('/join')}
            className="w-full bg-white hover:bg-gray-50 text-indigo-600 font-bold py-4 px-6 rounded-lg border-2 border-indigo-600 transition duration-200"
          >
            イベントに参加
          </button>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>管理者: イベントを作成してQRコードを生成</p>
          <p>参加者: QRコードをスキャンしてライトに参加</p>
        </div>
      </div>
    </div>
  );
}
