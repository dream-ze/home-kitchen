/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: '食谱',
        short_name: '食谱',
        description: '菜谱、一周菜单、购物清单和冰箱管理',
        lang: 'zh-CN',
        display: 'standalone',
        start_url: '.',
        background_color: '#F4F5F1',
        theme_color: '#F4F5F1',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // /api 是服务端接口，不能被离线缓存当成页面接管
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // 本地开发：另开一个终端运行 npm run dev:api（Pages 服务端功能），这里把 /api 转过去
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
