# CLAUDE.md — 에이전트 공통 컨텍스트 (시니어 음성 접근성 모듈)

> ai-assistant-module 저장소에서 AI 에이전트가 항상 먼저 로드하는 규칙·맥락.
> 이 파일은 Mission Control `agent-kit/CLAUDE.template.md`에서 생성됨 — 저장소 고유 내용은 아래 「프로젝트 고유」 절에만 추가하고, 공통 절은 전파로 갱신된다.

## 프로젝트 한 줄
시니어 친화 음성 기반 웹 접근성 npm 모듈. 배포물이라 릴리스는 사람 승인.

## 자율 등급
이 저장소의 자율 등급: **L1** (assisted). 에이전트는 이 등급을 넘지 못한다.
- L0 guarded: 에이전트는 PR만, CODEOWNERS 리뷰 필수, 자동 머지 금지.
- L1 assisted: PR 생성 + CI 통과 시 docs/tests만 자동 머지, 코드·릴리스는 리뷰.
- L2 autonomous: 비릴리스 변경 자동 머지 가능, 릴리스/배포는 사람 승인.

## 반드시 지킬 것 (하드 가드레일 — 공통)
1. 개인식별정보·실데이터·비밀값을 프롬프트/커밋에 넣지 않는다(가명·합성만).
2. AI 산출 코드도 PR + CODEOWNERS 리뷰 필수. `main` 직접 push 금지.
3. 자율 등급을 넘는 행동 금지. 사람 승인 지점(릴리스·고위험 머지)에서 멈춘다.
4. `.team-mode/` 역할 경계를 AI로 우회하지 않는다.

## 에이전트 구성
- 저장소 안 6종 seed: orchestrator · planner · designer · coder · verifier · qa (`.claude/agents/`).
- 명단은 닫혀있지 않다. 부족하면 **Foundry**(`foundry/create-agent.workflow.js`)가 심의를 거쳐 새 에이전트를 출산한다. 수기 추가 금지.

## 작업 규약
- 모든 변경은 이슈에서 출발. 브랜치·커밋에 이슈키 명시.
- 문서 SoT는 `docs/`. 자동생성물은 수기 편집 금지.

---
## 프로젝트 고유 (이 절만 저장소가 관리)
- 스택: TypeScript/npm 패키지. 문서·예제·회귀 테스트 보강.
- 릴리스(npm publish)는 자율등급과 무관하게 사람 승인 유지.
