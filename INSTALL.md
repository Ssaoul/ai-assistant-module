# 🚀 AI Assistant 설치 가이드

## ⚡ 원클릭 설치 (권장)

### 자동 시작 방식
```html
<script src="https://cdn.ai-assistant.com/v1/standalone.js" data-auto-start></script>
```
**✅ 완료!** 페이지 로드 시 자동으로 음성 어시스턴트 활성화

---

## 🎛️ 커스텀 설치

### 기본 설정
```html
<script src="https://cdn.ai-assistant.com/v1/standalone.js"></script>
<script>
AIAssistant.init({
  language: 'ko-KR',
  enableLogging: true
})
</script>
```

### 고급 설정 (API 키 사용)
```html
<script>
AIAssistant.init({
  apiKey: 'your-openai-api-key',  // 고품질 Nova 음성
  voiceModel: 'nova',
  language: 'ko-KR',
  autoStart: true
})
</script>
```

---

## 🗣️ 즉시 사용 가능한 명령어

### 네비게이션
- **"다음"** / **"이전"** - 페이지 이동
- **"위로"** / **"아래로"** - 스크롤
- **"메뉴 열어줘"** - 메뉴 버튼 클릭

### 상호작용  
- **"로그인 클릭해줘"** - 로그인 버튼 클릭
- **"검색해줘"** - 검색창 포커스
- **"확인"** - 포커스된 요소 클릭

### 취소/되돌리기 ⭐
- **"아니"** - 마지막 액션 취소
- **"확인, 아니 취소"** - 복합 명령 처리
- **"되돌려"** - 이전 상태로 복구

---

## 📋 요구사항

✅ **인터넷 연결** (TTS 서비스용)  
✅ **모던 브라우저** (Chrome 60+, Safari 12+)  
✅ **마이크 권한** (음성 인식용)  
❌ 설치 프로그램 없음  
❌ 종속성 없음  
❌ 빌드 과정 없음

---

## 🎯 특징

- **0ms 즉시 반응** - 명령 인식 즉시 시각적 피드백
- **한국어 최적화** - 빠른 말하기, "아니" 취소 패턴
- **자동 되돌리기** - 실수 시 즉시 복구
- **크로스 플랫폼** - 웹/모바일/키오스크 동일 경험