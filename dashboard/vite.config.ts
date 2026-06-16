import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
    allowedHosts: ['siloos.local'],
    hmr: {
      host: '10.0.124.90', // The Pi's static IP address
    },
    watch: {
      usePolling: true, // Recommended for network shares/syncs
    },
    proxy: {
      '/api/v2': {
        target: 'https://c-sar.cropster.com',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            if (proxyRes.statusCode === 401) {
              delete proxyRes.headers['www-authenticate'];
            }
          });
        }
      }
    }
  }
})
