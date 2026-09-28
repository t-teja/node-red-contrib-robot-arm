import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

const LIBRARY_NAME = 'robot-arm-widgets'

function copyUmToResources () {
  return {
    name: 'copy-umd-to-resources',
    closeBundle () {
      const src = resolve(__dirname, `./ui/dist/${LIBRARY_NAME}.umd.js`)
      const destDir = resolve(__dirname, 'resources')
      const dest = resolve(destDir, `${LIBRARY_NAME}.umd.js`)
      if (!existsSync(src)) {
        console.warn('UMD not found at', src)
        return
      }
      mkdirSync(destDir, { recursive: true })
      copyFileSync(src, dest)
      console.log('Copied', src, '→', dest)
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    cssInjectedByJsPlugin(),
    copyUmToResources()
  ],
  build: {
    sourcemap: process.env.NODE_ENV === 'development',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'ui/index.js'),
      name: LIBRARY_NAME,
      formats: ['umd'],
      fileName: (format) => `${LIBRARY_NAME}.${format}.js`
    },
    outDir: './ui/dist',
    rollupOptions: {
      external: ['vue', 'vuex'],
      output: {
        globals: {
          vue: 'Vue',
          vuex: 'vuex'
        }
      }
    }
  }
})
