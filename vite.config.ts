import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// 렌더러(React) + Electron 메인/프리로드를 한 번에 빌드.
// 출력: dist/ (렌더러), dist-electron/ (main.js, preload.js)
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
      // 렌더러에서 Node API를 직접 쓰지 않음(preload 브리지만 사용)
      renderer: undefined,
    }),
  ],
})
