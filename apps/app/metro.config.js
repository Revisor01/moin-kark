// Metro für npm-Monorepo: muss den Repo-Root sehen, um @kkd/shared (TS-Quelle)
// aufzulösen und zu transpilieren.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Root mitbeobachten (für packages/shared).
config.watchFolders = [monorepoRoot];

// 2. node_modules sowohl lokal als auch im Root auflösen.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;
