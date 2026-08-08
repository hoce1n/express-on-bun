import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Allow the online preview host and any tunnel subdomains.
    allowedHosts: ['.monkeycode-ai.live'],
    // Reverse proxy: forward API calls to the Bun backend so the dashboard
    // and API share one origin in local development (no CORS).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
