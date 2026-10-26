import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { listenForInstallPrompt } from './ui/install';
import './styles.css';

listenForInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
