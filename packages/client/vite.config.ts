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
  server: { port: 5173, host: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'The Arcanum Academy',
        short_name: 'Arcanum',
        description: 'Gather, scribe, grade and duel in a living magical academy.',
        theme_color: '#11161d',
        background_color: '#11161d',
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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
