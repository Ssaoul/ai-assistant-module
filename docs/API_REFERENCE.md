# AI Assistant Module - API 레퍼런스

## 🚀 빠른 시작

### 기본 설치
```javascript
// CDN 방식
<script src="https://cdn.ai-assistant.com/v1/assistant.js"></script>

// NPM 방식
npm install @ai-assistant/module
import { AIAssistant } from '@ai-assistant/module'
```

### 초기화
```javascript
const assistant = new AIAssistant({
  apiKey: 'your-api-key',
  language: 'ko-KR',
  voiceModel: 'nova',
  mode: 'senior-friendly'
})

await assistant.initialize()
```

## 📚 Core API

### AIAssistant 클래스

#### 생성자
```typescript
constructor(config: AssistantConfig)

interface AssistantConfig {
  apiKey: string
  language?: 'ko-KR' | 'en-US'
  voiceModel?: 'nova' | 'alloy' | 'echo'
  mode?: 'senior-friendly' | 'standard'
  enableLogging?: boolean
  customCommands?: VoiceCommand[]
}
```

#### 메서드

**initialize(): Promise<void>**
- 모듈 초기화 및 권한 요청
- DOM 스캔 시작
- 음성 엔진 준비

**startListening(): Promise<void>**
- 음성 인식 시작
- 마이크 권한 필요

**stopListening(): void**
- 음성 인식 중지

**speak(text: string, options?: TTSOptions): Promise<void>**
- 텍스트를 음성으로 변환
- Nova TTS 사용

**scanPage(): Promise<ElementMap>**
- 현재 페이지의 상호작용 요소 스캔
- 캐시된 결과 반환**addCustomCommand(command: VoiceCommand): void**
- 사이트별 커스텀 명령어 추가

**removeCommand(keywords: string[]): void**  
- 등록된 명령어 제거

**updateSettings(settings: Partial<AssistantConfig>): void**
- 런타임 설정 변경

## 🎤 음성 명령어

### 기본 네비게이션 명령어
```typescript
const defaultCommands = [
  // 페이지 네비게이션
  { keywords: ['다음 페이지', '넘어가기'], action: 'nextPage' },
  { keywords: ['이전 페이지', '뒤로가기'], action: 'previousPage' },
  { keywords: ['맨 위로', '상단으로'], action: 'scrollToTop' },
  { keywords: ['맨 아래로', '하단으로'], action: 'scrollToBottom' },
  
  // 요소 상호작용
  { keywords: ['클릭해줘', '눌러줘'], action: 'clickElement' },
  { keywords: ['메뉴 열어줘'], action: 'openMenu' },
  { keywords: ['검색해줘'], action: 'focusSearch' },
  
  // 폼 작성
  { keywords: ['이름은', '성함은'], action: 'fillName' },
  { keywords: ['전화번호는'], action: 'fillPhone' },
  { keywords: ['제출해줘', '완료'], action: 'submitForm' },
  
  // 시스템 제어
  { keywords: ['도움말'], action: 'showHelp' },
  { keywords: ['다시 말해줘'], action: 'repeat' },
  { keywords: ['멈춰', '중단'], action: 'stop' }
]
```

### 커스텀 명령어 등록
```javascript
assistant.addCustomCommand({
  keywords: ['장바구니', '카트 보기'],
  action: async () => {
    const cartBtn = document.querySelector('[data-cart], .cart-button')
    if (cartBtn) {
      cartBtn.click()
      assistant.speak('장바구니를 열었습니다')
    }
  },
  description: '장바구니 페이지로 이동',
  confirmRequired: false
})
```## 🎯 DOM 분석 API

### ElementMap 구조
```typescript
interface ElementMap {
  buttons: InteractiveElement[]
  links: InteractiveElement[]
  forms: FormElement[]
  inputs: InputElement[]
  navigation: NavigationElement[]
}

interface InteractiveElement {
  id: string
  type: ElementType
  label: string
  description: string
  selector: string
  isVisible: boolean
  boundingRect: DOMRect
  ariaLabel?: string
}
```

### 사용 예시
```javascript
// 페이지 스캔
const elements = await assistant.scanPage()

// 특정 요소 찾기
const loginBtn = assistant.findElementByDescription('로그인')
if (loginBtn) {
  loginBtn.click()
}

// 폼 요소 자동 입력
assistant.fillForm({
  name: '홍길동',
  phone: '010-1234-5678',
  email: 'test@example.com'
})
```

## ⚡ 이벤트 시스템

### 이벤트 리스너
```javascript
// 음성 명령 감지
assistant.on('commandReceived', (command) => {
  console.log(`명령어: ${command.transcript}`)
})

// 요소 상호작용
assistant.on('elementInteraction', (interaction) => {
  console.log(`${interaction.element} 클릭됨`)
})

// 오류 처리
assistant.on('error', (error) => {
  console.error('AI Assistant 오류:', error)
})
```