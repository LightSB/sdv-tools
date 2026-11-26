import { defineConfig } from 'vitest/config';

// 独立测试配置：不加载 vite.config.ts 中的 VitePWA 插件，避免测试期副作用。
// 测试文件统一放 tests/ 目录，与 src 编译隔离（tsconfig include 仅含 src / vite.config.ts）。
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
});
