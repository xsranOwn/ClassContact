import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 固定前端根目录:支持从项目根目录 `vite --config client/vite.config.js` 运行
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // 自定义 service worker:处理 Web Push(前台聚焦抑制、后台/离线弹通知)
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      manifest: {
        name: '班级沟通',
        short_name: '班级沟通',
        description: '教师与班级大屏实时沟通',
        lang: 'zh-CN',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        // PWA 系统分享入口:从系统分享菜单「分享到本应用」接收文本/任意类型文件
        share_target: {
          action: '/share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['*/*'] }],
          },
        },
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,svg,png,woff2}'],
      },
    }),
  ],
});
