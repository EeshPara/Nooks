import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import WorkspaceErrorBoundary from './WorkspaceErrorBoundary';
import { clearInitialToolData } from './bridge';
import './styles.css';
import './world/world.css';
import './world/nook.css';
import './world/ChatAnchor.css';
import './world/typography.css';
import './world/study-layout.css';
import './world/motion.css';
import './study/document-editor.css';
// React's default caught-error logger includes exception text and component
// details. Study content must never be copied into that diagnostic channel.
createRoot(document.getElementById('root')!, { onCaughtError: () => {} }).render(<React.StrictMode><WorkspaceErrorBoundary onReopen={clearInitialToolData}><App/></WorkspaceErrorBoundary></React.StrictMode>);

import "./world/UnifiedWorkspace.css";
import './world/PopupDismiss.css';

import "./world/CircularControls.css";
