/**
 * KoreanCancellation - 한국어 취소/되돌리기 패턴 처리
 * "아니", "취소", "되돌리기" 등의 한국어 취소 표현 지원
 */

export interface ActionHistory {
  id: string
  timestamp: number
  action: string
  element?: HTMLElement
  previousState?: any
  canUndo: boolean
}

export class KoreanCancellationManager {
  private actionHistory: ActionHistory[] = []
  private maxHistorySize = 10
  private cancellationKeywords = [
    '아니', '아니야', '아니에요',
    '취소', '취소해줘', '취소해', 
    '되돌려', '되돌리기', '이전으로',
    '잘못됐어', '다시', '원래대로'
  ]

  // 복합 명령어 분석 ("확인, 아니 취소")
  parseCompoundCommand(transcript: string): {
    finalCommand: string
    hasCancellation: boolean
    confidence: number
  } {
    const normalized = transcript.toLowerCase().trim()
    
    // "확인, 아니 취소" 패턴 감지
    const compoundPattern = /(.*?),?\s*(아니|취소)(.*)$/
    const match = normalized.match(compoundPattern)
    
    if (match) {
      const [, firstPart, cancellation, lastPart] = match
      
      // 취소가 명확한 경우
      if (this.isCancellationWord(cancellation) || lastPart.includes('취소')) {
        return {
          finalCommand: this.extractCancellationCommand(lastPart) || '취소',
          hasCancellation: true,
          confidence: 0.9
        }
      }
    }
    
    // 단순 "아니" 명령
    if (this.cancellationKeywords.some(keyword => normalized.includes(keyword))) {
      return {
        finalCommand: '아니',
        hasCancellation: true,
        confidence: 0.85
      }
    }
    
    return {
      finalCommand: transcript,
      hasCancellation: false,
      confidence: 0.7
    }
  }

  // 액션 기록
  recordAction(action: string, element?: HTMLElement): string {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const historyItem: ActionHistory = {
      id: actionId,
      timestamp: Date.now(),
      action,
      element,
      previousState: this.capturePreviousState(element),
      canUndo: this.isUndoableAction(action)
    }
    
    this.actionHistory.unshift(historyItem)
    
    // 히스토리 크기 제한
    if (this.actionHistory.length > this.maxHistorySize) {
      this.actionHistory = this.actionHistory.slice(0, this.maxHistorySize)
    }
    
    return actionId
  }  // "아니" 명령 처리 - 즉시 되돌리기
  async handleCancellation(): Promise<boolean> {
    const lastAction = this.actionHistory[0]
    
    if (!lastAction || !lastAction.canUndo) {
      return false
    }
    
    try {
      await this.undoLastAction(lastAction)
      
      // 히스토리에서 제거
      this.actionHistory.shift()
      
      return true
    } catch (error) {
      console.error('되돌리기 실패:', error)
      return false
    }
  }

  private async undoLastAction(action: ActionHistory): Promise<void> {
    switch (action.action) {
      case 'navigate':
        // 페이지 이동 되돌리기
        window.history.back()
        break
        
      case 'click':
        // 클릭 되돌리기 (가능한 경우)
        if (action.element && this.hasUndoButton()) {
          const undoBtn = document.querySelector('[data-undo], .undo-btn, .back-btn')
          if (undoBtn) (undoBtn as HTMLElement).click()
        } else {
          window.history.back()
        }
        break
        
      case 'form_submit':
        // 폼 제출 되돌리기
        window.history.back()
        break
        
      case 'scroll':
        // 스크롤 되돌리기
        if (action.previousState?.scrollY !== undefined) {
          window.scrollTo(0, action.previousState.scrollY)
        }
        break
        
      default:
        // 일반적인 되돌리기
        window.history.back()
    }
  }

  private isCancellationWord(word: string): boolean {
    return this.cancellationKeywords.includes(word)
  }

  private extractCancellationCommand(text: string): string | null {
    if (text.includes('취소')) return '취소'
    if (text.includes('되돌')) return '되돌리기'
    if (text.includes('이전')) return '이전으로'
    return null
  }

  private capturePreviousState(element?: HTMLElement): any {
    return {
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      url: window.location.href,
      timestamp: Date.now()
    }
  }

  private isUndoableAction(action: string): boolean {
    const undoableActions = ['navigate', 'click', 'form_submit', 'scroll']
    return undoableActions.includes(action)
  }

  private hasUndoButton(): boolean {
    return !!document.querySelector('[data-undo], .undo-btn, .back-btn, .cancel-btn')
  }

  // 히스토리 관리
  getLastAction(): ActionHistory | null {
    return this.actionHistory[0] || null
  }

  canUndo(): boolean {
    const lastAction = this.getLastAction()
    return lastAction ? lastAction.canUndo : false
  }

  clearHistory(): void {
    this.actionHistory = []
  }
}