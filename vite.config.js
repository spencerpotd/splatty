import { defineConfig } from 'vite';
import path from 'path';

const useLocalSpark = process.env.USE_LOCAL_SPARK !== '0';

export default defineConfig({
  resolve: {
    alias: useLocalSpark
      ? {
          // Default to the local Spark preview build synced into ./lib.
          '@sparkjsdev/spark': path.resolve(__dirname, './lib/spark.module.js'),
        }
      : {},
  },
  server: {
    port: 3001,
    host: true,
    open: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
