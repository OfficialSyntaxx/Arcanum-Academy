import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App.js';
import './styles/app.css';

/**
 * Entry point. Mounts React and registers the service worker.
 *
 * The game has no session-in-progress that can be lost at the application
 * shell boundary, so installs take a new build automatically. This prevents a
 * phone from keeping an old input handler after a production repair.
 */

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerSW({ immediate: true });
