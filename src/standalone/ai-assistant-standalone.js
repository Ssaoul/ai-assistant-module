/**
 * AI Assistant Standalone Module
 * 완전 독립형 설치 모듈 - 제로 종속성
 * 인터넷 연결만 있으면 어디서든 작동
 */

(function(window) {
  'use strict';

  // 글로벌 설정
  const CONFIG = {
    TTS_ENDPOINT: '/api/tts',  // chat 시스템과 동일한 엔드포인트 사용
    VERSION: '1.0.0',
    SUPPORTED_LANGUAGES: ['ko-KR', 'en-US'],
    DEFAULT_VOICE: 'nova'
  };

  // 한국어 취소 패턴
  const CANCELLATION_KEYWORDS = [
    '아니', '아니야', '아니에요', '취소', '취소해줘', 
    '되돌려', '되돌리기', '잘못됐어', '원래대로'
  ];

  // 기본 명령어
  const DEFAULT_COMMANDS = [
    { keywords: ['다음', '넘어가기'], action: 'next', desc: '다음 페이지' },
    { keywords: ['이전', '뒤로가기'], action: 'prev', desc: '이전 페이지' },
    { keywords: ['위로', '상단으로'], action: 'scrollTop', desc: '맨 위로' },
    { keywords: ['아래로', '하단으로'], action: 'scrollBottom', desc: '맨 아래로' },
    { keywords: ['클릭', '선택', '확인'], action: 'click', desc: '클릭' },
    { keywords: ['검색'], action: 'search', desc: '검색' },
    { keywords: ['메뉴'], action: 'menu', desc: '메뉴 열기' }
  ];

  class AIAssistantStandalone {
    constructor(config = {}) {
      this.config = Object.assign({
        language: 'ko-KR',
        voiceModel: 'nova',
        apiKey: null,
        openaiApiKey: null,  // AI 의도 분석용 + Whisper API용
        enableLogging: false,
        autoStart: true,
        useAIIntent: true,
        useWhisper: false  // Whisper API 사용 여부
      }, config);

      this.recognition = null;
      this.mediaRecorder = null;  // Whisper용 MediaRecorder
      this.audioChunks = [];      // Whisper용 오디오 청크
      this.isListening = false;
      this.isSpeaking = false;
      this.isGeneratingTTS = false;
      this.currentUtterance = null;
      this.audioContext = null;
      this.isAudioContextInitialized = false;
      this.actionHistory = [];
      this.lastCommand = '';
      this.lastCommandTime = 0;
      this.intentCache = new Map();
      
      this.init();
    }

    init() {
      this.setupSpeechRecognition();
      this.injectStyles();
      if (this.config.autoStart) {
        this.startListening();
      }
      this.log('AI Assistant 초기화 완료');
    }    setupSpeechRecognition() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('음성 인식을 지원하지 않는 브라우저입니다.');
        return;
      }

      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.config.language;

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.processCommand(transcript);
      };

      this.recognition.onerror = () => {
        this.isListening = false;
        this.showFeedback('❌ 음성 인식 오류', 'error');
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.config.autoStart) {
          setTimeout(() => this.startListening(), 1000);
        }
      };
    }

    // 즉시 피드백 시스템
    showFeedback(message, type = 'info') {
      const indicator = document.createElement('div');
      indicator.className = 'ai-feedback ai-feedback-' + type;
      indicator.textContent = message;
      document.body.appendChild(indicator);

      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.style.opacity = '0';
          setTimeout(() => indicator.remove(), 300);
        }
      }, 3000);
    }    // AI 기반 명령어 처리
    async processCommand(transcript) {
      const normalized = transcript.toLowerCase().trim();
      this.showFeedback('🎤 "' + transcript + '" 인식됨');

      // 중복 명령 방지 (1.5초)
      if (this.isDuplicateCommand(normalized)) {
        this.log('중복 명령 무시:', normalized);
        return;
      }

      // AI 의도 분석 또는 기본 패턴 매칭
      const intent = await this.analyzeIntent(transcript);
      this.log('의도 분석 결과:', intent);

      // 신뢰도 기반 실행
      if (intent.confidence > 0.6) {
        await this.executeIntentAction(intent);
      } else {
        this.showFeedback('❓ 명령을 이해하지 못했습니다', 'warning');
        this.speak('명령을 다시 말씀해 주세요');
      }
    }

    isDuplicateCommand(command) {
      const now = Date.now();
      if (this.lastCommand === command && (now - this.lastCommandTime) < 1500) {
        return true;
      }
      this.lastCommand = command;
      this.lastCommandTime = now;
      return false;
    }

    isCancellation(transcript) {
      return CANCELLATION_KEYWORDS.some(keyword => transcript.includes(keyword));
    }    parseCompoundCommand(transcript) {
      // "확인, 아니 취소" 패턴 분석
      const compoundPattern = /(.*?),?\s*(아니|취소)(.*)$/;
      const match = transcript.match(compoundPattern);
      
      if (match) {
        const [, firstPart, cancellation, lastPart] = match;
        
        if (lastPart.includes('취소') || this.isCancellation(cancellation)) {
          return {
            finalCommand: '취소',
            hasCancellation: true
          };
        }
      }
      
      return {
        finalCommand: transcript,
        hasCancellation: false
      };
    }

    handleCancellation() {
      this.showFeedback('🚫 취소 처리중...', 'warning');
      
      if (this.actionHistory.length > 0) {
        const lastAction = this.actionHistory.pop();
        this.undoAction(lastAction);
        this.speak('이전 상태로 되돌렸습니다');
      } else {
        // 히스토리가 없으면 브라우저 뒤로가기
        window.history.back();
        this.speak('이전 페이지로 돌아갑니다');
      }
    }

    undoAction(action) {
      switch(action.type) {
        case 'scroll':
          window.scrollTo(action.previousX || 0, action.previousY || 0);
          break;
        case 'navigate':
        case 'click':
        default:
          window.history.back();
      }
    }    executeCommand(transcript) {
      // 명령어 매칭
      for (const cmd of DEFAULT_COMMANDS) {
        for (const keyword of cmd.keywords) {
          if (transcript.includes(keyword)) {
            this.recordAction(cmd.action);
            this.performAction(cmd.action, transcript);
            return;
          }
        }
      }

      // 동적 요소 클릭 시도
      this.tryElementClick(transcript);
    }

    performAction(action, transcript) {
      switch(action) {
        case 'next':
          this.findAndClick(['다음', 'next', '→']) || window.history.forward();
          this.speak('다음 페이지로 이동합니다');
          break;
        case 'prev':
          this.findAndClick(['이전', 'prev', '←']) || window.history.back();
          this.speak('이전 페이지로 이동합니다');
          break;
        case 'scrollTop':
          window.scrollTo({top: 0, behavior: 'smooth'});
          this.speak('페이지 상단으로 이동했습니다');
          break;
        case 'scrollBottom':
          window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'});
          this.speak('페이지 하단으로 이동했습니다');
          break;
        case 'click':
          this.handleGenericClick(transcript);
          break;
        case 'search':
          this.focusSearchElement();
          break;
        case 'menu':
          this.openMenu();
          break;
      }
    }

    tryElementClick(transcript) {
      // "X 클릭해줘" 패턴에서 X 추출
      const clickPattern = /(.*?)\s*(?:클릭|눌러|선택)/;
      const match = transcript.match(clickPattern);
      
      if (match) {
        const target = match[1].trim();
        const element = this.findElementByText(target);
        
        if (element) {
          this.highlightElement(element);
          element.click();
          this.speak(target + ' 버튼을 클릭했습니다');
          return true;
        }
      }
      
      this.speak('해당 요소를 찾을 수 없습니다');
      return false;
    }    findElementByText(text) {
      const selectors = 'button, a, input[type="submit"], [role="button"]';
      const elements = document.querySelectorAll(selectors);
      
      for (const elem of elements) {
        const content = (elem.textContent || elem.value || elem.getAttribute('aria-label') || '').toLowerCase();
        if (content.includes(text.toLowerCase())) {
          return elem;
        }
      }
      return null;
    }

    findAndClick(keywords) {
      for (const keyword of keywords) {
        const element = this.findElementByText(keyword);
        if (element) {
          this.highlightElement(element);
          element.click();
          return true;
        }
      }
      return false;
    }

    highlightElement(element) {
      element.style.outline = '3px solid #FF5722';
      element.style.backgroundColor = '#FFF3E0';
      element.style.transform = 'scale(1.05)';
      element.style.transition = 'all 0.2s ease';
      
      setTimeout(() => {
        element.style.outline = '';
        element.style.backgroundColor = '';
        element.style.transform = '';
      }, 2000);
    }

    recordAction(actionType) {
      this.actionHistory.push({
        type: actionType,
        timestamp: Date.now(),
        previousX: window.scrollX,
        previousY: window.scrollY,
        url: window.location.href
      });
      
      // 최대 10개 액션만 보관
      if (this.actionHistory.length > 10) {
        this.actionHistory.shift();
      }
    }    // AudioContext 초기화 (Safari 자동재생 정책 대응)
    initializeAudioContext() {
      if (!this.isAudioContextInitialized && typeof window !== 'undefined') {
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            this.audioContext = new AudioContext();
            this.isAudioContextInitialized = true;
            console.log("🎵 AudioContext 초기화 완료");
          }
        } catch (error) {
          console.warn("⚠️ AudioContext 초기화 실패:", error);
        }
      }
    }

    // 통합된 음성 출력 시스템 (chat VoiceManager와 동일한 로직)
    async speak(text) {
      // 기존 음성 출력 중지
      if (this.currentUtterance) {
        speechSynthesis.cancel();
      }

      if ("speechSynthesis" in window && !this.isSpeaking && !this.isGeneratingTTS) {
        this.isGeneratingTTS = true;

        try {
          console.log(`🎯 Nova TTS 시도: "${text.substring(0, 50)}..." (${text.length}자)`);

          const response = await fetch(CONFIG.TTS_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: text,
              voice: "nova",
              speed: 1.0,
            }),
          });

          if (response.ok) {
            const audioBlob = await response.blob();
            
            // 빈 오디오 파일 체크
            if (audioBlob.size < 1000) {
              console.warn("⚠️ Nova TTS 응답이 너무 작음, fallback 사용");
              this.isGeneratingTTS = false;
              this.fallbackToSpeechSynthesis(text);
              return;
            }
            
            console.log(`✅ Nova TTS 성공 (${audioBlob.size} bytes)`);
            this.isGeneratingTTS = false;
            this.isSpeaking = true;
            
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.volume = 0.9;
            
            // 자동재생 정책 우회를 위한 미리 로드
            audio.preload = 'auto';
            
            audio.onended = () => {
              this.isSpeaking = false;
              URL.revokeObjectURL(audioUrl);
              console.log("✅ Nova 음성 재생 완료");
            };

            audio.onerror = (event) => {
              console.error("❌ Nova 오디오 재생 실패:", event);
              this.isSpeaking = false;
              URL.revokeObjectURL(audioUrl);
              this.fallbackToSpeechSynthesis(text);
            };
            
            // 자동재생 차단 대응 로직
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise.catch((playError) => {
                console.warn("⚠️ 자동재생 차단됨, fallback 사용:", playError);
                this.isSpeaking = false;
                URL.revokeObjectURL(audioUrl);
                this.fallbackToSpeechSynthesis(text);
              });
            }
          } else {
            console.error(`❌ Nova TTS API 실패: ${response.status}`);
            this.isGeneratingTTS = false;
            this.fallbackToSpeechSynthesis(text);
          }
        } catch (error) {
          console.error("❌ Nova TTS 요청 실패:", error);
          this.isGeneratingTTS = false;
          this.fallbackToSpeechSynthesis(text);
        }
      }
    }

    fallbackToSpeechSynthesis(text) {
      console.log("⚠️ Fallback: 브라우저 TTS 사용 (Nova 실패)");
      
      // AudioContext 초기화 시도
      this.initializeAudioContext();
      
      this.isSpeaking = true;
      
      // 기존 utterance 정리
      if (this.currentUtterance) {
        try {
          speechSynthesis.cancel();
        } catch (error) {
          console.warn("⚠️ speechSynthesis.cancel() 실패:", error);
        }
      }
      
      // Safari 호환성을 위한 지연
      setTimeout(() => {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          this.currentUtterance = utterance;
          
          // 시니어 친화적 설정 - Nova 실패시에도 최대한 자연스럽게
          utterance.lang = "ko-KR";
          utterance.rate = 0.7;   // 더 느린 속도로 명확하게
          utterance.pitch = 1.0;  // 자연스러운 톤 유지
          utterance.volume = 0.9;
          
          // 더 나은 음성 선택 (가능한 경우)
          const voices = speechSynthesis.getVoices();
          const koreanVoice = voices.find(voice => 
            voice.lang.includes('ko') && (voice.name.includes('Google') || voice.name.includes('Samsung'))
          ) || voices.find(voice => voice.lang.includes('ko'));
          
          if (koreanVoice) {
            utterance.voice = koreanVoice;
            console.log(`🎯 최적 한국어 음성 선택: ${koreanVoice.name}`);
          }
          
          utterance.onend = () => {
            this.isSpeaking = false;
            this.currentUtterance = null;
            console.log("✅ 브라우저 TTS 완료");
          };
          utterance.onerror = (event) => {
            this.isSpeaking = false;
            this.currentUtterance = null;
            console.warn("⚠️ 브라우저 TTS 오류 (정상적 동작):", event);
          };
          
          if ('speechSynthesis' in window) {
            speechSynthesis.speak(utterance);
          }
        } catch (error) {
          console.error("❌ Fallback TTS 전체 실패:", error);
          this.isSpeaking = false;
          this.currentUtterance = null;
        }
      }, 100); // 100ms 지연으로 Safari 호환성 향상
    }

    // 음성 중지 메서드
    stopSpeaking() {
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
      if (this.currentUtterance) {
        this.currentUtterance = null;
      }
      this.isSpeaking = false;
      this.isGeneratingTTS = false;
    }

    enhanceKoreanText(text) {
      return text
        .replace(/\b안녕\b/g, '안녕하세요')
        .replace(/\b고마워\b/g, '감사합니다')
        .replace(/\b괜찮아\b/g, '괜찮습니다');
    }

    async startListening() {
      // Safari 자동재생 정책 대응: 사용자 상호작용시 AudioContext 활성화
      this.initializeAudioContext();
      
      if (this.config.useWhisper && this.config.openaiApiKey) {
        await this.startWhisperRecording();
      } else if (this.recognition && !this.isListening) {
        this.isListening = true;
        this.recognition.start();
        this.showFeedback('🎤 음성 인식 시작', 'info');
      }
    }

    async stopListening() {
      if (this.config.useWhisper && this.config.openaiApiKey) {
        try {
          await this.stopWhisperRecording();
        } catch (error) {
          this.log('Whisper 녹음 중지 실패:', error);
        }
      } else if (this.recognition && this.isListening) {
        this.isListening = false;
        this.recognition.stop();
        this.showFeedback('⏹️ 음성 인식 중지', 'info');
      }
    }

    // Whisper API 통합 메서드들
    async startWhisperRecording() {
      if (this.isListening) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          } 
        });

        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        this.audioChunks = [];
        this.isListening = true;

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.start();
        this.showFeedback('🎤 Whisper 음성 인식 시작', 'info');

      } catch (error) {
        this.showFeedback('❌ 마이크 접근 실패', 'error');
        throw error;
      }
    }

    async stopWhisperRecording() {
      return new Promise((resolve, reject) => {
        if (!this.mediaRecorder || !this.isListening) {
          reject(new Error('녹음이 시작되지 않았습니다'));
          return;
        }

        this.mediaRecorder.onstop = async () => {
          try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            const transcript = await this.transcribeWithWhisper(audioBlob);
            
            this.isListening = false;
            this.showFeedback('✅ Whisper 인식 완료', 'success');
            
            // 기존 processCommand 로직 호출
            this.processCommand(transcript);
            resolve(transcript);
          } catch (error) {
            this.isListening = false;
            this.showFeedback('❌ Whisper 인식 실패', 'error');
            reject(error);
          }
        };

        this.mediaRecorder.stop();
        
        // 스트림 정리
        if (this.mediaRecorder.stream) {
          this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
      });
    }

    async transcribeWithWhisper(audioBlob) {
      if (!this.config.openaiApiKey) {
        throw new Error('OpenAI API 키가 필요합니다');
      }

      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', this.config.language?.split('-')[0] || 'ko');
      formData.append('response_format', 'verbose_json');
      formData.append('temperature', '0');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Whisper API 오류: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      this.log('Whisper 결과:', result);
      
      return result.text || '';
    }

    focusSearchElement() {
      const searchSelectors = [
        'input[type="search"]', 'input[placeholder*="검색"]', 
        '.search-input', '#search', '[aria-label*="검색"]'
      ];
      
      for (const selector of searchSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          element.focus();
          this.highlightElement(element);
          this.speak('검색창을 선택했습니다');
          return;
        }
      }
      this.speak('검색창을 찾을 수 없습니다');
    }

    openMenu() {
      const menuSelectors = [
        '.menu-button', '.hamburger', '[aria-label*="메뉴"]',
        'button[aria-expanded]', '.nav-toggle'
      ];
      
      for (const selector of menuSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          this.highlightElement(element);
          element.click();
          this.speak('메뉴를 열었습니다');
          return;
        }
      }
      this.speak('메뉴 버튼을 찾을 수 없습니다');
    }    injectStyles() {
      if (document.getElementById('ai-assistant-styles')) return;
      
      const styles = document.createElement('style');
      styles.id = 'ai-assistant-styles';
      styles.textContent = `
        .ai-feedback {
          position: fixed; top: 20px; right: 20px; z-index: 10000;
          padding: 12px 20px; border-radius: 25px; font-weight: bold;
          font-size: 14px; max-width: 300px; word-wrap: break-word;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          animation: slideIn 0.3s ease; transition: opacity 0.3s;
        }
        .ai-feedback-info { background: #2196F3; color: white; }
        .ai-feedback-error { background: #F44336; color: white; }
        .ai-feedback-warning { background: #FF9800; color: white; }
        .ai-feedback-success { background: #4CAF50; color: white; }
        
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }

    log(message, data) {
      if (this.config.enableLogging) {
        console.log('[AI Assistant]', message, data || '');
      }
    }

    // 공개 API
    start() { this.startListening(); }
    stop() { this.stopListening(); }
    say(text) { this.speak(text); }
    stopSpeech() { this.stopSpeaking(); }
  }

  // 전역 설치 함수
  window.AIAssistant = {
    init: function(config) {
      if (!window._aiAssistantInstance) {
        window._aiAssistantInstance = new AIAssistantStandalone(config);
      }
      return window._aiAssistantInstance;
    },
    
    getInstance: function() {
      return window._aiAssistantInstance;
    }
  };

  // 자동 시작 (data-auto-start 속성 체크)
  document.addEventListener('DOMContentLoaded', function() {
    const scripts = document.getElementsByTagName('script');
    for (const script of scripts) {
      if (script.src.includes('ai-assistant') && script.hasAttribute('data-auto-start')) {
        window.AIAssistant.init();
        break;
      }
    }
  });

})(window);    // AI 의도 분석
    async analyzeIntent(transcript) {
      const normalized = transcript.toLowerCase().trim();
      
      // 캐시 확인
      if (this.intentCache.has(normalized)) {
        return this.intentCache.get(normalized);
      }

      // AI 분석 (OpenAI API 사용)
      if (this.config.useAIIntent && this.config.openaiApiKey) {
        try {
          const aiResult = await this.callOpenAI(transcript);
          this.intentCache.set(normalized, aiResult);
          return aiResult;
        } catch (error) {
          this.log('AI 분석 실패, 기본 패턴 사용:', error);
        }
      }

      // 기본 패턴 매칭
      const basicResult = this.matchBasicPatterns(transcript);
      this.intentCache.set(normalized, basicResult);
      return basicResult;
    }

    async callOpenAI(transcript) {
      const systemPrompt = `당신은 시니어 친화형 웹 접근성 AI 어시스턴트의 의도 분석 전문가입니다.
사용자의 한국어 음성 명령을 정확히 분석하여 웹 인터페이스 제어 의도를 파악하세요.

컨텍스트: 
- 대상: 시니어 사용자 (65세+)
- 환경: 웹 브라우저 (PC/태블릿)
- 목적: 음성으로 웹사이트 조작 지원

의도 카테고리:
1. login: 로그인/회원가입/인증 관련
2. search: 검색/찾기/조회 관련
3. confirm: 확인/선택/클릭/실행 관련
4. cancel: 취소/되돌리기/종료 관련
5. navigate: 이동/스크롤/페이지 이동 관련
6. input: 입력/작성/수정 관련
7. read: 읽기/보기/듣기 관련

응답 형식 (JSON만):
{"intent": "카테고리", "confidence": 0.0-1.0, "target": "구체적 대상", "action": "세부 동작"}`;

      const userPrompt = `음성 명령: "${transcript}"

현재 페이지 컨텍스트를 고려하여 가장 적절한 의도를 분석하세요.
신뢰도는 음성 명령의 명확성과 의도의 확실성을 반영하여 설정하세요.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 150,
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        
        return {
          intent: result.intent,
          confidence: result.confidence,
          target: result.target,
          action: result.action,
          source: 'gpt-4o',
          originalText: transcript
        };
      }

      throw new Error('OpenAI API 호출 실패');
    }    matchBasicPatterns(transcript) {
      const patterns = [
        // 로그인 패턴 (다양한 표현)
        { 
          keywords: ['로그인', '들어가', '접속', '로그온'], 
          intent: 'login', confidence: 0.85 
        },
        // 검색 패턴
        { 
          keywords: ['검색', '찾아', '찾기', '찾고'], 
          intent: 'search', confidence: 0.85 
        },
        // 확인/클릭 패턴  
        { 
          keywords: ['확인', '클릭', '선택', '눌러', '이걸로', '좋아'], 
          intent: 'confirm', confidence: 0.8 
        },
        // 취소 패턴
        { 
          keywords: ['아니', '취소', '되돌려', '그만', '잘못'], 
          intent: 'cancel', confidence: 0.9 
        },
        // 네비게이션 패턴
        { 
          keywords: ['다음', '이전', '위로', '아래로', '넘어'], 
          intent: 'navigate', confidence: 0.8 
        }
      ];

      for (const pattern of patterns) {
        if (pattern.keywords.some(keyword => transcript.includes(keyword))) {
          return {
            intent: pattern.intent,
            confidence: pattern.confidence,
            source: 'pattern',
            originalText: transcript
          };
        }
      }

      return { intent: 'unknown', confidence: 0.1, source: 'none' };
    }

    async executeIntentAction(intent) {
      this.showFeedback(`🎯 ${intent.source}: ${intent.intent} (${Math.round(intent.confidence*100)}%)`, 'info');

      switch(intent.intent) {
        case 'login':
          this.findAndClickByText(['로그인', 'login', '로그인하기']);
          this.speak('로그인을 진행합니다');
          break;
          
        case 'search':
          this.focusSearchElement();
          if (intent.target) {
            this.speak(`${intent.target}를 검색하겠습니다`);
          }
          break;
          
        case 'confirm':
          this.handleGenericClick(intent.originalText);
          break;
          
        case 'cancel':
          this.handleCancellation();
          break;
          
        case 'navigate':
          this.handleNavigation(intent.originalText);
          break;

        case 'input':
          this.handleTextInput(intent);
          break;

        case 'read':
          this.handleReadContent(intent);
          break;
          
        default:
          this.speak('명령을 이해하지 못했습니다');
      }
    }

    handleTextInput(intent) {
      const inputElements = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
      if (inputElements.length > 0) {
        const firstInput = inputElements[0];
        firstInput.focus();
        this.speak('입력 필드를 선택했습니다');
      } else {
        this.speak('입력할 수 있는 곳을 찾을 수 없습니다');
      }
    }

    handleReadContent(intent) {
      const readableElements = document.querySelectorAll('h1, h2, p, article, main');
      if (readableElements.length > 0) {
        const content = Array.from(readableElements)
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 10)
          .slice(0, 3)
          .join('. ');
        
        if (content) {
          this.speak(content);
        } else {
          this.speak('읽을 내용을 찾을 수 없습니다');
        }
      }
    }

    findAndClickByText(searchTerms) {
      for (const term of searchTerms) {
        const element = this.findElementByText(term);
        if (element) {
          this.highlightElement(element);
          element.click();
          this.recordAction('click');
          return true;
        }
      }
      return false;
    }