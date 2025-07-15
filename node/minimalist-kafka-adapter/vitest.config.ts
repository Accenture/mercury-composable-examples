/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true, // Enables global variables like `describe`, `it`, etc.
    // Clears mock history and calls before each test
    clearMocks: true, // Often used alongside restoreMocks
    restoreMocks: true,
    // Equivalent to jest.testMatch
    // Vitest's default includes common patterns like **/*.{test,spec}.?(c|m)[jt]s?(x)
    // You can override it if needed:
    include: ['**/tests/*.test.ts'],
    coverage: {
      enabled: true, // Activate coverage collection
      provider: 'v8', // Equivalent to jest.coverageProvider: 'v8'
      // Equivalent to jest.collectCoverageFrom
      include: ['src/**/*.ts'],
      exclude: [
        'src/preload/preload.ts',     // exclude the preloader because it is auto-generated
        'src/composable-example.ts',  // exclude the main entry point because unit test does not execute it
        'src/workers/*.ts',           // exclude this folder because vitest does not inspect code in worker threads
        'src/**/*.d.ts',
        'dist/**',                    // From coveragePathIgnorePatterns
        'target/**',                  // From coveragePathIgnorePatterns
        'node_modules/**',            // From coveragePathIgnorePatterns (though often default)
        'scripts/**',                 // From coveragePathIgnorePatterns
        'tools/**'                    // From coveragePathIgnorePatterns
        // Add any other patterns to exclude from coverage
      ],
      // Ensures coverage report is generated even for files without tests
      all: true,
    },
    reporters: [
      'default',
      ['junit', { outputFile: 'test-results/test-js.xml' }],
    ]
    // `transform`, `preset`, `extensionsToTreatAsEsm` are generally not needed.
    // Vitest handles TypeScript and ESM out-of-the-box via Vite.
  },
});
