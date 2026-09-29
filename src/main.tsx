import { createRoot } from 'react-dom/client';
import { getMode } from './lib/platform';
import { PhoneApp } from './phone/PhoneApp';
import { BridgeApp } from './bridge/BridgeApp';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';

const mode = getMode();
document.documentElement.dataset.mode = mode;

createRoot(document.getElementById('root')!).render(mode === 'bridge' ? <BridgeApp /> : <PhoneApp />);
