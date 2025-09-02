# AI Assistant Module - 개발 가이드

## 🏁 시작하기

### 설치 및 설정
```bash
git clone <repository-url>
cd ai-assistant-module
npm install
npm run dev
```

### 필수 요구사항
- Node.js 18+
- TypeScript 5+
- 모던 브라우저 (Chrome 90+, Safari 14+)

## 🏗️ 아키텍처 개요

### 전체 구조
```
AI Assistant Module
├── Core Engine          # 핵심 AI 처리
│   ├── VoiceEngine      # TTS/STT 관리
│   ├── DOMAnalyzer      # 화면 요소 분석
│   └── CommandRouter    # 음성 명령 라우팅
├── Integration Layer    # 플랫폼별 어댑터
│   ├── WebAdapter       # 웹사이트 통합
│   ├── MobileAdapter    # 모바일앱 통합
│   └── KioskAdapter     # 키오스크 통합
└── SDK Interface        # 개발자 API
    ├── JavaScript SDK   # 웹 개발자용
    ├── React Native SDK # 모바일 개발자용
    └── Configuration    # 설정 관리
```

### 데이터 플로우
```
사용자 음성 입력
    ↓
Speech Recognition API
    ↓
명령어 분석 & 분류
    ↓
DOM 요소 매칭
    ↓
액션 실행
    ↓
결과 TTS 피드백
```

## 🧩 핵심 모듈 설계

### 1. VoiceEngine
```typescript
interface VoiceEngine {
  // TTS 처리
  speak(text: string, options?: TTSOptions): Promise<void>
  stopSpeaking(): void
  
  // STT 처리  
  startListening(): Promise<void>
  stopListening(): void
  
  // 이벤트 핸들링
  onTranscriptReceived(callback: (text: string) => void): void
  onError(callback: (error: Error) => void): void
}

interface TTSOptions {
  voice: 'nova' | 'alloy' | 'echo'
  speed: number
  language: 'ko-KR' | 'en-US'
}
```### 2. DOMAnalyzer
```typescript
interface DOMAnalyzer {
  // 요소 스캔
  scanPage(): Promise<ElementMap>
  findElementByDescription(description: string): HTMLElement | null
  
  // 상호작용 가능한 요소 탐지
  getInteractiveElements(): InteractiveElement[]
  getFormElements(): FormElement[]
  
  // 페이지 변화 감지
  observeChanges(callback: (changes: MutationRecord[]) => void): void
}

interface InteractiveElement {
  element: HTMLElement
  type: 'button' | 'link' | 'input' | 'select'
  label: string
  description: string
  isVisible: boolean
  position: { x: number, y: number }
}
```

### 3. CommandRouter
```typescript
interface CommandRouter {
  // 명령어 등록
  registerCommand(command: VoiceCommand): void
  
  // 명령어 처리
  processCommand(transcript: string): Promise<CommandResult>
  
  // 컨텍스트 관리
  setContext(context: PageContext): void
}

interface VoiceCommand {
  keywords: string[]
  action: (params?: any) => Promise<void>
  description: string
  confirmRequired?: boolean
}
```

## 🔌 통합 방법

### 웹사이트 통합 (JavaScript SDK)
```html
<!-- 1단계: 스크립트 로드 -->
<script src="https://cdn.ai-assistant.com/v1/assistant.js"></script>

<!-- 2단계: 초기화 -->
<script>
AIAssistant.init({
  apiKey: 'your-api-key',
  language: 'ko-KR',
  voiceModel: 'nova',
  mode: 'senior-friendly',
  customCommands: [
    {
      keywords: ['장바구니', '카트'],
      action: () => window.location.href = '/cart'
    }
  ]
})
</script>
```### 모바일 앱 통합 (React Native)
```typescript
import { AIAssistantModule } from '@ai-assistant/react-native'

export default function App() {
  useEffect(() => {
    AIAssistantModule.initialize({
      apiKey: 'your-api-key',
      webViewRef: webViewRef.current,
      permissions: ['microphone', 'speech']
    })
  }, [])

  return (
    <WebView 
      ref={webViewRef}
      source={{ uri: 'https://your-app.com' }}
      onMessage={AIAssistantModule.handleMessage}
    />
  )
}
```

### 키오스크 통합 (Browser Extension)
```json
// manifest.json
{
  "name": "AI Assistant Kiosk",
  "permissions": ["activeTab", "storage", "microphone"],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["ai-assistant-kiosk.js"]
  }]
}
```

## 📡 API 명세

### 기본 이벤트
```typescript
// 모듈 로드 완료
assistant.on('ready', () => {
  console.log('AI Assistant 준비 완료')
})

// 음성 명령 감지
assistant.on('command', (command: VoiceCommand) => {
  console.log('명령 실행:', command.description)
})

// 오류 처리
assistant.on('error', (error: AssistantError) => {
  console.error('AI Assistant 오류:', error.message)
})
```

### 커스터마이징
```typescript
// 사이트별 명령어 추가
assistant.addCustomCommand({
  keywords: ['주문하기', '구매'],
  action: async () => {
    const buyButton = document.querySelector('.buy-now-btn')
    if (buyButton) buyButton.click()
  },
  confirmRequired: true
})

// 음성 설정 변경
assistant.updateVoiceSettings({
  speed: 0.9,
  pitch: 1.0,
  volume: 0.8
})
```