import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// 应用壳由 Service Worker 接管；API 响应不进入缓存（见 vite.config.ts）。
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) {
  throw new Error('未找到 #root 挂载节点');
}

createRoot(container).render(<App />);
