# 테스트 / 실행

3) 게임을 로컬에서 실행합니다.
- 프로젝트 루트에서 로컬 웹 서버를 시작합니다.
  python3 -m http.server 8000
- 게임 URL:
  http://127.0.0.1:8000

4) Playwright 브라우저 세션을 엽니다.
- 같은 브라우저에 여러 명령을 실행할 수 있도록 이름 있는 세션을 사용합니다.
  npx playwright-cli -s=gothic open http://127.0.0.1:8000 --headed

5) 기본 게임 루프 테스트 흐름
- 스크린샷을 캡처합니다.
  npx playwright-cli -s=gothic screenshot --filename output/playwright/smoke-1.png
- 메뉴 또는 게임 시작 키를 누릅니다.
  npx playwright-cli -s=gothic press Enter
  npx playwright-cli -s=gothic press Enter
- 게임 내부 상태 텍스트 훅을 확인합니다.
  npx playwright-cli -s=gothic eval "() => window.render_game_to_text()"
- 짧은 시간 동안 플레이어를 이동합니다.
  npx playwright-cli -s=gothic keydown d
  npx playwright-cli -s=gothic eval "async () => { await new Promise((r) => setTimeout(r, 600)); return window.render_game_to_text(); }"
  npx playwright-cli -s=gothic keyup d
- 점프와 공격을 테스트합니다.
  npx playwright-cli -s=gothic press w
  npx playwright-cli -s=gothic press j
  npx playwright-cli -s=gothic press k
- 두 번째 스크린샷을 캡처합니다.
  npx playwright-cli -s=gothic screenshot --filename output/playwright/smoke-2.png

6) 이 프로젝트에서 유용한 확인 명령
- 현재 씬과 상태:
  npx playwright-cli -s=gothic eval "() => window.render_game_to_text()"
- 일시정지와 재개:
  npx playwright-cli -s=gothic press Escape
  npx playwright-cli -s=gothic press Escape
- 스크립트 기반 강제 상태 확인:
  npx playwright-cli -s=gothic run-code "(async (page) => { return await page.evaluate(() => window.render_game_to_text()); })"

7) 정리
- Playwright 세션을 닫습니다.
  npx playwright-cli -s=gothic close
- 로컬 서버를 중지합니다. 서버 터미널에서 Ctrl+C를 누릅니다.

참고
- 스크린샷은 아래 폴더에 보관합니다.
  output/playwright/
- 요소 참조가 오래되어 맞지 않으면 아래 명령을 실행합니다.
  npx playwright-cli -s=gothic snapshot
- 브라우저 세션이 멈춘 경우:
  npx playwright-cli kill-all

## 테스트 체크리스트

요청으로 추가된 새 기능과, 변경된 로직이 영향을 줄 수 있는 영역을 테스트합니다.
문제를 찾으면 수정하고 테스트를 다시 실행해 해결 여부를 확인합니다.

테스트해야 할 항목 예시는 다음과 같습니다.

- 주요 이동/상호작용 입력. 예: 이동, 점프, 발사, 확인/선택
- 승리/패배 또는 성공/실패 전환
- 점수, 체력, 자원 변화
- 경계 조건. 예: 충돌, 벽, 화면 가장자리
- 메뉴, 일시정지, 시작 흐름
- 요청에 연결된 특수 동작. 예: 파워업, 콤보, 능력, 퍼즐, 타이머
