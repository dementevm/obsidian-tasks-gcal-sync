import { readFileSync, writeFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const targetVersion = process.env.npm_package_version ?? packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
    throw new Error(`Version must use strict x.y.z SemVer; got "${targetVersion}"`);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (typeof manifest.minAppVersion !== 'string' || manifest.minAppVersion.length === 0) {
    throw new Error('manifest.json must define minAppVersion');
}

manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = manifest.minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, 4) + '\n');

console.log(`Release metadata updated to ${targetVersion}`);
