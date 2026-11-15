import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/** Separate entrypoint. Never bundles wallet, exchange, deployment or PHP code. */
export default defineConfig({
  base: '/Rholox/observer-console-v11/',
  plugins: [
    react(),
    {
      name: 'mirror-fail-closed-csp',
      apply: 'build',
      transformIndexHtml() {
        return [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://testnet.rhobot.net; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          },
          injectTo: 'head-prepend',
        }]
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: 'dist-observer-mirror',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: resolve(process.cwd(), 'observer-mirror/index.html'),
    },
  },
})