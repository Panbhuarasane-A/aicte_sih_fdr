import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { PortalProvider } from './context/PortalContext.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <PortalProvider>
      <App />
    </PortalProvider>
  </HashRouter>
);