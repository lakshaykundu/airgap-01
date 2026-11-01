import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:3000';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  envDir: '../..',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'AIRGAP/01 — Offline-first Operations Console',
        short_name: 'AIRGAP/01',
        description: 'NO SIGNAL. STILL IN CONTROL. An offline-first operations console demo.',
        theme_color: '#05070d',
        background_color: '#05070d',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: every built asset (JS chunks incl. lazy routes, CSS, fonts, icons).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        // API traffic is never served from the SW cache: data lives in IndexedDB.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // First install controls the open page immediately; later updates wait for the user (prompt).
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split stable vendor code into long-lived cacheable chunks. Only
        // libraries that depend on nothing but React are grouped by hand;
        // forcing modules with wider dependency graphs into shared chunks can
        // create circular chunk imports (TDZ errors at startup).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id)) return 'motion';
          if (/[\\/](dexie|dexie-react-hooks)[\\/]/.test(id)) return 'dexie';
          if (/[\\/](@reduxjs|immer|reselect|redux)[\\/]/.test(id)) return 'redux';
          if (/[\\/]zod[\\/]/.test(id)) return 'zod';
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'icons';
          return undefined;
        },
      },
    },
  },
});
