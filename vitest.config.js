import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{shared,server,desktop}/test/**/*.test.js'],
    environment: 'node',
  },
});
