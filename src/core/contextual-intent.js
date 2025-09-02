/**
 * ContextualIntentAnalyzer - 맥락 기반 의도 분석
 * 현재 화면 상황 + 사용자 표현 → 정확한 의도 파악
 */

class ContextualIntentAnalyzer {
  constructor(config = {}) {
    this.config = config;
    this.pageContext = {};
    this.conversationHistory = [];
    this.maxHistorySize = 5;
  }

  // 현재 페이지 맥락 수집
  analyzePageContext() {
    const context = {
      url: window.location.href,
      title: document.title,
      availableElements: this.scanAvailableElements(),
      currentFocus: document.activeElement?.tagName || 'none',
      pageType: this.detectPageType(),
      timestamp: Date.now()
    };
    
    this.pageContext = context;
    return context;
  }

  scanAvailableElements() {
    const elements = {
      buttons: [],
      links: [],
      inputs: [],
      forms: []
    };

    // 모든 상호작용 요소 수집
    document.querySelectorAll('button, [role="button"]').forEach(btn => {
      const text = this.getElementText(btn);
      if (text) elements.buttons.push(text);
    });

    document.querySelectorAll('a[href]').forEach(link => {
      const text = this.getElementText(link);
      if (text) elements.links.push(text);
    });

    document.querySelectorAll('input, textarea, select').forEach(input => {
      const label = this.getInputLabel(input);
      if (label) elements.inputs.push(label);
    });

    return elements;
  }

  getElementText(element) {
    return (element.textContent || 
            element.value || 
            element.getAttribute('aria-label') || 
            element.getAttribute('title') || '').trim();
  }

  getInputLabel(input) {
    // placeholder, label, aria-label 순으로 확인
    return input.placeholder || 
           document.querySelector(`label[for="${input.id}"]`)?.textContent ||
           input.getAttribute('aria-label') ||
           input.name || 'input';
  }  detectPageType() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    
    if (url.includes('login') || title.includes('로그인')) return 'login';
    if (url.includes('search') || title.includes('검색')) return 'search';
    if (url.includes('cart') || title.includes('장바구니')) return 'cart';
    if (url.includes('checkout') || title.includes('결제')) return 'checkout';
    if (document.querySelector('form')) return 'form';
    
    return 'general';
  }

  // AI 기반 맥락 의도 분석
  async analyzeIntentWithContext(transcript) {
    this.analyzePageContext();
    
    // 대화 히스토리에 추가
    this.conversationHistory.push({
      transcript,
      timestamp: Date.now(),
      context: this.pageContext
    });
    
    if (this.conversationHistory.length > this.maxHistorySize) {
      this.conversationHistory.shift();
    }

    // AI에게 풍부한 맥락 정보 제공
    const contextPrompt = this.buildContextualPrompt(transcript);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: contextPrompt }],
          max_tokens: 200,
          temperature: 0.1
        })
      });

      if (response.ok) {
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
      }
    } catch (error) {
      console.warn('AI 맥락 분석 실패:', error);
    }

    // 폴백: 기본 분석
    return this.basicIntentAnalysis(transcript);
  }  buildContextualPrompt(transcript) {
    const context = this.pageContext;
    const recentHistory = this.conversationHistory.slice(-3);
    
    return `현재 웹페이지 상황을 고려하여 한국어 음성 명령의 의도를 정확히 분석해주세요.

**현재 페이지 정보:**
- URL: ${context.url}
- 제목: ${context.title}
- 페이지 유형: ${context.pageType}
- 현재 포커스: ${context.currentFocus}

**페이지에 있는 요소들:**
- 버튼: ${context.availableElements.buttons.join(', ')}
- 링크: ${context.availableElements.links.join(', ')}
- 입력창: ${context.availableElements.inputs.join(', ')}

**최근 대화 히스토리:**
${recentHistory.map(h => `- "${h.transcript}"`).join('\n')}

**사용자 음성 입력:** "${transcript}"

위 맥락을 종합하여 사용자의 정확한 의도를 파악하고, 어떤 요소에 대한 어떤 액션인지 판단해주세요.

JSON 응답:
{
  "intent": "login|search|click|cancel|navigate|form_fill",
  "target": "구체적인 대상 요소명",
  "action": "click|focus|navigate|cancel|fill",
  "confidence": 0.0-1.0,
  "reasoning": "판단 근거"
}`;
  }

  basicIntentAnalysis(transcript) {
    // AI 없이도 작동하는 기본 분석
    const normalized = transcript.toLowerCase();
    
    // 맥락 기반 가중치
    let baseConfidence = 0.5;
    
    // 페이지 타입에 따른 가중치
    if (this.pageContext.pageType === 'login' && normalized.includes('로그인')) {
      baseConfidence += 0.3;
    }
    
    if (this.pageContext.pageType === 'search' && normalized.includes('찾')) {
      baseConfidence += 0.3;
    }

    return {
      intent: this.extractBasicIntent(normalized),
      confidence: Math.min(baseConfidence, 1.0),
      source: 'basic_contextual',
      target: this.guessTarget(normalized)
    };
  }

  extractBasicIntent(text) {
    if (/로그인|들어가|접속/.test(text)) return 'login';
    if (/검색|찾/.test(text)) return 'search';
    if (/확인|클릭|선택|좋아/.test(text)) return 'click';
    if (/아니|취소|되돌려/.test(text)) return 'cancel';
    if (/다음|이전|위로|아래로/.test(text)) return 'navigate';
    return 'unknown';
  }

  guessTarget(text) {
    const { availableElements } = this.pageContext;
    
    // 페이지의 실제 요소와 매칭
    for (const button of availableElements.buttons) {
      if (text.includes(button.toLowerCase())) {
        return button;
      }
    }
    
    return 'unknown';
  }
}