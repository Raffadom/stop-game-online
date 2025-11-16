module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  forceExit: true,
  detectOpenHandles: false,
  testPathIgnorePatterns: [
    'multi-player-reload.test.js',
    'ranking-validation.test.js', 
    'multi-player-reload-simple.test.js',
    'quick-reload.test.js'
  ],
  testMatch: [
    '**/__tests__/unit-tests.test.js',
    '**/__tests__/game-logic.test.js',
    '**/__tests__/socket.test.js',
    '**/__tests__/simple-ranking.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    'index.js',
    '!**/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};