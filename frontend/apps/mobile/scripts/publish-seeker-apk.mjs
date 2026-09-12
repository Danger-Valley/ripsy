#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const [apkPath, versionName, versionCode] = process.argv.slice(2);

if (!apkPath || !versionName || !versionCode) {
  console.error('Usage: publish-seeker-apk.mjs <apk-path> <version-name> <version-code>');
  process.exit(2);
}

const repository = process.env.RIPSY_GITHUB_REPOSITORY || 'Danger-Valley/ripsy-downloads';
const releaseTag = process.env.RIPSY_SEEKER_RELEASE_TAG || 'seeker-latest';
const assetName = 'ripsy-seeker.apk';
const apiRoot = `https://api.github.com/repos/${repository}`;
const credentialHelper = '/Applications/Xcode.app/Contents/Developer/usr/libexec/git-core/git-credential-osxkeychain';

const token = process.env.GITHUB_TOKEN || readGitHubToken();
if (!token) {
  throw new Error('GitHub credential is unavailable. Set GITHUB_TOKEN or sign in to GitHub in macOS Keychain.');
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'ripsy-seeker-publisher',
};

let releaseResponse = await githubRequest(`${apiRoot}/releases/tags/${releaseTag}`, { allowNotFound: true });
let release;
if (releaseResponse === null) {
  release = await githubRequest(`${apiRoot}/releases`, {
    method: 'POST',
    json: releaseMetadata(),
  });
} else {
  release = await githubRequest(`${apiRoot}/releases/${releaseResponse.id}`, {
    method: 'PATCH',
    json: releaseMetadata(),
  });
}

const existingAsset = release.assets?.find(asset => asset.name === assetName);
if (existingAsset) {
  await githubRequest(`${apiRoot}/releases/assets/${existingAsset.id}`, { method: 'DELETE', expectEmpty: true });
}

const apk = await readFile(apkPath);
const uploadUrl = `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}&label=${encodeURIComponent(`RIPSY ${versionName} (${versionCode}) — Seeker APK`)}`;
const uploadedAsset = await githubRequest(uploadUrl, {
  method: 'POST',
  body: apk,
  contentType: 'application/vnd.android.package-archive',
});

console.log(`Published Seeker APK: ${uploadedAsset.browser_download_url}`);

function releaseMetadata() {
  return {
    tag_name: releaseTag,
    target_commitish: 'main',
    name: `RIPSY Android ${versionName} (${versionCode})`,
    body: [
      'Latest RIPSY Android build optimized for Seeker.',
      '',
      `Version ${versionName} · build ${versionCode}`,
      '',
      'Download: https://ripsy.fun/download',
    ].join('\n'),
    draft: false,
    prerelease: false,
    make_latest: 'true',
  };
}

function readGitHubToken() {
  const result = spawnSync(
    'git',
    ['-c', `credential.helper=${credentialHelper}`, 'credential', 'fill'],
    { encoding: 'utf8', input: 'protocol=https\nhost=github.com\n\n' },
  );
  if (result.status !== 0) return '';
  const password = result.stdout.split('\n').find(line => line.startsWith('password='));
  return password?.slice('password='.length) || '';
}

async function githubRequest(url, { allowNotFound = false, body, contentType, expectEmpty = false, json, method = 'GET' } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : body,
  });
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API ${method} ${response.status}: ${details.slice(0, 500)}`);
  }
  if (expectEmpty || response.status === 204) return null;
  return response.json();
}
