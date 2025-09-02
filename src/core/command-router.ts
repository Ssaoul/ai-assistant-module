/**
 * CommandRouter - 음성 명령어 처리 및 라우팅
 */

import { DOMAnalyzer, InteractiveElement } from './dom-analyzer'
import { VoiceEngine } from './voice-engine'
import { KoreanCancellationManager } from './korean-cancellation'
import { VisualFeedbackManager } from './visual-feedback'

export interface VoiceCommand {
  keywords: string[]
  action: (params?: any) => Promise<void>
  description: string
  confirmRequired?: boolean
  category: 'navigation' | 'interaction' | 'form' | 'system'
}

export interface CommandResult {
  success: boolean
  message: string
  executedCommand?: VoiceCommand
}

export class CommandRouter {
  private commands: VoiceCommand[] = []
  private domAnalyzer: DOMAnalyzer
  private voiceEngine: VoiceEngine
  private cancellationManager: KoreanCancellationManager
  private visualFeedback: VisualFeedbackManager

  constructor(domAnalyzer: DOMAnalyzer, voiceEngine: VoiceEngine) {
    this.domAnalyzer = domAnalyzer
    this.voiceEngine = voiceEngine
    this.cancellationManager = new KoreanCancellationManager()
    this.visualFeedback = new VisualFeedbackManager()
    this.initializeDefaultCommands()
  }

  private initializeDefaultCommands(): void {
    // 기본 네비게이션 명령어
    this.commands = [
      {
        keywords: ['다음 페이지', '넘어가기', '다음'],
        action: async () => this.handleNavigation('next'),
        description: '다음 페이지로 이동',
        category: 'navigation'
      },
      {
        keywords: ['이전 페이지', '뒤로가기', '이전'],
        action: async () => this.handleNavigation('previous'),
        description: '이전 페이지로 이동',
        category: 'navigation'
      },
      {
        keywords: ['위로', '맨 위로', '상단으로'],
        action: async () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        description: '페이지 상단으로 스크롤',
        category: 'navigation'
      },
      {
        keywords: ['아래로', '맨 아래로', '하단으로'],
        action: async () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
        description: '페이지 하단으로 스크롤',
        category: 'navigation'
      }
    ]
  }  async processCommand(transcript: string): Promise<CommandResult> {
    // 1. 복합 명령어 분석 ("확인, 아니 취소")
    const parsed = this.cancellationManager.parseCompoundCommand(transcript)
    
    // 2. 취소 명령 우선 처리
    if (parsed.hasCancellation) {
      this.visualFeedback.showInstantFeedback('🚫 취소 처리 중...', { type: 'warning' })
      
      const undoSuccess = await this.cancellationManager.handleCancellation()
      if (undoSuccess) {
        await this.voiceEngine.speak('이전 상태로 되돌렸습니다')
        return {
          success: true,
          message: '취소 완료'
        }
      } else {
        await this.voiceEngine.speak('되돌릴 수 없습니다')
        return {
          success: false,
          message: '되돌리기 실패'
        }
      }
    }

    const normalizedTranscript = parsed.finalCommand.toLowerCase().trim()
    
    // 3. 즉시 시각적 피드백
    this.visualFeedback.showInstantFeedback(`🎤 "${normalizedTranscript}" 처리중`)
    
    // 4. 기본 명령어 처리
    for (const command of this.commands) {
      for (const keyword of command.keywords) {
        if (normalizedTranscript.includes(keyword.toLowerCase())) {
          try {
            // 액션 기록 (되돌리기용)
            const actionId = this.cancellationManager.recordAction(command.description)
            
            await command.action()
            this.visualFeedback.showInstantFeedback('✅ 완료', { type: 'success' })
            await this.voiceEngine.speak(`${command.description}을 완료했습니다`)
            
            return {
              success: true,
              message: command.description,
              executedCommand: command
            }
          } catch (error) {
            this.visualFeedback.showInstantFeedback('❌ 실패', { type: 'error' })
            return {
              success: false,
              message: `명령 실행 중 오류가 발생했습니다: ${error}`
            }
          }
        }
      }
    }
    
    // 5. 동적 요소 상호작용 시도
    return await this.tryElementInteraction(normalizedTranscript)
  }

  private async tryElementInteraction(transcript: string): Promise<CommandResult> {
    const elements = await this.domAnalyzer.scanPage()
    
    // "X 클릭해줘" 패턴 매칭
    const clickMatch = transcript.match(/(.*?)\s*(?:클릭|눌러|선택)/)
    if (clickMatch) {
      const targetName = clickMatch[1].trim()
      const element = this.findElementByName(elements, targetName)
      
      if (element) {
        element.element.click()
        return {
          success: true,
          message: `${element.description}을 클릭했습니다`
        }
      }
    }
    
    return {
      success: false,
      message: '명령을 이해하지 못했습니다'
    }
  }  private findElementByName(elements: any, targetName: string): InteractiveElement | null {
    const allElements = [
      ...elements.buttons,
      ...elements.links,
      ...elements.inputs,
      ...elements.forms,
      ...elements.navigation
    ]
    
    return allElements.find(elem => 
      elem.label.toLowerCase().includes(targetName) ||
      elem.description.toLowerCase().includes(targetName)
    ) || null
  }

  private async handleNavigation(direction: 'next' | 'previous'): Promise<void> {
    const elements = await this.domAnalyzer.scanPage()
    
    if (direction === 'next') {
      const nextBtn = elements.buttons.find(btn => 
        ['다음', 'next', '→', '>'].some(keyword => 
          btn.label.toLowerCase().includes(keyword)
        )
      )
      if (nextBtn) nextBtn.element.click()
    } else {
      const prevBtn = elements.buttons.find(btn => 
        ['이전', 'prev', '←', '<'].some(keyword => 
          btn.label.toLowerCase().includes(keyword)
        )
      )
      if (prevBtn) prevBtn.element.click()
    }
  }

  registerCommand(command: VoiceCommand): void {
    this.commands.push(command)
  }

  removeCommand(keywords: string[]): void {
    this.commands = this.commands.filter(cmd => 
      !cmd.keywords.some(keyword => keywords.includes(keyword))
    )
  }

  getAvailableCommands(): VoiceCommand[] {
    return [...this.commands]
  }
}