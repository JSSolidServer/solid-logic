module.exports = {
  verbose: true,
  testEnvironment: 'node',
  globals: {
    crypto: require('crypto')
  },
  moduleNameMapper: {
    "^jose-node-cjs-runtime/(.*)$": "jose-node-cjs-runtime/dist/node/cjs/$1"
  },
  testEnvironmentOptions: {
      customExportConditions: ['node']
  },
  setupFilesAfterEnv: [
    './test/helpers/setup.ts'
  ]
}
