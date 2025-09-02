/**
 * IntentAnalyzer - AI 기반 의도 인식
 * 다양한 한국어 표현을 표준 명령어로 변환
 */

class IntentAnalyzer {
  constructor(config = {}) {
    this.config = {
      openaiApiKey: config.openaiApiKey,
      model: 'gpt-3.5-turbo',
      enableLocalCache: true,
      ...config
    };
    
    // 로컬 캐시 (네트워크 절약)
    this.intentCache = new Map();
    
    // 기본 의도 패턴 (AI 없이도 작동)
    this.basicPatterns = this.initializeBasicPatterns();
  }

  initializeBasicPatterns() {
    return [
      // 로그인 의도
      {
        intent: 'login',
        patterns: [
          /로그인/i, /로그인해/i, /로그인할래/i, /로그인합니다/i, /로그인하자/i,
          /들어가/i, /접속/i, /로그온/i, /로그인부터/i, /먼저.*로그인/i
        ],
        action: 'click_login'
      },
      
      // 검색 의도  
      {
        intent: 'search',
        patterns: [
          /검색/i, /찾아/i, /찾기/i, /검색해/i, /찾아줘/i, /찾고싶어/i,
          /검색창/i, /검색해줘/i, /찾아보자/i, /검색하자/i
        ],
        action: 'focus_search'
      },
      
      // 확인/클릭 의도
      {
        intent: 'confirm',
        patterns: [
          /확인/i, /클릭/i, /선택/i, /눌러/i, /누르자/i, /클릭해/i,
          /확인해/i, /선택해/i, /이걸로/i, /이거/i, /ok/i, /좋아/i
        ],
        action: 'click_current'
      },
      
      // 취소 의도
      {
        intent: 'cancel', 
        patterns: [
          /아니/i, /취소/i, /되돌려/i, /안해/i, /그만/i, /잘못/i,
          /돌아가/i, /뒤로/i, /이전/i, /원래대로/i
        ],
        action: 'cancel_action'
      },
      
      // 네비게이션 의도
      {
        intent: 'navigate',
        patterns: [
          /다음/i, /넘어가/i, /이전/i, /뒤로/i, /앞으로/i, /계속/i,
          /위로/i, /아래로/i, /상단/i, /하단/i, /스크롤/i
        ],
        action: 'navigate'
      }
    ];
  }  // 메인 의도 분석 함수
  async analyzeIntent(transcript) {
    const normalized = transcript.toLowerCase().trim();
    
    // 1. 캐시 확인 (빠른 응답)
    if (this.intentCache.has(normalized)) {
      return this.intentCache.get(normalized);
    }

    // 2. 기본 패턴 매칭 (즉시 응답)
    const basicResult = this.matchBasicPatterns(normalized);
    if (basicResult.confidence > 0.7) {
      this.intentCache.set(normalized, basicResult);
      return basicResult;
    }

    // 3. AI 분석 (고도화된 이해)
    if (this.config.openaiApiKey) {
      const aiResult = await this.analyzeWithAI(transcript);
      if (aiResult.confidence > 0.6) {
        this.intentCache.set(normalized, aiResult);
        return aiResult;
      }
    }

    // 4. 폴백 (기본 패턴 결과)
    this.intentCache.set(normalized, basicResult);
    return basicResult;
  }

  matchBasicPatterns(transcript) {
    for (const pattern of this.basicPatterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(transcript)) {
          return {
            intent: pattern.intent,
            action: pattern.action,
            confidence: 0.8,
            source: 'pattern_matching',
            originalText: transcript
          };
        }
      }
    }

    return {
      intent: 'unknown',
      action: 'none',
      confidence: 0.1,
      source: 'no_match',
      originalText: transcript
    };
  }  async analyzeWithAI(transcript) {
    try {
      const prompt = `
한국어 음성 명령을 분석해서 의도를 파악해주세요.

입력: "${transcript}"

가능한 의도:
- login: 로그인 관련 (로그인해줘, 로그인할래, 들어가자 등)
- search: 검색 관련 (찾아줘, 검색해, 찾고싶어 등)  
- confirm: 확인/클릭 (확인, 클릭해, 선택해, 이걸로 등)
- cancel: 취소/되돌리기 (아니, 취소, 돌아가 등)
- navigate: 이동 (다음, 이전, 위로, 아래로 등)

JSON 형태로 응답:
{
  "intent": "의도명",
  "confidence": 0.0-1.0,
  "reasoning": "판단 근거"
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.3
        })
      });

      if (response.ok) {
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        
        return {
          intent: result.intent,
          action: this.mapIntentToAction(result.intent),
          confidence: result.confidence,
          source: 'ai_analysis',
          reasoning: result.reasoning,
          originalText: transcript
        };
      }
    } catch (error) {
      console.warn('AI 분석 실패:', error);
    }

    return this.matchBasicPatterns(transcript);
  }

  mapIntentToAction(intent) {
    const actionMap = {
      'login': 'click_login',
      'search': 'focus_search', 
      'confirm': 'click_current',
      'cancel': 'cancel_action',
      'navigate': 'navigate'
    };
    
    return actionMap[intent] || 'none';
  }

  // 캐시 관리
  clearCache() {
    this.intentCache.clear();
  }

  getCacheSize() {
    return this.intentCache.size;
  }
}