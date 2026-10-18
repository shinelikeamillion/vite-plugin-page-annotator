import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pageAnnotator } from 'vite-plugin-page-annotator';

export default defineConfig({
  plugins: [pageAnnotator(), react()],
});
