import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
    hmr: {
      host: '10.0.124.90', // The Pi's IP address
    },
    watch: {
      usePolling: true, // Recommended for network shares/syncs
    }
  }
})
