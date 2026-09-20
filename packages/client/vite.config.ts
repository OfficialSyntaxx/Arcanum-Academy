import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Build configuration.
 *
 * Two decisions worth stating:
 *
 * 1. Manual chunks split Three.js and its slower-changing loader add-ons away
 *    from the UI and renderer bootstrap. Routine application releases can then
 *    reuse those cached vendor layers instead of replacing one monolithic file.
 * 2. The service worker uses `injectManifest`-free `generateSW` with a network-
 *    first policy for the API and cache-first for hashed assets, so a returning
 *    player on a poor connection still gets a shell instantly.
 */
export default defineConfig({
  build: {
    target: 'es2022',
    // No source-map consumer is configured in production. Shipping public maps
    // adds several MiB to every deploy without improving the in-game diagnostic
    // report, while local typecheck and dev tooling retain their normal maps.
    sourcemap: false,
    // TypeScript emits project-reference artefacts here before Vite runs.
    // Always clear them, along with obsolete hashed chunks, before bundling.
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/examples/jsm/')) return 'three-addons';
          if (id.includes('/node_modules/three/')) return 'three';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          )
            return 'react';
          return undefined;
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
        sourcemap: false,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,glb,wasm}'],
        // Later-zone encounter models are not part of the first Shorelands
        // session. Cache them after their first real use instead of delaying
        // service-worker installation for every new player.
        globIgnores: [
          '**/assets/armabee-*.glb',
          '**/assets/ghost-*.glb',
          '**/assets/ghost-skull-*.glb',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(?:armabee|ghost|ghost-skull)-[^/]+\.glb$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'encounter-models',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
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
