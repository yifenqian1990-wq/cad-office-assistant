import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

if (typeof window !== 'undefined') {
  if (!window.crypto) {
    (window as any).crypto = {};
  }
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      }) as `${string}-${string}-${string}-${string}-${string}`;
    };
  }
}

import App from './App.tsx';
import './index.css';
import { DrawingLibraryProvider } from './hooks/useDrawingLibrary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DrawingLibraryProvider>
      <App />
    </DrawingLibraryProvider>
  </StrictMode>,
);

