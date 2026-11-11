import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base relativa: el sitio funciona en cualquier subcarpeta de GitHub Pages
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
