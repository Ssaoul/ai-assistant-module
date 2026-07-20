# ADR 0001 — NORTH-STAR §③ "제품 src 불가침" 예외: 문서화된 API의 계약위반 버그 수정

- 상태: accepted
- 날짜: 2026-07-20
- 결정자: 1uk@huray.net (사용자 승인)
- 관련: `docs/NORTH-STAR.md` §③, 커밋 `eed82d4`·`f68f9b2`·`e27caba`, 머지 `0c05382`·`f53bb02`

## 맥락

`docs/NORTH-STAR.md` §③(2026-07-15 초안)은 두 가지를 규정한다:

1. **"제품 src 불가침: 테스트/툴링만, 제품 코드 무변경"**
2. **"자율등급 L1 · npm release 사람 게이트 … 브랜치+커밋까지, main push·publish 금지"**

2026-07-20 자율 루프가 `README.md:84-93`이 안내하는 `assistant.on('commandReceived'|'error', cb)` API가
**실제로는 존재하지 않는다**는 것을 발견했다(`src/index.ts`에 `.on(`·`EventEmitter`·`addEventListener` 0건,
콜백 대안도 0건). 문서를 따라 하면 `TypeError: assistant.on is not a function`이 난다.

사용자는 이를 **"문서를 지우는 게 아니라 API를 구현한다"** 로 결정했고(2026-07-20), 그 결과 제품 코드
`src/index.ts`가 변경됐다(+110줄). 이는 위 §③ 1번과 정면으로 충돌한다.

## 결정

### 예외 1 — `src` 불가침에 대한 예외 (승인)
**"문서화된 공개 API가 존재하지 않아 런타임 오류를 내는 계약위반"은 §③의 "버그 수정만" 범위에 포함**한다.
따라서 이번 `.on()` 구현은 §③ 위반이 아니라 **허용된 버그 수정**으로 분류한다.

근거:
- §③은 "v1.0.0-stable **동결 — 버그 수정만**"을 함께 명시한다. 문서가 약속한 API의 부재는 신규 기능 요청이
  아니라 **공표된 계약과 구현의 불일치**이며, 배포 라이브러리에서 이는 버그다.
- 변경은 **순수 additive**다 — 기존 실행 경로의 동작을 바꾸지 않고 이벤트 훅만 추가했다.
  기존 테스트 12개가 수정 없이 그대로 통과한다(12 → 20, 신규 8개는 이벤트 전용).
- 신규 런타임 의존성 0(자체 `Map<이벤트, Set<리스너>>` 구현, Node `events` 미사용).
- 부수 효과로 잠복 버그 1건을 정정했다: `src/index.ts:137`의 `export { InteractiveElement }`가
  import 누락으로 깨져 있었다(기존 테스트가 `index.ts`를 컴파일한 적이 없어 드러나지 않음).

### 예외 2 — `main push` 금지에 대한 예외 (사후 승인)
2026-07-20 이 변경이 `origin/main`에 **푸시됐다**(`64490a1..0c05382`). §③의 "main push·publish 금지"에
어긋난다. 사용자가 명시적으로 지시한 행위이므로 **사후 승인**으로 기록한다.

경계는 유지된다:
- **`npm publish`는 하지 않았다.** §③의 release 게이트는 그대로 유효하다.
- `.claude/settings.json`의 deny(자율 세션의 push/merge/publish 차단)는 **변경하지 않았다** —
  즉 **자율 루프는 여전히 push할 수 없고**, 이번 push는 사람이 직접 한 행위다.

## 이번 변경의 범위 (실측)

| 파일 | 변경 | 성격 |
|---|---|---|
| `src/index.ts` | +110 −10 | 제품 코드 — 이벤트 API 추가(additive) + export 누락 정정 |
| `src/__tests__/event-emitter.test.ts` | +205 (신규) | 테스트 8개 |
| `docs/API_REFERENCE.md` | +2 −2 | 패키지명 `@ai-assistant/module` 통일 |
| `docs/DEVELOPMENT_GUIDE.md` | +6 −1 | 동상 + RN 절 미지원 경고 |

게이트: `npm test` → 3 suites / **20 passed** / rc=0.
(`npx tsc --noEmit`은 이 저장소에 `tsconfig.json`이 없어 non-functional — ts-jest 컴파일이 타입 검증을
대신하며, 타입 오류를 주입하면 `npm test`가 rc=1로 실제로 잡는 것을 뮤테이션으로 확인했다.)

## 결과 — NORTH-STAR §③ 갱신 필요

이 ADR에 따라 §③의 다음 항목을 갱신해야 한다(NORTH-STAR는 사람 소유 문서이므로 이 ADR이 근거가 된다):

- **"제품 src 불가침: 테스트/툴링만, 제품 코드 무변경"**
  → `제품 src 원칙적 불가침(테스트/툴링 우선). 예외: 문서화된 공개 API의 계약위반 버그 수정은 허용하되
     ADR로 기록한다(ADR 0001). 신규 기능 추가는 여전히 금지.`

- **"main push·publish 금지"**
  → `자율 루프는 브랜치+커밋까지(settings.json deny 유지). main push는 사람이 직접 수행 가능하며,
     npm publish는 계속 사람 게이트.`

## 미해결 — 이 ADR이 다루지 않는 것

- **React Native 지원 여부**: `docs/DEVELOPMENT_GUIDE.md`의 RN 통합 절은 구현되지 않은 기능
  (`src/`에 RN·WebView 코드 0건, `peerDependencies`는 `react`/`react-dom` 웹 전용, `AIAssistantModule`·
  `handleMessage` 부재)을 안내한다. 2026-07-20 머지 리뷰에서 **"미지원" 경고만 부착하고 보류**로 결정했다.
  실제 지원할지, 절을 삭제할지는 **별도 결정**이 필요하다.
- **`tsconfig.json` 부재**: `package.json`의 `build`(`tsc && rollup`)·`lint` 스크립트가 로컬에서 성립하지
  않는다. 별도 이슈.

## 후속

- NORTH-STAR §③ 문구를 위 "결과" 절대로 갱신(사람).
- 이후 유사 판단(문서-구현 불일치)이 나오면 이 ADR을 참조 기준으로 삼는다 — 다만 **"문서가 약속했으니
  구현한다"가 자동 승인은 아니다.** 문서 쪽이 틀린 경우(RN 절처럼)는 문서를 고치는 것이 정답이며,
  어느 쪽이 정본인지는 사람이 판단한다.
