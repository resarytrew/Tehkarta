import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate.js';
import './styles.css';
import './methodology.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element was not found.');

createRoot(root).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>
);
