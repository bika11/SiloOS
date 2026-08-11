import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
    // Appliance on a trusted LAN accessed by many devices via mDNS name, raw IP,
    // or Tailscale. Allow any Host header so no device gets "Blocked request".
    allowedHosts: true,
    // HMR endpoint is inferred from each client's own connection (works whether a
    // device reached the dashboard via siloos.local, an IP, or Tailscale).
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
