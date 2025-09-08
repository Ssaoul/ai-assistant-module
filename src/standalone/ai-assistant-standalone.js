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
        openaiApiKey: null,  // AI 의도 분석용 (폴백)
        hyperclovaApiKey: null, // HyperCLOVA X API 키 (우선)
        enableLogging: false,
        autoStart: false,
        useAIIntent: true,
        useWhisper: false    // Whisper 사용 여부
      }, config);

      this.recognition = null;
      this.isListening = false;
      this.recognitionActive = false;
      this.isSpeaking = false;
      this.isGeneratingTTS = false;
      this.currentUtterance = null;
      this.audioContext = null;
      this.isAudioContextInitialized = false;
      this.actionHistory = [];
      this.lastCommand = '';
      this.microphoneStream = null;
      this.lastCommandTime = 0;
      this.intentCache = new Map();
      
      // AI 음성 구분 시스템
      this.aiSpeechActive = false;
      this.aiSpeechText = '';
      this.aiSpeechKeywords = [];
      this.lastAISpeechTime = 0;
      
      // Whisper 관련 속성
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.onTranscriptReceived = null;
      
      // 향상된 인식 관련 속성
      this.waitingForConfirmation = null;
      this.noiseLevel = 0;
      this.recognitionAttempts = 0;
      this.lastSuccessfulConfig = null;
      
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
      
      // 새로운 접근: 비연속 모드로 캐시 문제 해결
      this.recognition.continuous = false;    // 명령당 단일 인식으로 캐시 방지
      this.recognition.interimResults = false; // 최종 결과만 처리
      this.recognition.lang = this.config.language;
      this.recognition.maxAlternatives = 3;   // 다중 후보로 정확도 향상
      
      // Safari 최적화는 제거 (비연속 모드에서 불필요)
      
      // 동적 환경 감지를 위한 속성
      this.noiseLevel = 0;
      this.recognitionAttempts = 0;
      this.lastSuccessfulConfig = null;

      this.recognition.onresult = (event) => {
        this.handleEnhancedSpeechResult(event);
      };

      this.recognition.onerror = (event) => {
        this.handleSpeechError(event);
      };

      this.recognition.onend = () => {
        this.handleSpeechEnd();
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
    }    // AI 기반 명령어 처리 (확인 로직 포함)
    async processCommand(transcript) {
      const normalized = transcript.toLowerCase().trim();
      this.showFeedback('🎤 "' + transcript + '" 인식됨');

      // 확인 대기 상태 처리
      if (this.waitingForConfirmation) {
        if (this.isConfirmationResponse(normalized)) {
          const originalCommand = this.waitingForConfirmation.originalCommand;
          this.waitingForConfirmation = null;
          this.showFeedback('✅ 확인됨', 'success');
          return this.processCommand(originalCommand);
        } else if (this.isCancellation(normalized)) {
          this.waitingForConfirmation = null;
          this.showFeedback('❌ 취소됨', 'info');
          this.speak('취소했습니다');
          return;
        }
        // 확인도 취소도 아니면 새로운 명령으로 처리
        this.waitingForConfirmation = null;
      }

      // 중복 명령 방지는 이미 speech recognition handler에서 처리됨

      // AI 의도 분석 또는 기본 패턴 매칭
      const intent = await this.analyzeIntent(transcript);
      this.log('의도 분석 결과:', intent);

      // 신뢰도 기반 실행 (더 관대한 임계값)
      if (intent.confidence > 0.4) {
        this.log(`🎯 실행 결정: 신뢰도 ${Math.round(intent.confidence * 100)}% (소스: ${intent.source})`);
        await this.executeIntentAction(intent);
        return intent; // 테스트를 위해 intent 결과 반환
      } else {
        this.log(`❓ 낮은 신뢰도로 실행 거부: ${Math.round(intent.confidence * 100)}%`);
        this.showFeedback('❓ 명령을 이해하지 못했습니다', 'warning');
        this.speak('명령을 다시 말씀해 주세요');
        return intent; // 낮은 신뢰도라도 intent 결과는 반환
      }
    }

    isConfirmationResponse(normalized) {
      const confirmWords = ['네', '예', '맞아', '맞습니다', '좋아', '확인', '그래'];
      return confirmWords.some(word => normalized.includes(word));
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

    // 통합된 음성 출력 시스템 (AI 음성 구분 방식)
    async speak(text) {
      // 이미 TTS가 실행 중이면 중복 실행 방지
      if (this.isSpeaking || this.isGeneratingTTS) {
        this.log('🔄 TTS 이미 실행 중 - 스킵');
        return;
      }
      
      // 텍스트 전처리로 자연스러운 발음
      const enhancedText = this.enhanceKoreanText(text);
      
      // AI 음성 출력 중임을 표시 (인식 중단하지 않음)
      this.markAISpeechActive(enhancedText);
      
      // 기존 음성 출력 중지
      if (this.currentUtterance) {
        speechSynthesis.cancel();
      }

      if ("speechSynthesis" in window && !this.isSpeaking && !this.isGeneratingTTS) {
        // 브라우저 TTS만 사용 (연속 인식 유지)
        this.fallbackToSpeechSynthesis(enhancedText);
      }
    }

    fallbackToSpeechSynthesis(text) {
      console.log("🎵 브라우저 TTS 사용 (매끄러운 연속 모드)");
      
      // AudioContext 초기화 시도
      this.initializeAudioContext();
      
      // 연속 모드: 인식은 계속 실행, 결과만 무시
      // recognition.stop()이나 abort() 호출하지 않음
      
      // 긴 텍스트 분할 처리 (자연스러운 음성을 위해)
      const sentences = this.splitIntoNaturalSentences(text);
      if (sentences.length > 1) {
        this.speakSentencesSmooth(sentences);
        return;
      }
      
      this.isSpeaking = true;
      
      // 기존 utterance 정리
      if (this.currentUtterance) {
        try {
          speechSynthesis.cancel();
        } catch (error) {
          console.warn("⚠️ speechSynthesis.cancel() 실패:", error);
        }
      }
      
      // TTS 시작 전 안전 장치: 10초 후 강제 복구
      const safetyTimeout = setTimeout(() => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.recognitionActive = false;
        this.log('⚠️ TTS 안전 장치 발동 - 강제 복구');
        // 안전 장치 발동시 음성 인식 재시작
        if (this.isListening) {
          try {
            this.recognitionActive = true;
            this.recognition.start();
          } catch (error) {
            this.recognitionActive = false;
            this.log('⚠️ 안전 장치 인식 재시작 실패:', error.message);
          }
        }
      }, 10000);
      
      // 사용자 상호작용 없이 TTS 시작 (브라우저 정책 준수)
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance = utterance;
          
          // 자연스러운 음성 설정 (말꼬리 늘어짐 방지)
          utterance.lang = "ko-KR";
          utterance.rate = 0.95;  // 속도 증가로 자연스럽게
          utterance.pitch = 1.0;  // 자연스러운 톤 유지
          utterance.volume = 0.8; // 볼륨 약간 낮춤
          
          // 자연스러운 음성 선택 (말꼬리 늘어짐 방지)
          const voices = speechSynthesis.getVoices();
          
          // 우선순위: 자연스러운 음성 > 한국어 지원
          const naturalVoice = voices.find(voice => 
            voice.lang.includes('ko') && 
            (voice.name.includes('Yuna') || voice.name.includes('Siri') || voice.name.includes('Google'))
          );
          
          const koreanVoice = voices.find(voice => voice.lang.includes('ko'));
          
          if (naturalVoice) {
            utterance.voice = naturalVoice;
            utterance.rate = 1.0; // 자연스러운 음성은 보통 속도
            utterance.pitch = 0.9; // 약간 낮은 톤으로 안정감
            console.log(`🎯 자연스러운 한국어 음성: ${naturalVoice.name}`);
          } else if (koreanVoice) {
            utterance.voice = koreanVoice;
            // 기본 한국어 음성의 경우 더 신중한 설정
            if (koreanVoice.name.includes('Google')) {
              utterance.rate = 0.9;  // Google 음성은 약간 느리게
              utterance.pitch = 0.95;
            }
            console.log(`🎯 한국어 음성 선택: ${koreanVoice.name}`);
          }
          
          utterance.onend = () => {
            clearTimeout(safetyTimeout); // 안전 장치 정리
            this.isSpeaking = false;
            this.currentUtterance = null;
            
            // AI 음성 완료 표시 (필터링 해제)
            this.markAISpeechComplete();
            
            console.log("✅ 브라우저 TTS 완료 - 연속 인식 유지");
          };
          utterance.onerror = (event) => {
            clearTimeout(safetyTimeout); // 안전 장치 정리
            this.isSpeaking = false;
            this.currentUtterance = null;
            
            // AI 음성 완료 표시 (오류 시에도)
            this.markAISpeechComplete();
            
            console.warn("⚠️ 브라우저 TTS 오류:", event);
          };
          
          if ('speechSynthesis' in window) {
            speechSynthesis.speak(utterance);
          }
      } catch (error) {
        console.error("❌ Fallback TTS 전체 실패:", error);
        this.isSpeaking = false;
        this.currentUtterance = null;
      }
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

    // 간단한 명령 기록 초기화 (TTS 완료 후)
    clearCommandHistoryAfterTTS() {
      // TTS 완료 후 명령 기록만 클리어하여 새 명령 수용
      setTimeout(() => {
        if (this.isListening) {
          this.lastCommand = '';
          this.lastCommandTime = 0;
          this.log('🔄 명령 기록 초기화 - 새 명령 대기 중');
        }
      }, 3000); // TTS 완료 후 3초 뒤 초기화
    }

    enhanceKoreanText(text) {
      return text
        // 기본 정중한 표현
        .replace(/\b안녕\b/g, '안녕하세요')
        .replace(/\b고마워\b/g, '감사합니다')
        .replace(/\b괜찮아\b/g, '괜찮습니다')
        // 말꼬리 늘어짐 방지 (종성 처리)
        .replace(/습니다\.+$/g, '습니다')
        .replace(/입니다\.+$/g, '입니다') 
        .replace(/ㅂ니다\.+$/g, 'ㅂ니다')
        // 중복 문장부호 제거
        .replace(/[\.]{2,}/g, '.')
        .replace(/[!]{2,}/g, '!')
        .replace(/[?]{2,}/g, '?')
        // 불필요한 공백 제거
        .replace(/\s+/g, ' ')
        .trim();
    }    startListening() {
      // 강화된 피드백 루프 방지 체크
      if (this.isSpeaking || this.isGeneratingTTS) {
        this.log('음성 출력 중이므로 인식 대기');
        // 연속 모드에서는 별도 스케줄링 없이 자동 재개
        return;
      }

      // 브라우저 TTS가 실행 중인지 추가 체크
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        this.log('브라우저 TTS 실행 중, 인식 대기');
        setTimeout(() => this.startListening(), 100);
        return;
      }

      // Safari 자동재생 정책 대응: 사용자 상호작용시 AudioContext 활성화
      this.initializeAudioContext();
      
      if (this.config.useWhisper) {
        this.startWhisperRecording();
      } else if (this.recognition) {
        // 마이크 권한 미리 확보 (지속적 액세스)
        this.ensureMicrophoneAccess();
        
        if (!this.isListening && !this.recognitionActive) {
          this.isListening = true;
          this.recognitionActive = true;
          this.recognition.start();
          this.showFeedback('🎤 음성 인식 시작', 'info');
        }
      }
    }

    stopListening() {
      this.log('음성 인식 완전 중지 요청');
      this.isListening = false; // 플래그 먼저 설정하여 재시작 방지
      this.recognitionActive = false;
      
      if (this.config.useWhisper && this.mediaRecorder) {
        this.stopWhisperRecording();
      } else if (this.recognition) {
        this.recognition.stop();
        this.showFeedback('⏹️ 연속 음성 인식 중지', 'info');
      }
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

    // AI 의도 분석
    async analyzeIntent(transcript) {
      const normalized = transcript.toLowerCase().trim();
      
      // 캐시 확인
      if (this.intentCache.has(normalized)) {
        return this.intentCache.get(normalized);
      }

      // AI 분석 (OpenAI API 사용)
      if (this.config.useAIIntent && (this.config.hyperclovaApiKey || this.config.openaiApiKey)) {
        try {
          // Fast-First Fallback 전략: OpenAI 먼저 (빠른 처리), 실패 시 HyperCLOVA X (맥락 파악)
          
          // 1단계: OpenAI 빠른 시도 (2초 타임아웃)
          if (this.config.openaiApiKey) {
            try {
              const openaiResult = await Promise.race([
                this.callOpenAI(transcript),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('OpenAI timeout')), 2000)
                )
              ]);
              
              if (openaiResult && openaiResult.confidence > 0.5) {
                this.log(`✅ OpenAI 빠른 처리 성공 (1단계) - 신뢰도: ${Math.round(openaiResult.confidence * 100)}%`);
                this.intentCache.set(normalized, openaiResult);
                return openaiResult;
              } else if (openaiResult && openaiResult.confidence > 0.3) {
                this.log(`⚠️ OpenAI 낮은 신뢰도 (${Math.round(openaiResult.confidence * 100)}%) - HyperCLOVA X 시도`);
              } else {
                this.log('⚠️ OpenAI 신뢰도 너무 낮음 - HyperCLOVA X 시도');
              }
            } catch (error) {
              this.log('⚠️ OpenAI 실패, HyperCLOVA X 맥락 분석으로 전환...');
            }
          }
          
          // 2단계: HyperCLOVA X 맥락 파악 (더 깊은 이해)
          if (this.config.hyperclovaApiKey) {
            this.log('🇰🇷 HyperCLOVA X 맥락 분석 시작...');
            const hyperclovaResult = await this.callHyperCLOVAForContext(transcript);
            if (hyperclovaResult && hyperclovaResult.confidence >= 0.6) {
              this.log('✅ HyperCLOVA X 맥락 파악 성공 (2단계)');
              this.intentCache.set(normalized, hyperclovaResult);
              return hyperclovaResult;
            }
          }
          
        } catch (error) {
          this.log('❌ 두 AI 모델 모두 실패, 기본 패턴 사용:', error);
        }
      }

      // 기본 패턴 매칭
      const basicResult = this.matchBasicPatterns(transcript);
      this.intentCache.set(normalized, basicResult);
      return basicResult;
    }

    // 기본 패턴 매칭 함수 (한국어 축약어 포함)
    matchBasicPatterns(transcript) {
      const normalized = transcript.toLowerCase().trim();
      this.log(`🔍 기본 패턴 매칭: "${transcript}"`);
      
      // 한국어 커피 축약어 매핑 (신뢰도 상향 조정)
      const coffeePatterns = {
        '아아': { target: '아메리카노', confidence: 0.95 },
        '아메': { target: '아메리카노', confidence: 0.9 },
        '아메리카노': { target: '아메리카노', confidence: 0.98 },
        '라떼': { target: '카페라떼', confidence: 0.95 },
        '카페라떼': { target: '카페라떼', confidence: 0.98 },
        '카푸': { target: '카푸치노', confidence: 0.8 },
        '카푸치노': { target: '카푸치노', confidence: 0.95 },
        '바닐라': { target: '바닐라라떼', confidence: 0.9 },
        '아이스티': { target: '아이스티', confidence: 0.9 },
        '티': { target: '아이스티', confidence: 0.7 },
        '초콜릿': { target: '핫초콜릿', confidence: 0.8 },
        '핫초콜릿': { target: '핫초콜릿', confidence: 0.95 },
        '코코아': { target: '핫초콜릿', confidence: 0.8 }
      };
      
      // 디저트 패턴
      const dessertPatterns = {
        '크로와상': { target: '크로와상', confidence: 0.9 },
        '빵': { target: '크로와상', confidence: 0.7 },
        '케이크': { target: '치즈케이크', confidence: 0.8 },
        '치즈케이크': { target: '치즈케이크', confidence: 0.95 },
        '마카롱': { target: '마카롱', confidence: 0.9 },
        '쿠키': { target: '마카롱', confidence: 0.6 }
      };
      
      // 액션 패턴
      const actionPatterns = {
        '주문': { intent: 'order', confidence: 0.9 },
        '결제': { intent: 'order', confidence: 0.8 },
        '취소': { intent: 'cancel', confidence: 0.9 },
        '초기화': { intent: 'clear', confidence: 0.8 },
        '지워': { intent: 'clear', confidence: 0.7 },
        '도움': { intent: 'help', confidence: 0.8 },
        '헬프': { intent: 'help', confidence: 0.8 }
      };
      
      // 문화적 맥락 패턴
      const culturalPatterns = {
        '맥날': { target: '맥도날드', confidence: 0.95, cultural: true },
        '맥도날드': { target: '맥도날드', confidence: 0.9, cultural: true },
        '스벅': { target: '스타벅스', confidence: 0.95, cultural: true },
        '스타벅스': { target: '스타벅스', confidence: 0.9, cultural: true },
        '카톡': { target: '카카오톡', confidence: 0.95, cultural: true }
      };
      
      // 모든 패턴 통합
      const allPatterns = {
        ...coffeePatterns,
        ...dessertPatterns, 
        ...actionPatterns,
        ...culturalPatterns
      };
      
      // 직접 매칭 시도
      for (const [pattern, result] of Object.entries(allPatterns)) {
        if (normalized.includes(pattern)) {
          this.log(`✅ 직접 패턴 매칭: "${pattern}" → ${result.target || result.intent}`);
          
          return {
            intent: result.intent || 'select',
            target: result.target || pattern,
            confidence: result.confidence,
            source: result.cultural ? 'basic_pattern_cultural' : 'basic_pattern',
            originalText: transcript,
            matched: pattern
          };
        }
      }
      
      // 복합 패턴 매칭 (예: "아아 주세요", "라떼 2개")
      const tokens = normalized.split(/\s+/);
      for (const token of tokens) {
        for (const [pattern, result] of Object.entries(allPatterns)) {
          if (token === pattern || token.includes(pattern)) {
            this.log(`✅ 토큰 패턴 매칭: "${token}" → ${result.target || result.intent}`);
            
            // 수량 감지
            let quantity = 1;
            const quantityMatch = normalized.match(/(\d+)개|(\d+)잔|하나|한개|두개|세개/);
            if (quantityMatch) {
              if (quantityMatch[1] || quantityMatch[2]) {
                quantity = parseInt(quantityMatch[1] || quantityMatch[2]);
              } else if (normalized.includes('두개')) {
                quantity = 2;
              } else if (normalized.includes('세개')) {
                quantity = 3;
              }
            }
            
            return {
              intent: result.intent || 'select',
              target: result.target || pattern,
              confidence: result.confidence,
              source: result.cultural ? 'basic_pattern_cultural' : 'basic_pattern',
              originalText: transcript,
              matched: token,
              quantity: quantity > 1 ? quantity : undefined
            };
          }
        }
      }
      
      // 매칭되지 않은 경우
      this.log(`❓ 패턴 매칭 실패: "${transcript}"`);
      return {
        intent: 'unknown',
        target: transcript,
        confidence: 0.3,
        source: 'basic_pattern_fallback',
        originalText: transcript
      };
    }

    // 화면의 클릭 가능한 요소들을 텍스트로 수집
    getScreenElements() {
      const elements = [];
      const selectors = [
        'button', 'a', 'input[type="submit"]', 'input[type="button"]',
        '[role="button"]', '[onclick]', '.btn', '.button'
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
          if (text && text.length > 0 && text.length < 50) {
            elements.push(`버튼: "${text}"`);
          }
        });
      });
      
      // 입력 필드도 수집
      document.querySelectorAll('input[type="text"], input[type="search"], textarea').forEach(el => {
        const placeholder = el.placeholder || el.getAttribute('aria-label') || '';
        if (placeholder) {
          elements.push(`입력창: "${placeholder}"`);
        }
      });
      
      return elements.join('\n'); // 모든 요소 포함 (제한 제거)
    }

    async callHyperCLOVAForContext(transcript) {
      // 맥락 파악 전용 HyperCLOVA X 호출
      const screenElements = this.getScreenElements();
      
      const contextPrompt = `당신은 한국어 음성 명령의 맥락을 파악하는 전문가입니다.
한국 문화와 축약어, 일상 표현을 깊이 이해하여 사용자의 의도를 정확히 파악해주세요.

음성 명령: "${transcript}"
현재 화면 요소: ${screenElements}

한국어 표현 예시:
- "맥날" = 맥도날드
- "스벅" = 스타벅스  
- "카톡" = 카카오톡
- "넷플" = 넷플릭스
- "배민" = 배달의민족
- "쿠팡" = 쿠팡

사용자가 원하는 행동을 파악하여 다음 중 선택하고 JSON으로 응답하세요:
1. click: 버튼/링크 클릭 (target에 정확한 버튼 텍스트)
2. search: 검색 실행  
3. navigate: 페이지 이동
4. scroll: 스크롤

JSON 응답: {"intent": "행동", "confidence": 0.8, "target": "구체적목표", "reasoning": "판단근거"}`;

      const response = await fetch('http://localhost:3001/api/hyperclova', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NCP-CLOVASTUDIO-API-KEY': this.config.hyperclovaApiKey
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: contextPrompt }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.status?.code === '20000' && data.result?.message) {
          let responseContent = data.result.message.content || '';
          
          // content가 비어있고 thinkingContent가 있으면 맥락에서 의도 추출
          if (!responseContent && data.result.message.thinkingContent) {
            this.log('🔍 thinking content에서 맥락 분석 중...');
            responseContent = this.extractIntentFromThinking(transcript, data.result.message.thinkingContent);
          }
          
          try {
            // ```json 제거
            if (responseContent.startsWith('```json')) {
              responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            }
            if (responseContent.startsWith('```')) {
              responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            const result = JSON.parse(responseContent);
            this.log('🤖 HyperCLOVA X 맥락 분석:', result);
            
            return {
              intent: result.intent,
              confidence: result.confidence,
              target: result.target,
              source: 'hyperclova-context',
              reasoning: result.reasoning,
              originalText: transcript
            };
          } catch (parseError) {
            this.log('❌ JSON 파싱 실패, 맥락 기반 분석 시도');
            return this.extractIntentFromThinking(transcript, data.result.message.thinkingContent || responseContent);
          }
        }
      }

      throw new Error('HyperCLOVA X 맥락 분석 실패');
    }

    async callHyperCLOVAX(transcript) {
      // 현재 화면의 모든 클릭 가능한 요소들 수집 (제한 제거)
      const screenElements = this.getScreenElements();
      
      // 극한 속도 최적화된 시스템 프롬프트 (JSON 응답 강제)
      const systemPrompt = `JSON API. Output only valid JSON. No text, no explanations.

Input: Korean voice command
Output: {"intent":"click|search|navigate|scroll", "confidence":0.1-1.0, "target":"exact_button_text"}

Buttons available: ${screenElements}

Example: {"intent":"click", "confidence":0.95, "target":"🚀 전체 테스트 실행"}`;

      const userPrompt = `"${transcript}"`;  // 단축된 사용자 프롬프트

      // 프록시 서버를 통해 HyperCLOVA X API 호출 (극한 속도 최적화)
      const response = await fetch('http://localhost:3001/api/hyperclova', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NCP-CLOVASTUDIO-API-KEY': this.config.hyperclovaApiKey,
          'X-NCP-CLOVASTUDIO-REQUEST-ID': this.generateRequestId(),
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          topP: 0.6,
          topK: 10,
          temperature: 0.1,
          maxCompletionTokens: 100,  // 극한 토큰 제한
          repetitionPenalty: 1.0,
          includeAiFilters: false  // 속도 최적화
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // V3 API 응답 처리 (thinking content 대신 content 우선)
        if (data.status?.code === '20000' && data.result?.message) {
          let responseContent = data.result.message.content || data.result.message.thinkingContent || '';
          
          // content가 비어있고 thinkingContent가 있으면 thinkingContent에서 JSON 추출 또는 생성
          if (!data.result.message.content && data.result.message.thinkingContent) {
            console.log('⚠️ thinking content에서 JSON 추출 시도');
            const thinkingContent = data.result.message.thinkingContent;
            
            // 다양한 JSON 패턴으로 시도
            const jsonPatterns = [
              /\{[^{}]*"intent"[^{}]*"confidence"[^{}]*"target"[^{}]*\}/,
              /\{.*?"intent".*?"confidence".*?"target".*?\}/,
              /\{[^}]*intent[^}]*confidence[^}]*target[^}]*\}/
            ];
            
            for (const pattern of jsonPatterns) {
              const match = thinkingContent.match(pattern);
              if (match) {
                responseContent = match[0];
                console.log('📋 JSON 추출 성공:', responseContent);
                break;
              }
            }
            
            // JSON 추출 실패 시 간단한 분석으로 JSON 생성
            if (!responseContent) {
              console.log('🔄 thinking content 기반으로 JSON 생성');
              
              // 키워드 기반 의도 분석
              const lowerTranscript = transcript.toLowerCase();
              const lowerThinking = thinkingContent.toLowerCase();
              
              let intent = 'click';
              let confidence = 0.7;
              let target = '🚀 전체 테스트 실행'; // 기본값
              
              if (lowerTranscript.includes('테스트')) {
                if (lowerTranscript.includes('전체') || lowerThinking.includes('전체')) {
                  target = '🚀 전체 테스트 실행';
                  confidence = 0.9;
                } else if (lowerTranscript.includes('ui') || lowerThinking.includes('ui')) {
                  target = '🎨 UI 테스트만';
                  confidence = 0.8;
                } else if (lowerTranscript.includes('기능') || lowerThinking.includes('기능')) {
                  target = '⚙️ 기능 테스트만';
                  confidence = 0.8;
                } else if (lowerTranscript.includes('성능') || lowerThinking.includes('성능')) {
                  target = '⚡ 성능 테스트만';
                  confidence = 0.8;
                }
              }
              
              responseContent = JSON.stringify({ intent, confidence, target });
              console.log('✅ 생성된 JSON:', responseContent);
            }
          }
          
          try {
            const result = JSON.parse(responseContent);
            console.log('🤖 HyperCLOVA X V3 JSON 응답:', result);
            return {
              intent: result.intent,
              confidence: result.confidence,
              target: result.target,
              source: 'hyperclova-x-v3',
              originalText: transcript
            };
          } catch (parseError) {
            console.log('❌ JSON 파싱 실패, 기본 패턴 사용');
            console.log('원본 응답:', responseContent);
            
            // JSON 파싱 실패 시 기본 패턴 매칭으로 폴백
            return this.matchBasicPatterns(transcript);
          }
        }
      }

      throw new Error('HyperCLOVA X API 호출 실패');
    }

    generateRequestId() {
      return Date.now().toString(16) + Math.random().toString(16).slice(2);
    }

    async callOpenAI(transcript) {
      // 현재 화면의 모든 클릭 가능한 요소들 수집
      const screenElements = this.getScreenElements();
      
      const prompt = `Return only valid JSON. No explanations, no markdown.

Voice command: "${transcript}"
Screen elements: ${screenElements}

Output format: {"intent": "click", "confidence": 0.9, "target": "exact_button_text"}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.1
        })
      });

      if (response.ok) {
        const data = await response.json();
        let content = data.choices[0].message.content.trim();
        
        // ```json 제거
        if (content.startsWith('```json')) {
          content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        }
        
        // ``` 제거
        if (content.startsWith('```')) {
          content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const result = JSON.parse(content);
        
        return {
          intent: result.intent,
          confidence: result.confidence,
          target: result.target,
          source: 'openai',
          originalText: transcript
        };
      }

      throw new Error('OpenAI API 호출 실패');
    }

    matchBasicPatterns(transcript) {
      const enhancedPatterns = [
        // 로그인 패턴 (시니어 친화적 확장)
        { 
          keywords: ['로그인', '들어가', '접속', '로그온', '들어가기', '들어가줘', '입장'], 
          intent: 'login', confidence: 0.9
        },
        // 검색 패턴 (자연어 확장)
        { 
          keywords: ['검색', '찾아', '찾기', '찾고', '찾아줘', '찾아봐', '알아봐'], 
          intent: 'search', confidence: 0.9 
        },
        // 확인/클릭 패턴 (다양한 표현)
        { 
          keywords: ['확인', '클릭', '선택', '눌러', '이걸로', '좋아', '누르기', '선택해', '이것'], 
          intent: 'confirm', confidence: 0.85 
        },
        // 취소 패턴 (강화된 감지)
        { 
          keywords: ['아니', '취소', '되돌려', '그만', '잘못', '아니야', '싫어', '멈춰'], 
          intent: 'cancel', confidence: 0.95 
        },
        // 네비게이션 패턴 (방향성 강화)
        { 
          keywords: ['다음', '이전', '위로', '아래로', '넘어', '앞으로', '뒤로', '올려', '내려'], 
          intent: 'navigate', confidence: 0.85 
        },
        // 도움말 패턴 (새로 추가)
        {
          keywords: ['도움', '도와줘', '뭐해', '뭐하지', '어떻게'],
          intent: 'help', confidence: 0.8
        }
      ];

      // 정확한 매칭 우선, 부분 매칭 보조
      for (const pattern of enhancedPatterns) {
        // 정확한 단어 매칭 (높은 신뢰도)
        const exactMatch = pattern.keywords.find(keyword => {
          const words = transcript.split(/\s+/);
          return words.includes(keyword);
        });
        
        if (exactMatch) {
          return {
            intent: pattern.intent,
            confidence: pattern.confidence,
            source: 'exact_pattern',
            originalText: transcript,
            matchedKeyword: exactMatch
          };
        }
        
        // 부분 매칭 (낮은 신뢰도)
        const partialMatch = pattern.keywords.find(keyword => transcript.includes(keyword));
        if (partialMatch) {
          return {
            intent: pattern.intent,
            confidence: pattern.confidence * 0.8, // 부분 매칭은 신뢰도 감소
            source: 'partial_pattern',
            originalText: transcript,
            matchedKeyword: partialMatch
          };
        }
      }

      return { intent: 'unknown', confidence: 0.1, source: 'none' };
    }

    async executeIntentAction(intent) {
      this.showFeedback(`🎯 의도: ${intent.intent} (${Math.round(intent.confidence*100)}%)`, 'info');

      switch(intent.intent) {
        case 'click':
          // AI가 화면에서 찾은 정확한 타겟 클릭
          if (intent.target) {
            const success = this.findAndClickByText([intent.target]);
            if (success) {
              this.speak(`${intent.target}을 선택했습니다`);
            } else {
              this.speak('해당 버튼을 찾을 수 없습니다');
            }
          } else {
            this.handleGenericClick(intent.originalText);
          }
          break;
          
        case 'search':
          this.focusSearchElement();
          this.speak('검색을 시작합니다');
          break;
          
        case 'navigate':
          this.handleNavigation(intent.originalText);
          break;
          
        case 'scroll':
          this.handleScrollCommand(intent.originalText);
          break;
          
        case 'input':
          this.speak('텍스트 입력 모드입니다');
          break;
          
        // 기존 호환성 유지
        case 'login':
          this.findAndClickByText(['로그인', 'login', '로그인하기']);
          this.speak('로그인을 진행합니다');
          break;
          
        case 'confirm':
          this.handleGenericClick(intent.originalText);
          break;
          
        case 'cancel':
          this.handleCancellation();
          break;
          
        case 'help':
          this.showHelp();
          break;
          
        default:
          this.speak('명령을 이해하지 못했습니다');
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

    handleGenericClick(transcript) {
      if (this.tryElementClick(transcript)) {
        return;
      }
      
      // 페이지의 주요 클릭 가능한 요소 찾기
      const clickableSelectors = 'button, a, input[type="submit"], [role="button"], .btn';
      const elements = document.querySelectorAll(clickableSelectors);
      
      if (elements.length > 0) {
        const element = elements[0]; // 첫 번째 클릭 가능한 요소
        this.highlightElement(element);
        element.click();
        this.recordAction('click');
        this.speak('첫 번째 버튼을 클릭했습니다');
      } else {
        this.speak('클릭할 요소를 찾지 못했습니다');
      }
    }

    handleNavigation(transcript) {
      if (transcript.includes('다음') || transcript.includes('넘어')) {
        this.performAction('next', transcript);
      } else if (transcript.includes('이전') || transcript.includes('뒤로')) {
        this.performAction('prev', transcript);
      } else if (transcript.includes('위로') || transcript.includes('상단')) {
        this.performAction('scrollTop', transcript);
      } else if (transcript.includes('아래') || transcript.includes('하단')) {
        this.performAction('scrollBottom', transcript);
      }
    }

    // Whisper 스타일 Web Speech 개선 메서드들 (연속 인식)
    handleEnhancedSpeechResult(event) {
      // TTS 중일 때는 무시하지 않고 AI 음성 에코만 필터링
      if (this.isSpeaking || this.isGeneratingTTS) {
        this.log('TTS 진행 중 - AI 음성 에코 필터링 적용');
      }
      
      const results = event.results;
      let bestTranscript = '';
      let bestConfidence = 0;
      let isFinal = false;
      
      // 가장 최신 결과만 처리 (브라우저 캐시 문제 해결)
      const latestResultIndex = results.length - 1;
      
      this.log(`🔍 인식 결과: 총 ${results.length}개, 최신 인덱스: ${latestResultIndex}`);
      
      // 가장 최신 결과에서만 데이터 추출
      if (latestResultIndex >= 0) {
        const latestResult = results[latestResultIndex];
        isFinal = latestResult.isFinal;
        
        // 최신 결과의 대안들 중 최고 신뢰도 선택
        for (let j = 0; j < latestResult.length; j++) {
          const alternative = latestResult[j];
          if (alternative.confidence > bestConfidence) {
            bestConfidence = alternative.confidence;
            bestTranscript = alternative.transcript;
          }
        }
        
        this.log(`📝 최신 결과: "${bestTranscript}" (신뢰도: ${Math.round(bestConfidence*100)}%, 최종: ${isFinal})`);
      }

      // 최종 결과가 아니면 처리하지 않음 (연속 인식)
      if (!isFinal) {
        // 중간 결과는 시각적 피드백만
        if (bestTranscript) {
          this.showFeedback(`🎤 인식 중: "${bestTranscript.substring(0, 20)}..."`, 'info');
        }
        return;
      }

      // 한국어 후처리 개선
      const enhancedTranscript = this.enhanceKoreanRecognition(bestTranscript);
      
      // AI 음성 에코 필터링 (우선 체크)
      if (this.isAISpeechEcho(enhancedTranscript)) {
        this.log(`🚫 AI 음성 에코 무시: "${enhancedTranscript}"`);
        return;
      }
      
      // 빠른 연속 모드: 매우 짧은 중복 방지 (진짜 중복만 차단)
      const now = Date.now();
      if (this.lastCommand === enhancedTranscript && (now - this.lastCommandTime) < 400) {
        this.log(`🔄 중복 명령 무시: "${enhancedTranscript}" (${now - this.lastCommandTime}ms 전 처리됨)`);
        return;
      }
      
      // 빈 결과 필터링
      if (!enhancedTranscript || enhancedTranscript.trim().length < 2) {
        this.log(`❌ 빈 인식 결과 무시: "${enhancedTranscript}"`);
        return;
      }

      // 명령 처리
      if (bestConfidence > 0.5 || this.isHighPriorityCommand(enhancedTranscript)) {
        this.recognitionAttempts = 0;
        this.lastSuccessfulConfig = this.getCurrentRecognitionConfig();
        this.lastCommand = enhancedTranscript;
        this.lastCommandTime = now;
        this.log(`✅ 명령 처리: "${enhancedTranscript}" (신뢰도: ${Math.round(bestConfidence*100)}%)`);
        
        this.processCommand(enhancedTranscript);
      } else if (bestConfidence > 0.3) {
        // 중간 신뢰도: 간단한 확인
        this.log(`🤔 확인 필요: "${enhancedTranscript}" (신뢰도: ${Math.round(bestConfidence*100)}%)`);
        this.requestConfirmation(enhancedTranscript, bestConfidence);
      } else {
        // 낮은 신뢰도: 무시하고 계속 대기 (연속 모드)
        this.log(`❌ 명령 무시: "${enhancedTranscript}" (신뢰도: ${Math.round(bestConfidence*100)}%)`);
      }
    }

    enhanceKoreanRecognition(transcript) {
      return transcript
        // 자주 틀리는 한국어 패턴 보정
        .replace(/로그 인/g, '로그인')
        .replace(/클 릭/g, '클릭')
        .replace(/검 색/g, '검색')
        .replace(/취 소/g, '취소')
        .replace(/확 인/g, '확인')
        // 동음이의어 문맥 처리
        .replace(/들어가기/g, '로그인')
        .replace(/찾아줘/g, '검색')
        .replace(/눌러줘/g, '클릭')
        // 시니어 친화적 표현 정규화
        .replace(/해주세요|해줘요/g, '해줘')
        .replace(/주세요/g, '줘')
        .trim();
    }

    isHighPriorityCommand(transcript) {
      const highPriorityPatterns = ['취소', '아니야', '도움', '정지', '멈춰'];
      return highPriorityPatterns.some(pattern => transcript.includes(pattern));
    }

    requestConfirmation(transcript, confidence) {
      this.showFeedback(`🤔 "${transcript}" 맞나요? (${Math.round(confidence*100)}%)`, 'warning');
      this.speak(`${transcript} 맞나요?`);
      
      // 다음 입력을 확인/취소로 처리
      this.waitingForConfirmation = {
        originalCommand: transcript,
        timestamp: Date.now()
      };
    }

    handleLowConfidenceResult(transcript, confidence) {
      this.recognitionAttempts++;
      
      if (this.recognitionAttempts < 3) {
        // 설정 조정 후 재시도
        this.adjustRecognitionSettings();
        this.showFeedback(`🔄 다시 말씀해 주세요 (${this.recognitionAttempts}/3)`, 'warning');
        this.speak('잘 들리지 않습니다. 다시 말씀해 주세요');
        
        setTimeout(() => {
          if (!this.isListening) this.startListening();
        }, 1000);
      } else {
        this.showFeedback('❌ 인식 실패 - 텍스트로 입력해주세요', 'error');
        this.speak('음성 인식이 어렵습니다. 화면의 버튼을 직접 눌러주세요');
        this.recognitionAttempts = 0;
      }
    }

    adjustRecognitionSettings() {
      // 환경에 따른 동적 설정 조정
      const attempt = this.recognitionAttempts;
      
      if (attempt === 1) {
        // 첫 번째 재시도: 더 관대한 설정
        this.recognition.lang = 'ko-KR';
        this.noiseLevel = 'high';
      } else if (attempt === 2) {
        // 두 번째 재시도: 가장 기본적인 설정
        this.recognition.lang = 'ko';
        this.recognition.maxAlternatives = 1;
      }
      
      this.log(`인식 설정 조정 (시도 ${attempt}):`, {
        lang: this.recognition.lang,
        maxAlternatives: this.recognition.maxAlternatives
      });
    }

    handleSpeechError(event) {
      const errorType = event.error;
      
      switch(errorType) {
        case 'network':
          this.showFeedback('🌐 네트워크 오류 - 재시도 중', 'warning');
          setTimeout(() => {
            if (this.isListening) this.recognition.start();
          }, 2000);
          break;
        case 'audio-capture':
          this.showFeedback('🎤 마이크 오류 - 권한을 확인해주세요', 'error');
          this.isListening = false;
          break;
        case 'not-allowed':
          this.showFeedback('❌ 마이크 권한이 필요합니다', 'error');
          this.isListening = false;
          break;
        case 'aborted':
          // 의도적 중단은 무시 (음성 출력 때문)
          this.log('인식 중단됨 (정상 동작)');
          break;
        default:
          this.log(`인식 오류: ${errorType}, 연속 모드 유지`);
          setTimeout(() => {
            if (this.isListening && !this.recognitionActive) {
              try {
                this.recognitionActive = true;
                this.recognition.start();
              } catch (e) {
                this.recognitionActive = false;
                this.log('인식 시작 실패:', e.message);
              }
            }
          }, 1000);
      }
    }

    handleSpeechEnd() {
      // 비연속 모드: 자동 재시작으로 연속성 구현
      this.recognitionActive = false; // 상태 업데이트
      this.log('인식 완료 - 새 명령을 위해 자동 재시작');
      
      // TTS 중이거나 중지 상태가 아니면 즉시 재시작
      if (this.isListening && !this.isSpeaking && !this.isGeneratingTTS) {
        setTimeout(() => {
          try {
            if (this.isListening && !this.recognitionActive) { // 상태 재확인
              this.recognitionActive = true;
              this.recognition.start();
              this.log('🎤 음성 인식 재시작됨');
            }
          } catch (error) {
            this.recognitionActive = false;
            this.log('⚠️ 인식 재시작 실패:', error.message);
            // 재시작 실패시 1초 후 다시 시도
            setTimeout(() => {
              if (this.isListening && !this.recognitionActive) {
                try {
                  this.recognitionActive = true;
                  this.recognition.start();
                } catch (e) {
                  this.recognitionActive = false;
                  this.log('⚠️ 재시도도 실패:', e.message);
                }
              }
            }, 1000);
          }
        }, 100); // 0.1초 지연으로 안정적 재시작
      }
    }

    getCurrentRecognitionConfig() {
      return {
        lang: this.recognition.lang,
        maxAlternatives: this.recognition.maxAlternatives,
        timestamp: Date.now()
      };
    }

    showHelp() {
      const helpMessage = '로그인, 검색, 클릭, 다음, 이전, 위로, 아래로, 취소 명령을 사용하세요';
      this.showFeedback('💡 사용 가능한 명령어', 'info');
      this.speak(helpMessage);
    }

    // 비연속 모드에서 연속성 보장 메서드
    ensureContinuousListening() {
      // 비연속 모드에서는 주기적으로 인식 상태 확인
      if (this.isListening && !this.isSpeaking && !this.isGeneratingTTS) {
        // 인식이 멈춰있으면 다시 시작
        try {
          this.recognition.start();
          this.log('🎤 인식 상태 확인 후 재시작');
        } catch (error) {
          // 이미 시작되어 있으면 무시
          if (!error.message.includes('already started')) {
            this.log('⚠️ 인식 재시작 중 오류:', error.message);
          }
        }
      }
    }

    async ensureMicrophoneAccess() {
      // 마이크 권한 지속적 유지
      try {
        if (!this.microphoneStream || this.microphoneStream.getTracks().some(track => !track.enabled)) {
          this.microphoneStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          this.log('마이크 접근 권한 확보/갱신');
        }
      } catch (error) {
        this.log('마이크 접근 실패:', error);
      }
    }

    // AI 음성 출력 중임을 표시 (인식은 계속 진행)
    markAISpeechActive(text) {
      this.aiSpeechActive = true;
      this.aiSpeechText = text.toLowerCase();
      this.lastAISpeechTime = Date.now();
      
      // AI 음성에서 키워드 추출 (인식 필터링용)
      this.aiSpeechKeywords = this.extractKeywords(text);
      
      this.log(`🤖 AI 음성 시작 - 키워드: [${this.aiSpeechKeywords.join(', ')}]`);
    }
    
    // AI 음성에서 핵심 키워드 추출
    extractKeywords(text) {
      const cleanText = text.toLowerCase()
        .replace(/[.,!?~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // 한국어 조사/어미 제거 후 핵심 단어만 추출
      const words = cleanText.split(' ');
      const keywords = words
        .filter(word => word.length >= 2)  // 2글자 이상
        .filter(word => !['입니다', '습니다', '해요', '이에요', '예요', '에서', '에게', '으로', '를', '을', '가', '이', '는', '은'].includes(word))
        .slice(0, 3);  // 최대 3개 키워드
      
      return keywords;
    }
    
    // AI 음성 완료 표시
    markAISpeechComplete() {
      this.aiSpeechActive = false;
      this.aiSpeechText = '';
      this.aiSpeechKeywords = [];
      this.log('✅ AI 음성 완료 - 필터링 해제');
    }
    
    // 인식된 음성이 AI 음성인지 판단
    isAISpeechEcho(transcript) {
      if (!this.aiSpeechActive || !this.aiSpeechKeywords.length) {
        return false;
      }
      
      const currentTime = Date.now();
      const timeSinceAISpeech = currentTime - this.lastAISpeechTime;
      
      // AI 음성 시작 후 5초 이내만 필터링
      if (timeSinceAISpeech > 5000) {
        this.markAISpeechComplete();
        return false;
      }
      
      const transcriptLower = transcript.toLowerCase();
      
      // AI 음성 키워드가 2개 이상 포함되면 AI 음성으로 판단
      const matchedKeywords = this.aiSpeechKeywords.filter(keyword => 
        transcriptLower.includes(keyword)
      );
      
      const isEcho = matchedKeywords.length >= Math.min(2, this.aiSpeechKeywords.length);
      
      if (isEcho) {
        this.log(`🚫 AI 음성 에코 감지: "${transcript}" (매칭: ${matchedKeywords.join(', ')})`);
      }
      
      return isEcho;
    }

    splitIntoNaturalSentences(text) {
      // 자연스러운 문장 분할 (말꼬리 늘어짐 방지)
      return text
        .split(/[.!?]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    async speakSentencesSmooth(sentences) {
      // 연속 인식 모드에서 매끄러운 문장별 출력
      this.isSpeaking = true;
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        
        await new Promise((resolve) => {
          const utterance = new SpeechSynthesisUtterance(sentence);
          utterance.lang = "ko-KR";
          utterance.rate = 0.95;
          utterance.pitch = 1.0;
          utterance.volume = 0.8;
          
          // 자연스러운 음성 선택
          const voices = speechSynthesis.getVoices();
          const naturalVoice = voices.find(voice => 
            voice.lang.includes('ko') && 
            (voice.name.includes('Yuna') || voice.name.includes('Siri') || voice.name.includes('Google'))
          );
          
          if (naturalVoice) {
            utterance.voice = naturalVoice;
          }
          
          utterance.onend = () => {
            // 문장 간 자연스러운 간격 (50ms)
            setTimeout(resolve, 50);
          };
          
          utterance.onerror = () => {
            console.warn(`문장 출력 실패: ${sentence}`);
            resolve();
          };
          
          speechSynthesis.speak(utterance);
        });
      }
      
      this.isSpeaking = false;
      
      // 연속 모드: 인식 중단 없이 유지
      this.isSpeaking = false;
      
      // 2초 후 인식 재개 (자기 음성 완전 소거 대기)
      setTimeout(() => {
        this.ignoringResults = false;
        this.log('🎤 문장별 출력 완료 - 인식 재개');
      }, 2000);
    }

    splitLongSentence(sentence) {
      // 긴 문장을 자연스럽게 분할
      const chunks = sentence.split(/[,，]|그리고|또한|하지만|그런데/);
      return chunks.map(chunk => chunk.trim()).filter(chunk => chunk.length > 0);
    }

    async speakSentences(sentences) {
      this.isSpeaking = true;
      
      for (let i = 0; i < sentences.length; i++) {
        if (!this.isSpeaking) break; // 중간에 중지된 경우
        
        await this.speakSingleSentence(sentences[i]);
        
        // 문장 간 자연스러운 간격
        if (i < sentences.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      this.isSpeaking = false;
      this.restartContinuousListening();
    }

    async speakSentencesWithRestart(sentences, wasListening) {
      this.isSpeaking = true;
      
      for (let i = 0; i < sentences.length; i++) {
        if (!this.isSpeaking) break;
        
        await this.speakSingleSentence(sentences[i]);
        
        if (i < sentences.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      this.isSpeaking = false;
      // 원래 인식 중이었으면 즉시 재시작
      if (wasListening || this.config.autoStart) {
        this.restartContinuousListening();
      }
    }

    restartContinuousListening() {
      if (!this.config.autoStart) return;
      
      this.log('🔄 연속 인식 즉시 재시작');
      setTimeout(() => {
        this.isListening = true;
        try {
          this.recognition.start();
          this.showFeedback('🎤 계속 듣고 있습니다', 'info');
        } catch (error) {
          this.log('연속 재시작 실패:', error);
          // 더 긴 대기 후 재시도
          setTimeout(() => {
            if (this.config.autoStart) {
              this.isListening = true;
              this.recognition.start();
            }
          }, 1500);
        }
      }, 500);
    }

    speakSingleSentence(text) {
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // 짧은 문장에 최적화된 설정
        utterance.lang = "ko-KR";
        utterance.rate = 1.0;   // 보통 속도
        utterance.pitch = 0.95; // 약간 낮은 톤
        utterance.volume = 0.8;
        
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        
        speechSynthesis.speak(utterance);
      });
    }

    // Whisper API 기반 음성 인식 메서드들
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
            
            // 콜백 호출
            if (this.onTranscriptReceived) {
              this.onTranscriptReceived(transcript);
            }
            
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

    handleScrollCommand(transcript) {
      if (transcript.includes('위로') || transcript.includes('올려')) {
        window.scrollBy(0, -300);
        this.speak('위로 스크롤합니다');
      } else if (transcript.includes('아래로') || transcript.includes('내려')) {
        window.scrollBy(0, 300);
        this.speak('아래로 스크롤합니다');
      } else if (transcript.includes('맨위') || transcript.includes('처음')) {
        window.scrollTo(0, 0);
        this.speak('맨 위로 이동합니다');
      } else if (transcript.includes('맨아래') || transcript.includes('끝')) {
        window.scrollTo(0, document.body.scrollHeight);
        this.speak('맨 아래로 이동합니다');
      }
    }

    // Helper function to extract intent from thinking content
    extractIntentFromThinking(transcript, thinkingContent) {
      try {
        this.log('🧠 HyperCLOVA X 사고 내용 분석 중...');
        
        // 한국어 맥락에서 의도 추출
        const content = thinkingContent.toLowerCase();
        const originalTranscript = transcript.toLowerCase();
        
        // 음악 관련 키워드 분석
        if (content.includes('음악') || content.includes('노래') || content.includes('재생') || 
            content.includes('플레이') || content.includes('play') ||
            originalTranscript.includes('음악') || originalTranscript.includes('노래')) {
          return {
            intent: "search",
            confidence: 0.8,
            target: "음악 재생",
            source: "hyperclova_thinking",
            reasoning: "음악/노래 관련 키워드 감지"
          };
        }
        
        // 검색 관련 키워드 분석
        if (content.includes('검색') || content.includes('찾') || content.includes('search') ||
            originalTranscript.includes('검색') || originalTranscript.includes('찾')) {
          const searchMatch = originalTranscript.match(/검색[하해]?\s*(.+)|찾[아으]\s*(.+)|search\s*(.+)/);
          const query = searchMatch ? (searchMatch[1] || searchMatch[2] || searchMatch[3] || '').trim() : '검색';
          return {
            intent: "search",
            confidence: 0.8,
            target: query,
            source: "hyperclova_thinking",
            reasoning: "검색 관련 키워드 감지"
          };
        }
        
        // 문화적 맥락 처리 (맥날, 스벅 등)
        if (content.includes('맥날') || content.includes('맥도날드') ||
            originalTranscript.includes('맥날') || originalTranscript.includes('맥도날드')) {
          return {
            intent: "search",
            confidence: 0.9,
            target: "맥도날드",
            source: "hyperclova_cultural",
            reasoning: "한국 축약어 '맥날' = 맥도날드 인식"
          };
        }
        
        if (content.includes('스벅') || content.includes('스타벅스') ||
            originalTranscript.includes('스벅') || originalTranscript.includes('스타벅스')) {
          return {
            intent: "search",
            confidence: 0.9,
            target: "스타벅스",
            source: "hyperclova_cultural",
            reasoning: "한국 축약어 '스벅' = 스타벅스 인식"
          };
        }
        
        // 카톡 관련
        if (content.includes('카톡') || content.includes('카카오톡') ||
            originalTranscript.includes('카톡') || originalTranscript.includes('카카오톡')) {
          return {
            intent: "navigate",
            confidence: 0.9,
            target: "카카오톡",
            source: "hyperclova_cultural",
            reasoning: "카카오톡 앱 실행 요청"
          };
        }
        
        // 클릭 관련 키워드
        if (content.includes('클릭') || content.includes('누르') || content.includes('선택') ||
            originalTranscript.includes('클릭') || originalTranscript.includes('누르') || originalTranscript.includes('선택')) {
          // 화면에서 클릭 가능한 요소 찾기
          const elements = document.querySelectorAll('button, a, [role="button"]');
          for (const el of elements) {
            const text = (el.textContent || '').trim();
            if (text && (originalTranscript.includes(text.toLowerCase()) || content.includes(text.toLowerCase()))) {
              return {
                intent: "click",
                confidence: 0.8,
                target: text,
                source: "hyperclova_thinking",
                reasoning: `클릭 요소 "${text}" 매칭`
              };
            }
          }
          
          return {
            intent: "click",
            confidence: 0.7,
            target: "버튼",
            source: "hyperclova_thinking",
            reasoning: "일반적인 클릭 의도 감지"
          };
        }
        
        // 스크롤 관련
        if (content.includes('스크롤') || content.includes('올려') || content.includes('내려') ||
            originalTranscript.includes('올려') || originalTranscript.includes('내려')) {
          return {
            intent: "scroll",
            confidence: 0.8,
            target: originalTranscript.includes('올려') ? "up" : "down",
            source: "hyperclova_thinking",
            reasoning: "스크롤 명령 감지"
          };
        }
        
        // 시간 관련
        if (content.includes('시간') || content.includes('time') ||
            originalTranscript.includes('시간')) {
          return {
            intent: "search",
            confidence: 0.8,
            target: "현재 시간",
            source: "hyperclova_thinking",
            reasoning: "시간 조회 요청"
          };
        }
        
        // 날씨 관련
        if (content.includes('날씨') || content.includes('weather') ||
            originalTranscript.includes('날씨')) {
          return {
            intent: "search",
            confidence: 0.8,
            target: "날씨",
            source: "hyperclova_thinking",
            reasoning: "날씨 조회 요청"
          };
        }
        
        // 기본적으로 검색으로 처리
        this.log('❓ 구체적인 의도를 찾을 수 없음, 검색으로 처리');
        return {
          intent: "search",
          confidence: 0.6,
          target: transcript,
          source: "hyperclova_fallback",
          reasoning: "명확한 의도 없음, 기본 검색 처리"
        };
        
      } catch (error) {
        this.log(`❌ 사고 내용 분석 오류: ${error.message}`);
        return {
          intent: "search",
          confidence: 0.5,
          target: transcript,
          source: "error_fallback",
          reasoning: `분석 오류: ${error.message}`
        };
      }
    }

    // 공개 API
    start() { this.startListening(); }
    stop() { this.stopListening(); }
    say(text) { this.speak(text); }
    stopSpeech() { this.stopSpeaking(); }
  }

  // 전역 클래스 노출
  window.AIAssistantStandalone = AIAssistantStandalone;
  
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

})(window);