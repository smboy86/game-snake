Original prompt: snake-game에 대한 기본 골격 문서를 작성하고, 게임 규칙을 PRD로 정리한다.

# Progress

## Working

- `.agents/skills/game-dev` 개발 지침이 준비되어 있습니다.
- Snake Game의 기본 PRD를 `DESIGN-DOCUMENT.md`에 작성했습니다.
- 보완 질문 답변을 반영해 충돌, 조작, 성장, 필드, 카메라, 승리 조건을 확정했습니다.
- Phaser CDN 기반의 첫 실행 골격을 추가했습니다.
- 모바일 화면 방향 터치, 8방향 이동, 사과, 레벨 성장, 중앙 고정 카메라, 충돌 반전 규칙을 구현했습니다.
- `window.render_game_to_text()`와 `window.advanceTime(ms)` 테스트 훅을 추가했습니다.
- Headless 스크린샷이 검게 캡처되는 문제를 피하기 위해 Phaser 렌더러를 Canvas로 고정했습니다.
- Playwright smoke test를 실행해 화면 방향 터치, 상태 출력, 스크린샷 캡처를 확인했습니다.
- 사과 획득 시 레벨 2, 길이 2, 몸 크기 13으로 증가하는 것을 확인했습니다.
- 필드 벽 충돌 시 `wall-bounce`와 반대 방향 전환을 확인했습니다.
- 자기 몸 충돌 상황을 주입해 `body-bounce`와 반대 방향 전환을 확인했습니다.
- 필드를 100x100칸에서 50x50칸으로 줄였습니다.
- 사과 먹기 판정을 머리 중심 기준 반경 3칸으로 넓혔습니다.
- 벽/꼬리 충돌 반사를 축 기반 반사각 규칙으로 바꾸고, 반사 위치가 막혀 있으면 안전한 8방향 랜덤 방향을 선택하도록 했습니다.
- 기본 Playwright smoke test를 다시 실행해 `50x50` 필드와 `appleEatRadiusCells: 3` 상태 출력을 확인했습니다.
- 사과 중심에서 3칸 떨어진 머리 위치에서 사과 획득이 발생하는 것을 확인했습니다.
- 대각선 벽 충돌이 `down-right`에서 `up-left`로 반사되는 것을 확인했습니다.
- 꼬리 충돌이 반사각 규칙을 따라 `right`에서 `left`로 반사되는 것을 확인했습니다.
- 반사 위치가 막힌 꼬리 충돌에서 `body-bounce-random`으로 안전 방향이 선택되는 것을 확인했습니다.
- Expo + `react-native-webview` 기반 Android 실행 껍데기를 추가했습니다.
- `scripts/bundle-game-html.mjs`로 Phaser, CSS, 게임 JS를 단일 HTML 문자열로 묶어 `src/generated/gameHtml.ts`를 생성하도록 했습니다.
- Phaser CDN 의존을 제거하고 로컬 `vendor/phaser.min.js`를 사용하도록 바꿨습니다.
- `app.json`, `eas.json`, `App.tsx`, `tsconfig.json`을 추가했습니다.
- Expo SDK 55 호환성 체크에서 의존성이 최신 상태임을 확인했습니다.
- Android platform 대상으로 `npx expo export`를 실행해 Metro 번들링을 확인했습니다.

## Not Working

- 사과 생성은 현재 전체 50x50 필드 빈 칸 랜덤입니다.
- 벽 충돌 피드백은 현재 중앙 원 색상 변화로만 표시합니다.

## TODO

- 실제 모바일 비율에서 터치 영역이 자연스러운지 확인합니다.
- 사과를 플레이어 근처에 생성할지 전체 필드 랜덤으로 둘지 추가 결정합니다.
- 벽 충돌 피드백을 더 명확하게 만들지 검토합니다.
- Playwright 테스트 시나리오를 npm script로 더 세분화합니다.
- 실제 Android 기기에서 `npm run expo:start` 후 QR 실행을 확인합니다.
- EAS development build로 Android `.apk` 설치 테스트를 확인합니다.

## Decisions

- 게임 설계 원본은 루트의 `DESIGN-DOCUMENT.md`에 기록합니다.
- 개발 진행상황은 루트의 `PROGRESS.md`에 기록합니다.
- `.agents/skills/game-dev` 문서는 AI 개발 작업 지침으로 유지합니다.
- 초기 필드 크기는 50x50칸으로 확정합니다.
- 조작은 화면 방향 터치 방식으로 확정합니다.
- 화면은 뱀 머리를 항상 중앙에 고정합니다.
- 뱀 길이는 레벨과 같은 칸 수로 확정합니다.
- 뱀 몸 크기는 매 레벨 증가합니다.
- 자기 몸 충돌과 필드 벽 충돌은 게임오버가 아니라 반사각 기반 방향 전환으로 처리합니다.
- 승리 조건 없이 무한 성장 플레이로 진행합니다.
- 몸 크기는 초기 구현에서 레벨마다 1px씩 증가하고 최대 26px로 제한합니다.
- 사과는 초기 구현에서 전체 필드의 빈 칸에 랜덤 생성합니다.
- 사과 먹기 판정은 `칸(cell)` 단위로 표현하며 현재 반경은 3칸입니다.
- 벽 충돌은 벽 축 기준으로 진행 방향을 반사합니다.
- 꼬리 충돌은 충돌한 꼬리 칸과 진행 방향을 기준으로 방향을 반사합니다.
- 반사 후 다음 위치가 막혀 있으면 안전한 8방향 중 하나를 랜덤 선택합니다.
- Android 모바일 실행은 Expo WebView 래핑 방식으로 진행합니다.
- Expo WebView는 generated HTML을 로드하며, Phaser는 로컬 vendored 파일을 번들에 inline 합니다.
- Expo SDK 55 실행에는 Node.js `>=20.19.4`를 사용합니다.
