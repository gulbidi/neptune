import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('prepares a buildscript-style Android project idempotently and rejects fake release config', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const temp = mkdtempSync(join(tmpdir(), 'neptune-android-'));
  const gen = join(temp, 'src-tauri/gen/android');
  const app = join(gen, 'app');
  try {
    mkdirSync(join(app, 'src/main/java/com/gulbidi/neptune'), { recursive: true });
    mkdirSync(join(temp, 'src-tauri/icons/android'), { recursive: true });
    cpSync(join(root, 'android'), join(temp, 'android'), { recursive: true });
    cpSync(join(root, 'android/google-services.example.json'), join(temp, 'android/google-services.json'));
    writeFileSync(join(app, 'src/main/java/com/gulbidi/neptune/MainActivity.kt'), '');
    writeFileSync(join(gen, 'build.gradle.kts'), 'buildscript {\n    repositories { google() }\n    dependencies {\n        classpath("com.android.tools.build:gradle:8.9.1")\n    }\n}\n');
    writeFileSync(join(app, 'build.gradle.kts'), 'plugins {\n    id("com.android.application")\n}\nandroid {\n    buildTypes {\n        getByName("release") {\n        }\n    }\n}\ndependencies {\n}\n');
    writeFileSync(join(app, 'src/main/AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application></application></manifest>');
    const script = join(root, 'scripts/prepare-android.mjs');
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, [script, '--unsigned'], { cwd: temp, stdio: 'pipe' });
    const gradle = readFileSync(join(gen, 'build.gradle.kts'), 'utf8');
    const manifest = readFileSync(join(app, 'src/main/AndroidManifest.xml'), 'utf8');
    expect(gradle.match(/com.google.gms:google-services/g)).toHaveLength(1);
    expect(manifest.match(/NeptuneMessagingService/g)).toHaveLength(1);
    expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
    expect(readFileSync(join(app, 'build.gradle.kts'), 'utf8')).toContain('firebase-messaging');
    expect(() => execFileSync(process.execPath, [script], { cwd: temp, stdio: 'pipe' })).toThrow('test Firebase project must never be used for a release');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
