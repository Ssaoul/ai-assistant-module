# AI Assistant Module 개발 로드맵

## 🏷️ 버전 관리 전략

### 현재 안정 버전
- **v1.0.0-stable** - 음성 일관성 문제 해결 완료
- **브랜치**: `main` (프로덕션 안정 버전)
- **상태**: 동결 🔒 (버그 수정만 허용)

### 개발 브랜치 전략
```
main (v1.0.0-stable) ← 프로덕션 안정 버전
├── feature/v1.1-whisper ← 단기 개선
├── feature/v2.0-realtime ← 중기 개선  
└── feature/v3.0-multimodal ← 장기 비전
```

## 📅 단기 개선 (v1.1) - 1-2주

### 🎯 목표: 음성 인식 정확도 향상
- **기간**: 2주
- **브랜치**: `feature/v1.1-whisper`
- **핵심**: OpenAI Whisper 통합

### 주요 기능
1. **Whisper 통합**
   - Web Speech API → OpenAI Whisper API
   - 한국어 인식 정확도 90% → 95%+ 향상
   
2. **의도 분석 고도화**
   ```javascript
   // 현재: 기본 패턴 매칭
   matchBasicPatterns(transcript)
   
   // 개선: GPT-4o 기반 의도 분석
   async analyzeIntentWithGPT4o(transcript) {
     // 컨텍스트 이해, 복합 명령 처리
   }
   ```

3. **향상된 음성 품질**
   - ElevenLabs API 옵션 추가
   - Nova + ElevenLabs 듀얼 지원

### 기술 스택
- **STT**: OpenAI Whisper API
- **TTS**: Nova + ElevenLabs
- **NLU**: GPT-4o Mini
- **호환성**: 기존 API 유지

## 🚀 중기 개선 (v2.0) - 1개월

### 🎯 목표: 실시간 대화형 AI
- **기간**: 4주  
- **브랜치**: `feature/v2.0-realtime`
- **핵심**: OpenAI Realtime API 통합

### 주요 기능
1. **실시간 스트리밍**
   ```javascript
   // WebSocket 기반 양방향 통신
   const realtimeClient = new OpenAI.Realtime({
     model: 'gpt-4o-realtime-preview',
     voice: 'nova'
   });
   ```

2. **감정 인식 시스템**
   - 사용자 음성 톤 분석
   - 적응형 응답 스타일
   
3. **컨텍스트 메모리**
   - 대화 히스토리 유지
   - 개인화된 명령어 학습

### 기술 스택  
- **Core**: OpenAI Realtime API
- **WebSocket**: 실시간 통신
- **Storage**: IndexedDB (컨텍스트 저장)
- **Audio**: WebRTC + VAD

## 🌟 장기 비전 (v3.0) - 2-3개월

### 🎯 목표: 멀티모달 AI 어시스턴트
- **기간**: 8주
- **브랜치**: `feature/v3.0-multimodal`  
- **핵심**: 음성 + 비전 + 액션 통합

### 혁신 기능
1. **멀티모달 이해**
   ```javascript
   // 음성 + 화면 동시 분석
   processMultimodalInput(audio, screenshot) {
     // "이 버튼 클릭해줘" → 화면에서 버튼 자동 인식
   }
   ```

2. **VOIX 프레임워크 적용**
   ```html
   <!-- HTML 태그만으로 AI 활성화 -->
   <div data-ai="clickable" data-voice="로그인">로그인</div>
   ```

3. **지능형 웹 자동화**
   - 화면 이해 + 음성 명령
   - 복잡한 워크플로우 자동화
   - 시니어 접근성 극대화

### 기술 스택
- **Vision**: GPT-4V (화면 분석)
- **Framework**: VOIX 패턴
- **Automation**: Playwright 통합
- **AI**: GPT-4o 멀티모달
## 🏗️ 개발 단계별 구현 전략

### Phase 1: 프로젝트 복제 및 브랜치 생성
```bash
# 1. 현재 버전 백업
git tag v1.0.0-stable
git push origin v1.0.0-stable

# 2. 단기 개선 브랜치 생성
git checkout -b feature/v1.1-whisper

# 3. 중기/장기 브랜치 준비
git checkout -b feature/v2.0-realtime
git checkout -b feature/v3.0-multimodal
```

### Phase 2: 점진적 통합 전략

#### 🔄 **듀플리케이션 → 통합 패턴**
1. **기존 시스템 유지**: 완전 호환성 보장
2. **새 기능 병렬 개발**: 기존 코드와 독립적
3. **점진적 마이그레이션**: 기능별 단계적 전환
4. **A/B 테스트**: 성능 비교 후 전환

```javascript
// 예시: Whisper 통합 전략
class AIAssistantStandalone {
  constructor(config) {
    this.useWhisper = config.experimental?.useWhisper || false;
    // 기존 Web Speech API 유지
    this.webSpeechRecognition = this.setupWebSpeech();
    // 새로운 Whisper 시스템 추가
    this.whisperEngine = this.useWhisper ? this.setupWhisper() : null;
  }
  
  async recognize(audio) {
    if (this.useWhisper && this.whisperEngine) {
      return await this.whisperEngine.transcribe(audio);
    }
    return this.webSpeechRecognition.process(audio);
  }
}
```

## 📊 개발 단계별 성과 지표

### v1.1 성공 기준
- [ ] 한국어 인식 정확도 95%+
- [ ] 의도 분석 정확도 90%+  
- [ ] 기존 API 100% 호환
- [ ] 성능 개선 20%+

### v2.0 성공 기준
- [ ] 실시간 응답속도 <200ms
- [ ] 컨텍스트 유지율 90%+
- [ ] 동시 사용자 지원 10+
- [ ] 브라우저 호환성 95%+

### v3.0 성공 기준  
- [ ] 멀티모달 정확도 85%+
- [ ] 자동화 성공률 80%+
- [ ] 시니어 만족도 90%+
- [ ] 접근성 AA 등급 달성

## 🛠️ 기술 통합 아키텍처

### 현재 아키텍처 (v1.0)
```
User Voice → Web Speech API → Pattern Matching → TTS (Nova/Browser)
```

### v1.1 아키텍처 (단기)
```
User Voice → Whisper API → GPT-4o Intent → Enhanced TTS (Nova/ElevenLabs)
```

### v2.0 아키텍처 (중기)
```
User Voice ⟷ OpenAI Realtime API ⟷ Context Memory ⟷ Streaming Response
```

### v3.0 아키텍처 (장기)
```
User Voice + Screen → GPT-4V Multimodal → VOIX Framework → Intelligent Automation
```## 💼 실행 계획서

### 즉시 실행 가능한 단계

#### 🔨 **1주차: v1.1 기반 구축**
```bash
# Day 1-2: Whisper 통합 준비
git checkout feature/v1.1-whisper
npm install openai
# Whisper API 래퍼 구현

# Day 3-4: 의도 분석 업그레이드  
# GPT-4o Mini 통합 (비용 효율적)

# Day 5-7: ElevenLabs 선택적 통합
# 프리미엄 음성 옵션 추가
```

#### ⚡ **2-3주차: v2.0 실시간 시스템**
```bash
# Week 2: OpenAI Realtime 기반 구조
git checkout feature/v2.0-realtime
# WebSocket 실시간 통신 구현

# Week 3: 컨텍스트 메모리 시스템
# IndexedDB 기반 대화 기억
```

#### 🌟 **4-8주차: v3.0 멀티모달**
```bash
# Week 4-6: VOIX 프레임워크 적용
git checkout feature/v3.0-multimodal
# HTML 태그 기반 AI 활성화

# Week 7-8: GPT-4V 화면 인식
# 음성 + 비전 통합 시스템
```

## 🎯 각 버전별 핵심 혁신

### v1.1: **"정확도 혁명"**
- Whisper → 95% 인식 정확도
- GPT-4o → 지능적 의도 파악
- ElevenLabs → 프리미엄 음성 선택

### v2.0: **"실시간 혁명"** 
- <200ms 응답속도
- 끊김없는 대화 흐름
- 개인화된 학습 시스템

### v3.0: **"접근성 혁명"**
- "이 버튼 클릭해줘" → 자동 화면 인식
- HTML 태그로 1분 설치
- 시니어 디지털 격차 해소

## 📈 ROI 예측

| 버전 | 개발기간 | 정확도 | 사용성 | 시장성 |
|------|----------|---------|---------|---------|
| v1.1 | 2주 | +30% | +20% | 기존 시장 |
| v2.0 | 4주 | +50% | +60% | 프리미엄 시장 |
| v3.0 | 8주 | +70% | +200% | 블루오션 |

**결론**: 점진적 업그레이드로 위험 최소화하면서 혁신 달성

---

## 🧭 미착수 — 플랫폼 확장 (계획만, 구현 없음)

> 2026-07-20 이관. 아래 항목은 과거 `README.md`·`INSTALL.md`·`DEVELOPMENT_GUIDE.md`·
> `FEATURE_SPECIFICATION.md`에 **구현된 기능처럼 서술**돼 있었으나, 실측 결과 `src/`에 코드가
> 전혀 없어(각 심볼 0건) 사용자를 오도하고 있었다. 의도를 보존하되 오도를 끊기 위해 여기로 옮긴다.
> **착수 전까지 다른 문서에서 "지원한다"고 쓰지 않는다.**

### 현재 실제 지원 범위
- **웹 전용.** `peerDependencies`: `react` / `react-dom`. `src/`는 웹 코어 7개 파일
  (`command-router` · `dom-analyzer` · `fast-response` · `korean-cancellation` ·
  `korean-speech-optimizer` · `visual-feedback` · `voice-engine`) + `index.ts`.

### 미착수 항목

| 항목 | 과거 문서의 주장 | 실측 |
|---|---|---|
| React Native SDK | `AIAssistantModule.initialize()` · `handleMessage` (WebView 연동) | `src` 0건. RN·WebView 코드 없음. `peerDeps`에 RN 없음 |
| 키오스크 (Browser Extension) | `manifest.json` + `ai-assistant-kiosk.js` content script | `ai-assistant-kiosk.js` 파일 부재 |
| 어댑터 계층 | `MobileAdapter` · `KioskAdapter` · `WebAdapter` | 세 심볼 모두 `src` 0건 |
| 모바일 플랫폼 | "iOS 14+, Android 8+" | 지원 근거 없음 |

### 착수 조건
- v1.0.0-stable **동결 정책**(위 §현재 안정 버전, 버그 수정만) 아래에서는 착수하지 않는다.
- 착수 시: 어댑터 인터페이스 설계 → RN peer 추가 → WebView 브리지 → 각 플랫폼 E2E.
  플랫폼별 권한(마이크)·음성 API 차이가 핵심 난점.
- 착수 결정 시 이 절을 v1.1/v2.0 등 실제 버전 절로 승격하고, 그때 각 문서에 "지원" 표기를 되살린다.
