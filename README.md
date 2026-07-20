# 🎤 AI Assistant Module

**시니어 친화형 음성 기반 웹 접근성 모듈**

[![npm version](https://badge.fury.io/js/%40ai-assistant%2Fmodule.svg)](https://www.npmjs.com/package/@ai-assistant/module)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 주요 기능

- 🗣️ **자연스러운 한국어 TTS** - OpenAI Nova 모델 기반
- 👂 **음성 인식** - 웹 표준 Speech Recognition API
- 🔍 **자동 화면 분석** - DOM 요소 자동 탐지 및 매핑
- 🎯 **음성 네비게이션** - "로그인해줘", "검색해줘" 등 자연어 명령
- 👴 **시니어 특화** - 존댓말 변환, 명료한 발음
- 🌐 **웹 전용** - 브라우저 환경 지원 (모바일앱·키오스크는 미착수 → `docs/DEVELOPMENT_ROADMAP.md` §미착수)

## 🚀 빠른 시작

### CDN 방식 (권장)
```html
<script src="https://cdn.ai-assistant.com/v1/assistant.js"></script>
<script>
  const assistant = new AIAssistant({
    apiKey: 'your-api-key',
    language: 'ko-KR',
    mode: 'senior-friendly'
  })
  
  assistant.initialize()
</script>
```

### NPM 방식
```bash
npm install @ai-assistant/module
```

```javascript
import { AIAssistant } from '@ai-assistant/module'

const assistant = new AIAssistant({
  apiKey: 'your-api-key',
  voiceModel: 'nova'
})

await assistant.initialize()
```

## 📋 지원 음성 명령어

### 네비게이션
- "다음 페이지", "이전 페이지"
- "위로", "아래로" (스크롤)
- "메뉴 열어줘"### 요소 상호작용
- "로그인 클릭해줘"
- "검색 눌러줘" 
- "장바구니 열어줘"

### 폼 작성
- "이름은 홍길동"
- "전화번호는 010-1234-5678"
- "제출해줘"

### 시스템 제어
- "다시 말해줘" (반복)
- "멈춰" (음성 중지)
- "도움말"

## 🛠️ 개발자 가이드

### 커스텀 명령어 추가
```javascript
assistant.addCustomCommand({
  keywords: ['주문하기', '구매'],
  action: async () => {
    const buyBtn = document.querySelector('.buy-button')
    if (buyBtn) buyBtn.click()
  },
  description: '상품 주문',
  confirmRequired: true
})
```

### 이벤트 리스너
```javascript
assistant.on('commandReceived', (command) => {
  console.log('실행된 명령:', command.description)
})

assistant.on('error', (error) => {
  console.error('오류 발생:', error)
})
```

## 📚 문서

- [📋 기능 명세서](./docs/FEATURE_SPECIFICATION.md)
- [🔧 개발 가이드](./docs/DEVELOPMENT_GUIDE.md)  
- [📖 API 레퍼런스](./docs/API_REFERENCE.md)
- [💡 예제 코드](./examples/)

## 🚀 배포된 데모

**라이브 데모**: https://huray-chatbot-demo-e2sdzu7ra-1uk-9231s-projects.vercel.app

## 📞 지원

- 이슈 제출: [GitHub Issues](https://github.com/huray-team/ai-assistant-module/issues)
- 문의: support@huray.com
- 문서: [개발자 포털](https://docs.ai-assistant.com)