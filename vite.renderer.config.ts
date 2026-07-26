import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    rollupOptions: {
      input: {
        home: path.resolve(__dirname, 'src/renderer/home/index.html'),
        hud: path.resolve(__dirname, 'src/renderer/hud/index.html'),
        audio: path.resolve(__dirname, 'src/renderer/audio/index.html'),
      },
    },
  },
})
