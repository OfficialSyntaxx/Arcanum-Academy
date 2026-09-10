import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Build configuration.
 *
 * Two decisions worth stating:
 *
 * 1. Manual chunks split three.js away from the UI bundle. The deck builder,
 *    market and collection screens are 2D; a player who opens the app to check
 *    a crafting queue should not pay for the renderer.
 * 2. The service worker uses `injectManifest`-free `generateSW` with a network-
 *    first policy for the API and cache-first for hashed assets, so a returning
 *    player on a poor connection still gets a shell instantly.
 */
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['terminal.local'],
    proxy: { '/gateway': { target: 'ws://127.0.0.1:8787', ws: true } },
  },
  plugins: [
    react(),
    VitePWA({
      // A game shell must not remain on an old interaction build indefinitely.
      // Hashed assets make this safe: a reload is always internally consistent.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Alderfell',
        short_name: 'Alderfell',
        description: 'Explore a fallen realm, gather resources and master your craft in Alderfell.',
        theme_color: '#0c0a08',
        background_color: '#0c0a08',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,glb,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /\/(healthz|version|metrics)$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
});
