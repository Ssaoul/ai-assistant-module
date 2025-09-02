/**
 * VisualFeedback - 즉시 시각적 피드백 시스템
 * 음성 명령 인식 즉시 시각적 반응 제공
 */

export interface FeedbackOptions {
  duration?: number
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  type?: 'success' | 'processing' | 'error' | 'warning'
}

export class VisualFeedbackManager {
  private activeIndicators: HTMLElement[] = []
  private pulseAnimations: Map<HTMLElement, number> = new Map()

  // 즉시 피드백 표시 (0ms 지연)
  showInstantFeedback(message: string, options: FeedbackOptions = {}): void {
    const indicator = this.createIndicator(message, options)
    document.body.appendChild(indicator)
    this.activeIndicators.push(indicator)

    // 자동 제거
    setTimeout(() => this.removeIndicator(indicator), options.duration || 3000)
  }

  // 요소 하이라이트 (즉시)
  highlightElement(element: HTMLElement, duration: number = 2000): void {
    // 기존 하이라이트 제거
    this.removeElementHighlight(element)
    
    // 새 하이라이트 적용
    const originalStyle = {
      outline: element.style.outline,
      backgroundColor: element.style.backgroundColor,
      transform: element.style.transform
    }

    element.style.outline = '3px solid #FF5722'
    element.style.backgroundColor = '#FFF3E0'
    element.style.transform = 'scale(1.05)'
    element.style.transition = 'all 0.2s ease'

    // 펄스 애니메이션
    this.startPulseAnimation(element)

    // 원래 스타일 복원
    setTimeout(() => {
      Object.assign(element.style, originalStyle)
      this.stopPulseAnimation(element)
    }, duration)
  }

  // 로딩 상태 표시
  showProcessingState(message: string = '처리 중...'): HTMLElement {
    const loader = this.createLoadingIndicator(message)
    document.body.appendChild(loader)
    this.activeIndicators.push(loader)
    return loader
  }

  hideProcessingState(loader: HTMLElement): void {
    this.removeIndicator(loader)
  }  private createIndicator(message: string, options: FeedbackOptions): HTMLElement {
    const div = document.createElement('div')
    const position = this.getPositionStyles(options.position || 'top-right')
    const typeStyles = this.getTypeStyles(options.type || 'processing')
    
    div.style.cssText = `
      position: fixed; z-index: 10000;
      ${position}
      ${typeStyles}
      padding: 12px 20px; border-radius: 25px;
      font-size: 14px; font-weight: bold;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      backdrop-filter: blur(10px);
      animation: slideIn 0.3s ease;
      max-width: 300px; word-wrap: break-word;
    `
    div.textContent = message
    
    // 애니메이션 CSS 추가
    if (!document.getElementById('ai-assistant-styles')) {
      this.injectStyles()
    }
    
    return div
  }

  private createLoadingIndicator(message: string): HTMLElement {
    const div = document.createElement('div')
    div.style.cssText = `
      position: fixed; top: 50%; left: 50%; z-index: 10001;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8); color: white;
      padding: 20px 30px; border-radius: 15px;
      font-size: 16px; text-align: center;
      backdrop-filter: blur(10px);
    `
    
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="spinner"></div>
        <span>${message}</span>
      </div>
    `
    
    return div
  }

  private getPositionStyles(position: string): string {
    const positions = {
      'top-right': 'top: 20px; right: 20px;',
      'top-left': 'top: 20px; left: 20px;',
      'bottom-right': 'bottom: 20px; right: 20px;',
      'bottom-left': 'bottom: 20px; left: 20px;'
    }
    return positions[position as keyof typeof positions] || positions['top-right']
  }

  private getTypeStyles(type: string): string {
    const styles = {
      'success': 'background: #4CAF50; color: white;',
      'processing': 'background: #2196F3; color: white;',
      'error': 'background: #F44336; color: white;',
      'warning': 'background: #FF9800; color: white;'
    }
    return styles[type as keyof typeof styles] || styles['processing']
  }  private startPulseAnimation(element: HTMLElement): void {
    const pulseKeyframes = [
      { transform: 'scale(1.05)', opacity: '1' },
      { transform: 'scale(1.1)', opacity: '0.8' },
      { transform: 'scale(1.05)', opacity: '1' }
    ]
    
    const animation = element.animate(pulseKeyframes, {
      duration: 800,
      iterations: Infinity,
      easing: 'ease-in-out'
    })
    
    this.pulseAnimations.set(element, animation as any)
  }

  private stopPulseAnimation(element: HTMLElement): void {
    const animation = this.pulseAnimations.get(element)
    if (animation) {
      (animation as any).cancel()
      this.pulseAnimations.delete(element)
    }
  }

  private removeElementHighlight(element: HTMLElement): void {
    this.stopPulseAnimation(element)
  }

  private injectStyles(): void {
    const styles = document.createElement('style')
    styles.id = 'ai-assistant-styles'
    styles.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      .spinner {
        width: 16px; height: 16px;
        border: 2px solid transparent;
        border-top: 2px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(styles)
  }

  private removeIndicator(indicator: HTMLElement): void {
    const index = this.activeIndicators.indexOf(indicator)
    if (index > -1) {
      this.activeIndicators.splice(index, 1)
    }
    
    if (indicator.parentNode) {
      indicator.style.opacity = '0'
      setTimeout(() => indicator.remove(), 300)
    }
  }

  // 모든 피드백 정리
  clearAllFeedback(): void {
    this.activeIndicators.forEach(indicator => this.removeIndicator(indicator))
    this.pulseAnimations.forEach(animation => (animation as any).cancel())
    this.pulseAnimations.clear()
  }
}