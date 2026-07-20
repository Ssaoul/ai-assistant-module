# NORTH-STAR — ai-assistant-module

> 이 문서는 goal-author·gap-finder·진화루프가 "전체 맥락·설계 관점"을 판단하는 **사람 소유 기준**이다.
> autopilot은 읽기만 한다(자동 수정 금지). 갱신은 사람/ADR.
>
> 갱신: 2026-07-20 §③ 예외 반영([ADR 0001](adr/0001-event-api-exception-to-src-freeze.md), 사용자 승인).
>
> ⚠️ **초안 (2026-07-15, Claude 작성 · 사람 검토·소유 필요)**. 실제 파일(`package.json`·`README.md`·`docs/DEVELOPMENT_ROADMAP.md`·`src/`·`.claude/settings.json`·테스트)만 근거. `[사람 결정 필요]`는 사람이 채우거나 지운다.

## ① 전체 그림
**시니어(고령자) 친화형 음성 기반 웹 접근성 npm 패키지**(`@ai-assistant/module` v1.0.0, `package.json:4` "시니어 친화형 AI 어시스턴트 모듈 - 웹/앱/키오스크 음성 접근성 지원").
- **핵심 가치**(README): 자연스러운 한국어 TTS(OpenAI Nova) · 웹표준 음성 인식 · 자동 DOM 화면 분석 · 자연어 음성 네비게이션("로그인해줘"·"검색해줘") · **시니어 특화(존댓말 변환·명료 발음)** · 멀티플랫폼(웹/앱/키오스크 지향).
- **사용자**: 통합 앱 개발자 — CDN `<script>` 또는 `npm install @ai-assistant/module` → `new AIAssistant({apiKey, language, mode})` → `initialize()`. 소비 API는 `src/index.ts`의 `AIAssistant`(`startListening`/`speak`/`scanPage`/`findElement`/`addCustomCommand`). React ≥16.8 peerDep.

## ② 아키텍처 지도
`src/index.ts`가 엔트리 — `AIAssistant`가 **VoiceEngine + DOMAnalyzer + CommandRouter** 조립. 브라우저 전역 `window.AIAssistant` 노출.
- **순수 로직(DOM 무관, 테스트 대상)**: `korean-speech-optimizer`(optimizeTranscript·isUrgentCommand·isRecentlyProcessed) · `korean-cancellation.parseCompoundCommand` · `fast-response`의 큐/중복 로직(isDuplicateCommand·isImmediateAction·큐 접근자).
- **DOM/window 결합(브라우저 필요)**: command-router(scrollTo·click) · dom-analyzer(MutationObserver) · voice-engine(webkitSpeechRecognition·SpeechSynthesis) · visual-feedback · korean-cancellation의 undo(window.history) · fast-response의 시각피드백.
- **미연결**: `intent-analyzer.js`·`contextual-intent.js`(`.js`, 엔트리 미import, OpenAI 의도인식).
- **스택**: TypeScript(코어 `.ts`, strict:false) · Jest(`testEnvironment: node`, `__tests__/**/*.test.ts`, ts-jest 인라인 tsconfig) · dep는 `openai@^4`만. **Capacitor 흔적 없음**(멀티플랫폼은 문서 지향점).

## ③ 설계 원칙
- **v1.0.0-stable 동결 — 버그 수정만**(`docs/DEVELOPMENT_ROADMAP.md`: 상태 동결 🔒).
- **자율등급 L1 · npm release 사람 게이트**: `.claude/settings.json` deny에 push/merge/rebase·gh·npm publish·**npm install/ci**(공급망 주의)·rm-rf·sudo·curl/wget. 브랜치+커밋까지.
  - *명확화(ADR 0001)*: **자율 루프는 main push 불가**(`.claude/settings.json` deny 유지).
    **main push는 사람이 직접 수행 가능**하며, **`npm publish`는 계속 사람 게이트**로 남는다.
- **★ 회귀 테스트 = "현재 동작 lock"**: 테스트 기대값은 *기대 사양*이 아니라 **현재 구현의 실제 출력**을 고정해 향후 회귀를 잡는 것(테스트 파일 명시). 예: `\w`가 ASCII만 매칭 → 한글 "확인확인"은 신뢰도 0.7·즉시실행 false를 그대로 고정.
- **제품 src 원칙적 불가침**: 테스트/툴링 우선, 제품 코드 무변경.
  - *예외(ADR 0001)*: **문서화된 공개 API의 계약위반 버그 수정**은 허용하되 ADR로 기록한다.
    (예: README가 안내하는 `.on()`이 부재해 `TypeError`가 나던 건 — 신규 기능이 아니라 계약위반 버그.)
    **신규 기능 추가는 여전히 금지.** 어느 쪽이 정본인지(문서 vs 구현)는 사람이 판단한다.
- **시니어 UX·존댓말 카피**: 사용자 대면 문구 존댓말("이전 상태로 되돌렸습니다"·"명령을 이해하지 못했습니다").

## ④ 좋음의 정의
- **순수 한국어 로직에 Jest 회귀 테스트** — 기대값 = 실제 구현 출력으로 고정(사양 아닌 동작).
- **엣지/버그를 "현재 동작"으로 정직하게 문서화**(선언 신뢰도 ≠ 실제 재계산값 등).
- **순수 함수는 DOM 비결합**(node env에서 통과 = 런타임 DOM 미사용).
- **미세 계약 검증**(취소 없을 때 원본 대소문자 보존 등).
- (근거 관찰: 접근성/시니어 UX 자체의 자동 a11y assertion 테스트는 **없음** — 품질 신호가 순수 파싱 로직에 국한. `[사람 결정 필요]`: a11y 자동검증을 품질 바에 넣을지.)

## ⑤ 의도적 비목표 (YAGNI)
- **v1.1(Whisper)·v2.0(Realtime)·v3.0(멀티모달)** — 다주 에픽, `feature/*` 브랜치 분리. **실상태: v2.0/v3.0 원격 브랜치는 main과 동일 커밋(작업 0), v1.1만 1커밋 앞섬(whisper-engine.ts). 셋 다 근 10개월 방치.**
- **SaMD·PII 처리** — 코드/문서에 근거 없음. (`[사람 결정 필요]`: 비목표로 명문화하려면 이는 새 *정책 결정*임을 표기.)

## ⑥ 성숙도 지도
- **튼튼**: v1.0.0 안정·main 동결. 순수 한국어 코어 회귀 테스트(parseCompoundCommand·optimizeTranscript·isUrgentCommand·dedup·FastResponseManager) — 단 여러 `test/*` 브랜치에 분산(main 미통합).
- **빈약(DOM 결합·미테스트)**: voice-engine·dom-analyzer·command-router·visual-feedback·fast-response의 DOM부·korean-cancellation의 undo. intent-analyzer.js·contextual-intent.js(엔트리 미연결·미테스트).
- **미착수(에픽)**: v1.1/v2.0/v3.0(로드맵 정의만, 브랜치 방치).

## 사람이 확정해야 할 것
1. `[사람 결정 필요]` **canonical org 불일치**: git remote `Ssaoul` vs package.json/README `huray-team` vs SLUG `ssaoul-…` — 정본 확정.
2. `[사람 결정 필요]` **v1.1+ 로드맵 생사**: 세 에픽 근 10개월 방치·v2/v3 커밋 0 → "동결 유지 vs 재개" 방향.
3. `[사람 결정 필요]` **test 브랜치 통합**: 순수 로직 회귀 스위트가 4개 `test/*` 브랜치에 흩어짐 — main 통합 계획.
4. `[사람 결정 필요]` a11y 자동검증을 품질 바에 편입할지.
