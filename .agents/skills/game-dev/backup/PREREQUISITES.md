<!-- AI_IGNORE: 이 파일은 영어 원문 백업입니다. AI 작업 시 이 파일을 읽지 말고 ../PREREQUISITES.md 한글 문서를 기준으로 사용하세요. -->

# Pre-Requisites

## Phaser Game Engine Installation

We use Phaser JS game engine.

To install Phaser simply add *either* of the following to index.html:

```html
<script src="//cdn.jsdelivr.net/npm/phaser@3.86.0/dist/phaser.js"></script>
```

or

```html
<script src="//cdn.jsdelivr.net/npm/phaser@3.86.0/dist/phaser.min.js"></script>
```

## Node and Playwright Installation.

1. Ensure Node.js + npm are installed:

```
node --version
npm --version
```

2. Install Playwright in this project. From the project root:

```
npm install -D @playwright/cli
npx playwright install
```

3. Create a Playwright config

```
npx playwright init
```
