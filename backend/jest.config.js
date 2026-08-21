/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  setupFiles: ['./src/test-setup.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Override to CommonJS so Jest's require-based loader works
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
        },
      },
    ],
  },
};
