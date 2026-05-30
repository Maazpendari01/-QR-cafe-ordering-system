module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        strict: false,
        module: 'commonjs',
        moduleResolution: 'node',
        resolveJsonModule: true,
        skipLibCheck: true,
      }
    }
  },
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 15000,
  verbose: true,
  forceExit: true,
}
