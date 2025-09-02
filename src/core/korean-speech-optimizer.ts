/**
 * KoreanSpeechOptimizer - 한국인 말하기 패턴 최적화
 * 빠른 말하기, 반복 명령, 감정적 표현 처리
 */

export interface SpeechPattern {
  pattern: RegExp
  confidence: number
  action: string
}

export class KoreanSpeechOptimizer {
  private repeatThreshold = 1500 // 1.5초 이내 반복 감지
  private lastProcessed: Map<string, number> = new Map()
  
  // 한국어 빠른 말하기 패턴
  private readonly patterns: SpeechPattern[] = [
    // 연속 반복 패턴
    { pattern: /^(확인|클릭|선택)\s*\1+/i, confidence: 0.9, action: 'click' },
    { pattern: /^(다음|넘어|이동)\s*\1+/i, confidence: 0.9, action: 'next' },
    
    // 감정 표현이 섞인 명령
    { pattern: /(확인|클릭).*왜.*안.*돼/i, confidence: 0.8, action: 'click' },
    { pattern: /(다음|넘어).*빨리/i, confidence: 0.8, action: 'next' },
    
    // 축약 표현
    { pattern: /^확인확인$/i, confidence: 0.95, action: 'click' },
    { pattern: /^다음다음$/i, confidence: 0.95, action: 'next' },
    { pattern: /^로그인로그인$/i, confidence: 0.95, action: 'login' },
  ]

  optimizeTranscript(transcript: string): {
    cleanCommand: string
    confidence: number
    shouldExecuteImmediately: boolean
  } {
    const normalized = transcript.trim()
    
    // 1. 반복 패턴 감지 및 정리
    const cleanCommand = this.extractCleanCommand(normalized)
    
    // 2. 신뢰도 계산
    const confidence = this.calculateConfidence(normalized, cleanCommand)
    
    // 3. 즉시 실행 여부 판단
    const shouldExecuteImmediately = this.shouldExecuteImmediately(normalized, confidence)
    
    return {
      cleanCommand,
      confidence,
      shouldExecuteImmediately
    }
  }

  private extractCleanCommand(transcript: string): string {
    // 패턴 매칭으로 핵심 명령어 추출
    for (const pattern of this.patterns) {
      if (pattern.pattern.test(transcript)) {
        return this.mapActionToCommand(pattern.action)
      }
    }

    // 기본적인 중복 제거
    const words = transcript.split(/\s+/)
    const uniqueWords = []
    let lastWord = ''
    
    for (const word of words) {
      if (word !== lastWord) {
        uniqueWords.push(word)
        lastWord = word
      }
    }
    
    return uniqueWords.join(' ')
  }  private calculateConfidence(original: string, cleaned: string): number {
    // 기본 신뢰도
    let confidence = 0.5
    
    // 반복이 많을수록 높은 신뢰도 (사용자가 확실함)
    const repetitionCount = (original.match(/(\w+)\s*\1/g) || []).length
    confidence += Math.min(repetitionCount * 0.2, 0.4)
    
    // 감정 표현이 있으면 높은 신뢰도
    if (/왜.*안.*돼|빨리|제발|좀/.test(original)) {
      confidence += 0.3
    }
    
    // 명령어 길이가 짧으면 높은 신뢰도
    if (cleaned.length <= 10) {
      confidence += 0.2
    }
    
    return Math.min(confidence, 1.0)
  }

  private shouldExecuteImmediately(transcript: string, confidence: number): boolean {
    // 고신뢰도 + 간단한 명령 = 즉시 실행
    if (confidence > 0.8 && transcript.length <= 15) {
      return true
    }
    
    // 반복 패턴 감지 = 즉시 실행
    if (/^(\w+)\s*\1+/.test(transcript)) {
      return true
    }
    
    // 감정적 표현 = 즉시 실행
    if (/왜.*안.*돼|제발|좀/.test(transcript)) {
      return true
    }
    
    return false
  }

  private mapActionToCommand(action: string): string {
    const actionMap: { [key: string]: string } = {
      'click': '클릭',
      'next': '다음',
      'previous': '이전',
      'login': '로그인',
      'search': '검색',
      'menu': '메뉴'
    }
    
    return actionMap[action] || action
  }

  // 중복 명령 방지
  isRecentlyProcessed(command: string): boolean {
    const lastTime = this.lastProcessed.get(command)
    if (!lastTime) return false
    
    return (Date.now() - lastTime) < this.repeatThreshold
  }

  markAsProcessed(command: string): void {
    this.lastProcessed.set(command, Date.now())
    
    // 오래된 기록 정리 (메모리 누수 방지)
    const cutoff = Date.now() - this.repeatThreshold * 2
    for (const [cmd, time] of this.lastProcessed.entries()) {
      if (time < cutoff) {
        this.lastProcessed.delete(cmd)
      }
    }
  }

  // 긴급 명령어 감지 (즉시 처리 필요)
  isUrgentCommand(transcript: string): boolean {
    return /왜.*안.*돼|빨리|제발|좀|멈춰|중단/.test(transcript)
  }
}