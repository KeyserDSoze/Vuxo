import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './i18n';
import './styles.css';
import { VuxoThemeProvider } from './theme/VuxoThemeProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VuxoThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </VuxoThemeProvider>
  </React.StrictMode>
);
