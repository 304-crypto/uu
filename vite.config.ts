
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Render나 Vercel의 시스템 환경변수도 로드하도록 설정
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // 빌드 타임에 process.env.API_KEY를 실제 값으로 치환
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    server: {
      port: 3000,
      open: true
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'terser'
    }
  };
});
