/// <reference types="vite/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { OemConfigProvider } from './OemConfigContext';
import { ErrorBoundary } from './ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <OemConfigProvider>
        <App />
      </OemConfigProvider>
    </ErrorBoundary>
  </StrictMode>,
);
