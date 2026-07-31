import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App.js';
import { useAppStore } from './state/app-store.js';
import './styles/app.css';

/**
 * Entry point. Mounts React and registers the service worker.
 *
 * Updates are offered, never forced: reloading under a player mid-duel would
 * cost them the match, so the store records that an update is waiting and the UI
 * surfaces it at a safe moment.
 */

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerSW({
  onNeedRefresh: () => useAppStore.getState().setUpdateAvailable(true),
});
