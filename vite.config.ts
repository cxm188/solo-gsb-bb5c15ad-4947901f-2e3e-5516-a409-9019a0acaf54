import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 预览服务器监听 8080，与 Dockerfile / compose 保持一致
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
  },
})
