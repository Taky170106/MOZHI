import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    // shadcn convention: "@/..." resolves to src/
    alias: { '@': path.resolve(__dirname, './src') },
    // motion resolves React through its own pre-bundle; without deduping,
    // a second React instance reaches it and every hook reads null context
    dedupe: ['react', 'react-dom'],
  },
  // Every React-consuming dep must go through the same pre-bundle, or Vite
  // hands one of them a second React copy and its hooks read null context.
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'motion/react', 'lucide-react', '@radix-ui/react-slot',
      /* Pulled in by a dynamic import when the camera comes on. Pre-bundling
         it here keeps Vite from re-optimising — and full-page-reloading —
         in the middle of a demo the first time someone hits the toggle. */
      '@tensorflow/tfjs',
    ],
  },
  server: {
    host: '127.0.0.1',
    /* The transcript service runs beside the dev server on 5301. Proxying
       keeps the browser on one origin, so the log is a same-origin fetch in
       development exactly as it is in a packaged build — and no CORS grant
       has to exist for it. */
    proxy: {
      '/api': { target: 'http://127.0.0.1:5301', changeOrigin: false },
      /* The PopSign ASL recogniser (server/islr.py). It is a separate
         process because the model cannot run in the browser — tfjs-tflite
         has no way to resize its one-frame input tensor. Proxied for the
         same reason as the log: one origin, so the page makes a same-origin
         POST and no CORS grant has to exist. */
      '/islr': { target: 'http://127.0.0.1:5302', changeOrigin: false },
      /* Sanket's own recogniser (server/sign.py). Same reason as the two
         above: one origin, so the page makes a same-origin POST. */
      '/sign': { target: 'http://127.0.0.1:5303', changeOrigin: false },
      '/engine': { target: 'http://127.0.0.1:5304', changeOrigin: false },
    },
  },
  build: { target: 'es2020', assetsInlineLimit: 0 },
})
