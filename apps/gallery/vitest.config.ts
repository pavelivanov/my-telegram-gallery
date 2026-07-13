import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    clearMocks: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
