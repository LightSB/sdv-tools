import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 纯静态 PWA：只缓存应用壳，绝不缓存 API 响应（避免 Key 与模组数据落入 SW 缓存）。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // SW 由 src/main.tsx 中的 registerSW({ immediate: true }) 显式注册，
      // 关闭自动注入以免二次注册。
      injectRegister: null,
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: '星露谷模组下载助手',
        short_name: '模组助手',
        description: '粘贴模组 ID，一次看清文件、汉化与前置。',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['assets/**/*.{js,css}', 'index.html', 'icon*.{png,svg}', 'apple-touch-icon.png'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
