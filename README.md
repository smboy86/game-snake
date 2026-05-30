# 모험-스네이크

자 이제 시작

## Web

```sh
npm run serve
```

브라우저에서 `http://127.0.0.1:8000`을 엽니다.

## Expo Android

Expo SDK 55 기준 Node.js `>=20.19.4`가 필요합니다.

```sh
npm run game:bundle
npm run expo:start
```

Android 기기에서 QR 코드를 스캔해 실행합니다.

Android 설치형 APK는 아래 흐름을 사용합니다.

```sh
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

`preview` profile은 Android 실기기 설치용 `.apk`를 만들도록 설정되어 있습니다.

## apk 만들기

```sh
npm run game:bundle
```

```sh
npx expo prebuild --platform android --clean
```

```sh
cd android
./gradlew assembleRelease
```

```sh
cd ..
mkdir -p output/apk
cp android/app/build/outputs/apk/release/app-release.apk output/apk/game-snake-preview.apk
```
