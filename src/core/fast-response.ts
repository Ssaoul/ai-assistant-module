/**
 * FastResponse - 초고속 반응 시스템
 * 한국인 빠른 말하기 패턴에 최적화
 */

export interface FastResponseConfig {
  maxProcessingTime: number // 200ms 이내 반응
  duplicateThreshold: number // 중복 명령 방지 시간
  immediateActions: string[] // 즉시 실행 명령어들
}

export class FastResponseManager {
  private lastCommand: string = ''
  private lastCommandTime: number = 0
  private processingQueue: string[] = []
  private config: FastResponseConfig

  constructor(config: Partial<FastResponseConfig> = {}) {
    this.config = {
      maxProcessingTime: 200, // 200ms 이내
      duplicateThreshold: 2000, // 2초 이내 중복 방지
      immediateActions: ['확인', '클릭', '선택', '다음', '이전'],
      ...config
    }
  }

  // 즉시 피드백 제공 (명령어 인식 즉시)
  async processCommandInstant(transcript: string): Promise<boolean> {
    const normalizedCommand = transcript.toLowerCase().trim()
    
    // 1. 중복 명령 체크 (2초 이내 같은 명령 무시)
    if (this.isDuplicateCommand(normalizedCommand)) {
      console.log(`중복 명령 무시: ${normalizedCommand}`)
      return false
    }

    // 2. 즉시 시각적 피드백 (0ms)
    this.showInstantFeedback(normalizedCommand)
    
    // 3. 큐에 추가 (중복 방지)
    if (!this.processingQueue.includes(normalizedCommand)) {
      this.processingQueue.push(normalizedCommand)
    }

    // 4. 빠른 명령어는 즉시 실행
    if (this.isImmediateAction(normalizedCommand)) {
      await this.executeImmediate(normalizedCommand)
      return true
    }

    return false
  }

  private isDuplicateCommand(command: string): boolean {
    const now = Date.now()
    const timeDiff = now - this.lastCommandTime
    
    if (this.lastCommand === command && timeDiff < this.config.duplicateThreshold) {
      return true
    }

    this.lastCommand = command
    this.lastCommandTime = now
    return false
  }  private showInstantFeedback(command: string): void {
    // 즉시 시각적 피드백 (0ms 지연)
    this.createFloatingIndicator(`🎤 "${command}" 인식됨`)
    
    // 화면 요소 하이라이트 (버튼 찾으면 즉시 표시)
    this.highlightTargetElement(command)
  }

  private createFloatingIndicator(message: string): void {
    const indicator = document.createElement('div')
    indicator.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      background: #4CAF50; color: white; padding: 8px 16px;
      border-radius: 20px; font-size: 14px; font-weight: bold;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: opacity 0.3s;
    `
    indicator.textContent = message
    document.body.appendChild(indicator)

    // 3초 후 자동 제거
    setTimeout(() => {
      indicator.style.opacity = '0'
      setTimeout(() => indicator.remove(), 300)
    }, 3000)
  }

  private highlightTargetElement(command: string): void {
    // 명령어에서 타겟 추출 ("로그인 클릭해줘" → "로그인")
    const target = command.replace(/(클릭|눌러|선택).*/, '').trim()
    
    // 해당 요소 찾아서 즉시 하이라이트
    const elements = document.querySelectorAll('button, a, input[type="submit"]')
    for (const elem of elements) {
      const text = elem.textContent?.toLowerCase() || ''
      if (text.includes(target)) {
        this.addHighlight(elem as HTMLElement)
        break
      }
    }
  }

  private addHighlight(element: HTMLElement): void {
    element.style.outline = '3px solid #FF5722'
    element.style.backgroundColor = '#FFF3E0'
    
    setTimeout(() => {
      element.style.outline = ''
      element.style.backgroundColor = ''
    }, 2000)
  }

  private isImmediateAction(command: string): boolean {
    return this.config.immediateActions.some(action => 
      command.includes(action)
    )
  }

  private async executeImmediate(command: string): Promise<void> {
    // 즉시 실행 가능한 간단한 명령들
    if (command.includes('확인') || command.includes('클릭')) {
      // 현재 포커스된 요소 클릭
      const focused = document.activeElement as HTMLElement
      if (focused && focused.click) {
        focused.click()
        this.createFloatingIndicator('✅ 실행됨')
      }
    }
  }

  // 처리 큐 관리
  getProcessingQueue(): string[] {
    return [...this.processingQueue]
  }

  clearQueue(): void {
    this.processingQueue = []
  }

  removeFromQueue(command: string): void {
    const index = this.processingQueue.indexOf(command)
    if (index > -1) {
      this.processingQueue.splice(index, 1)
    }
  }
}