// Runs in CI after `tauri android init`: installs our MainActivity and launcher
// icons, and wires release signing to the keystore described by gen/android/keystore.properties.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const gen = 'src-tauri/gen/android';
const activity = join(gen, 'app/src/main/java/com/gulbidi/neptune/MainActivity.kt');
if (!existsSync(activity)) throw new Error(`Expected generated activity at ${activity}`);
copyFileSync('android/MainActivity.kt', activity);
for (const name of ['PushPlugin.kt', 'PushNotifications.kt']) {
  copyFileSync(join('android', name), join(gen, 'app/src/main/java/com/gulbidi/neptune', name));
}
mkdirSync(join(gen, 'app/src/main/res/drawable'), { recursive: true });
copyFileSync('android/ic_notification.xml', join(gen, 'app/src/main/res/drawable/ic_notification.xml'));

const firebasePath = 'android/google-services.json';
if (!existsSync(firebasePath)) throw new Error('Add android/google-services.json from the Neptune Firebase Android app before building.');
const firebase = JSON.parse(readFileSync(firebasePath, 'utf8'));
const unsigned = process.argv.includes('--unsigned');
if (firebase.project_info?.project_id === 'neptune-build-test' && !unsigned) {
  throw new Error('The test Firebase project must never be used for a release.');
}
if (!firebase.client?.some((c) => c.client_info?.android_client_info?.package_name === 'com.gulbidi.neptune')) {
  throw new Error('Firebase configuration must register com.gulbidi.neptune.');
}
copyFileSync(firebasePath, join(gen, 'app/google-services.json'));

const rootGradlePath = join(gen, 'build.gradle.kts');
let rootGradle = readFileSync(rootGradlePath, 'utf8');
if (!rootGradle.includes('com.google.gms.google-services') && !rootGradle.includes('com.google.gms:google-services')) {
  if (/plugins\s*\{/.test(rootGradle)) {
    rootGradle = rootGradle.replace(/plugins\s*\{/, 'plugins {\n    id("com.google.gms.google-services") version "4.5.0" apply false');
  } else {
    // Tauri's generated root uses buildscript/classpath rather than a plugins block.
    rootGradle = rootGradle.replace(/dependencies\s*\{/, 'dependencies {\n        classpath("com.google.gms:google-services:4.5.0")');
  }
}
if (!rootGradle.includes('com.google.gms.google-services') && !rootGradle.includes('com.google.gms:google-services')) {
  throw new Error('Could not add Google Services to root Gradle plugins.');
}
writeFileSync(rootGradlePath, rootGradle);

const manifestPath = join(gen, 'app/src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('NeptuneMessagingService')) {
  manifest = manifest.replace('</application>', `
        <service android:name=".NeptuneMessagingService" android:exported="false">
            <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter>
        </service>
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="neptune_replies" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_notification" />
    </application>`);
}
if (!manifest.includes('NeptuneMessagingService')) throw new Error('Could not register the FCM service.');
if (!manifest.includes('android.permission.POST_NOTIFICATIONS')) {
  manifest = manifest.replace('<application', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <application');
}
writeFileSync(manifestPath, manifest);

// `tauri android init` generates the project with Tauri's stock launcher icon.
cpSync('src-tauri/icons/android', join(gen, 'app/src/main/res'), { recursive: true, force: true });

const gradlePath = join(gen, 'app/build.gradle.kts');
let gradle = readFileSync(gradlePath, 'utf8');
if (!gradle.includes('com.google.gms.google-services')) {
  gradle = gradle.replace(/plugins\s*\{/, 'plugins {\n    id("com.google.gms.google-services")');
}
if (!gradle.includes('firebase-messaging')) {
  gradle = gradle.replace(/dependencies\s*\{/, `dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")`);
}
if (!gradle.includes('firebase-messaging') || !gradle.includes('com.google.gms.google-services')) {
  throw new Error('Could not add Firebase messaging to the generated app.');
}

if (!unsigned && !gradle.includes('signingConfigs')) {
  // Inside `android {}` a bare `java.` resolves to the Android `java` extension,
  // so these must be imported rather than fully qualified.
  for (const imp of ['java.io.FileInputStream', 'java.util.Properties']) {
    if (!gradle.includes(`import ${imp}\n`)) gradle = `import ${imp}\n${gradle}`;
  }
  gradle = gradle.replace(
    /android \{\n/,
    `android {
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
`,
  );
  gradle = gradle.replace(
    /getByName\("release"\) \{\n/,
    `getByName("release") {\n            signingConfig = signingConfigs.getByName("release")\n`,
  );
}
if (!unsigned && !gradle.includes('signingConfigs.getByName("release")')) {
  throw new Error('Failed to patch release signing into build.gradle.kts');
}
writeFileSync(gradlePath, gradle);
console.log('Android project prepared');
