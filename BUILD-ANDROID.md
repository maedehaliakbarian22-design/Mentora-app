# Build a debug APK on Windows (Mentora demo)

Status: the scratch environment could not build the APK (no Android SDK, no npm registry, no Google Maven). Run these steps on your own Windows machine.

## 0. Required once
1. JDK 17 (Eclipse Temurin 17). Set JAVA_HOME to its folder. Capacitor 6 targets Java 17.
2. Android SDK: install Android Studio (it installs the SDK) or the command-line tools.
   In the SDK Manager install: Platform 35 (or 36), Build-Tools 35.0.0, Platform-Tools.
   Set ANDROID_HOME to the SDK folder (for example C:\Users\<you>\AppData\Local\Android\Sdk).
3. Node.js 20 or 24 (you already have 24).

## 1. Add the Vazirmatn font (required; the build will not show Persian typography without it)
Put these two files in www\fonts\ with these exact names:
- Vazirmatn-Regular.woff2
- Vazirmatn-Bold.woff2
Get them from the official project: https://github.com/rastikerdar/vazirmatn (Releases). Find the .woff2 files inside the release archive and rename them as above.
Alternatively, upload the two .woff2 files to the chat and they will be placed for you.

## 2. Build (PowerShell, in the project folder)
    npm install
    npx cap add android
    npx cap sync android
    cd android
    .\gradlew.bat assembleDebug
    cd ..

Output: android\app\build\outputs\apk\debug\app-debug.apk

## 3. Check the package ID
    & "$env:ANDROID_HOME\build-tools\35.0.0\aapt.exe" dump badging android\app\build\outputs\apk\debug\app-debug.apk | Select-String "package:"
Expected: name='com.mentora.app'

## 4. Install on the Galaxy A16 (physical device)
1. Copy app-debug.apk to the phone.
2. Open it from the Files app and allow installing from that source.
3. Or with USB debugging: adb install -r android\app\build\outputs\apk\debug\app-debug.apk

Only treat the app as working on your phone after you have installed and tested it there.
