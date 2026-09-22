import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', '.keystone', 'generated'],
    globalSetup: ['./tests/helpers/global-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['*.ts', '!*.config.ts'],
      // No thresholds yet — set them once there's a real coverage baseline to
      // measure against, not a number picked without data.
    },
  },
})
