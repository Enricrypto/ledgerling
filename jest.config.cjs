/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  // Exclude live integration tests from the default run.
  // Run them explicitly with: LIVE_TEST=1 npm run test:live
  testPathIgnorePatterns: ["/node_modules/", "/src/e2e/"],
  // Remap relative .js imports → .ts so TypeScript's nodenext module
  // resolution and jest's resolver agree. Only applies to relative paths.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.jest.json",
      },
    ],
  },
}
