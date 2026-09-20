import { readFileSync, writeFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 4)}\n`);

const packageJson = readJson('package.json');
const manifest = readJson('manifest.json');
const versions = readJson('versions.json');

const version = packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`package.json version must be strict x.y.z SemVer, got: ${version}`);
}

if (!manifest.minAppVersion) {
  throw new Error('manifest.json is missing minAppVersion');
}

manifest.version = version;
versions[version] = manifest.minAppVersion;

writeJson('manifest.json', manifest);
writeJson('versions.json', versions);

console.log(`Updated manifest.json and versions.json to ${version}`);
