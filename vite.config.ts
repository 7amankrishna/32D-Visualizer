import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // the Arena preview proxies the app under a sandbox-specific host
    allowedHosts: true,
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
