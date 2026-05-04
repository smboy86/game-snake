# 사전 준비사항

## Phaser 게임 엔진 설치

이 프로젝트는 Phaser JS 게임 엔진을 사용합니다.

Phaser를 설치하려면 `index.html`에 아래 스크립트 중 하나를 추가합니다.

```html
<script src="//cdn.jsdelivr.net/npm/phaser@3.86.0/dist/phaser.js"></script>
```

또는

```html
<script src="//cdn.jsdelivr.net/npm/phaser@3.86.0/dist/phaser.min.js"></script>
```

## Node와 Playwright 설치

1. Node.js와 npm이 설치되어 있는지 확인합니다.

```
node --version
npm --version
```

2. 프로젝트 루트에서 Playwright를 설치합니다.

```
npm install -D @playwright/cli
npx playwright install
```

3. Playwright 설정을 생성합니다.

```
npx playwright init
```
