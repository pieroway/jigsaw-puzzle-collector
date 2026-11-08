import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: ['frontend'], watch: { usePolling: true, interval: 1000 }, proxy: { '/api': { target: 'http://api', changeOrigin: true } } } });
