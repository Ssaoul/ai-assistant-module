/**
 * AI Assistant Module - 메인 엔트리 포인트
 */

import { VoiceEngine, TTSOptions } from './core/voice-engine'
import { DOMAnalyzer, ElementMap, InteractiveElement } from './core/dom-analyzer'
import { CommandRouter, VoiceCommand, CommandResult } from './core/command-router'

export interface AssistantConfig {
  apiKey: string
  language?: 'ko-KR' | 'en-US'
  voiceModel?: 'nova' | 'alloy' | 'echo'
  mode?: 'senior-friendly' | 'standard'
  enableLogging?: boolean
  customCommands?: VoiceCommand[]
  apiEndpoint?: string
}

/**
 * `commandReceived` 이벤트 페이로드.
 *
 * README(개발자 가이드 §이벤트 리스너)의 `assistant.on('commandReceived', c => c.description)`
 * 예제가 그대로 동작하도록 최상위에 `description` 을 둔다. CommandRouter.processCommand 가
 * 돌려주는 실제 `CommandResult` 에는 최상위 `description` 이 없으므로(매칭된 명령의
 * `executedCommand.description`, 없으면 `message`), 소비자 계약(`description`)과 내부
 * 처리 결과를 잇는 얇은 래퍼다. 원본 결과 전체는 `result` 로 함께 전달한다.
 */
export interface CommandReceivedEvent {
  /** 인식된 원문 발화 */
  transcript: string
  /** 처리된 명령 설명 — 매칭된 명령의 description, 없으면 결과 message */
  description: string
  /** 명령 처리 성공 여부 */
  success: boolean
  /** CommandRouter 의 원본 처리 결과 */
  result: CommandResult
}

/** AIAssistant 가 발행하는 이벤트 이름 → 페이로드 매핑 (타입 안전 이미터의 근거) */
export interface AssistantEventMap {
  commandReceived: CommandReceivedEvent
  error: Error
}

export type AssistantEventName = keyof AssistantEventMap
export type AssistantEventListener<K extends AssistantEventName> = (
  payload: AssistantEventMap[K]
) => void

export class AIAssistant {
  private voiceEngine: VoiceEngine
  private domAnalyzer: DOMAnalyzer
  private commandRouter: CommandRouter
  private config: AssistantConfig
  private isInitialized = false
  // 이벤트 이름 → 리스너 집합. 공개 표면은 타입 안전(on/off/emit)하고,
  // 내부 저장은 Set<Function> 으로 단순화한다. Set 은 중복 등록을 자동 병합한다.
  private eventListeners: Map<AssistantEventName, Set<(payload: any) => void>> = new Map()

  constructor(config: AssistantConfig) {
    this.config = config
    this.voiceEngine = new VoiceEngine({
      apiEndpoint: config.apiEndpoint,
      defaultVoice: config.voiceModel
    })
    this.domAnalyzer = new DOMAnalyzer()
    this.commandRouter = new CommandRouter(this.domAnalyzer, this.voiceEngine)
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    // 음성 엔진 이벤트 설정 — 실제 명령 처리 결과/오류를 공개 이벤트로 재발행
    this.voiceEngine.onTranscriptReceived((transcript) => this.handleTranscript(transcript))
    this.voiceEngine.onError((error) => this.handleVoiceError(error))

    // DOM 관찰 시작
    this.domAnalyzer.startObserving()

    // 커스텀 명령어 등록
    if (this.config.customCommands) {
      this.config.customCommands.forEach(cmd => 
        this.commandRouter.registerCommand(cmd)
      )
    }

    // 초기 페이지 스캔
    await this.domAnalyzer.scanPage()

    this.isInitialized = true
    this.log('AI Assistant 초기화 완료')
  }  // 공개 API 메서드
  async startListening(): Promise<void> {
    this.ensureInitialized()
    await this.voiceEngine.startListening()
  }

  stopListening(): void {
    this.voiceEngine.stopListening()
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    this.ensureInitialized()
    await this.voiceEngine.speak(text, options)
  }

  stopSpeaking(): void {
    this.voiceEngine.stopSpeaking()
  }

  async scanPage(): Promise<ElementMap> {
    this.ensureInitialized()
    return await this.domAnalyzer.scanPage()
  }

  findElement(description: string): HTMLElement | null {
    this.ensureInitialized()
    return this.domAnalyzer.findElementByDescription(description)
  }

  addCustomCommand(command: VoiceCommand): void {
    this.commandRouter.registerCommand(command)
  }

  removeCommand(keywords: string[]): void {
    this.commandRouter.removeCommand(keywords)
  }

  getVoiceState() {
    return this.voiceEngine.state
  }

  /**
   * 이벤트 구독. `commandReceived`(명령 처리 결과) 또는 `error`(처리·음성 오류)를
   * 구독한다. 반환된 함수를 호출하면 해제되므로 `off` 없이도 해제할 수 있다.
   *
   * @example
   * const off = assistant.on('commandReceived', (c) => console.log(c.description))
   * off() // 해제
   */
  on<K extends AssistantEventName>(event: K, listener: AssistantEventListener<K>): () => void {
    let listeners = this.eventListeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(event, listeners)
    }
    listeners.add(listener as (payload: any) => void)
    return () => this.off(event, listener)
  }

  /** 이벤트 구독 해제. 등록되지 않은 리스너를 넘겨도 안전(무시). */
  off<K extends AssistantEventName>(event: K, listener: AssistantEventListener<K>): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(listener as (payload: any) => void)
    }
  }

  private emit<K extends AssistantEventName>(event: K, payload: AssistantEventMap[K]): void {
    const listeners = this.eventListeners.get(event)
    if (!listeners || listeners.size === 0) return
    // 스냅샷 순회: 리스너가 순회 중 on/off 를 호출해도 안전하다.
    for (const listener of Array.from(listeners)) {
      try {
        listener(payload)
      } catch (err) {
        // 리스너 격리: 한 리스너의 예외가 다른 리스너·본 흐름을 죽이지 않는다.
        // (error 리스너의 예외를 다시 emit('error') 하면 무한 루프이므로 로그만 남긴다.)
        this.log(`이벤트 리스너 처리 중 오류 (${event}):`, err)
      }
    }
  }

  private async handleTranscript(transcript: string): Promise<void> {
    try {
      const result = await this.commandRouter.processCommand(transcript)
      this.log('Command result:', result)
      this.emit('commandReceived', {
        transcript,
        description: result.executedCommand?.description ?? result.message,
        success: result.success,
        result
      })
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleVoiceError(error: Error): void {
    this.log('Voice engine error:', error)
    this.emit('error', error)
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('AI Assistant가 초기화되지 않았습니다. initialize()를 먼저 호출하세요.')
    }
  }

  private log(message: string, data?: any): void {
    if (this.config.enableLogging) {
      console.log(`[AI Assistant] ${message}`, data || '')
    }
  }

  destroy(): void {
    this.domAnalyzer.stopObserving()
    this.voiceEngine.stopListening()
    this.voiceEngine.stopSpeaking()
    this.eventListeners.clear()
    this.isInitialized = false
  }
}

// 전역 변수로 쉬운 접근 제공
declare global {
  interface Window {
    AIAssistant: typeof AIAssistant
  }
}

// 브라우저 환경에서 전역 접근 가능
if (typeof window !== 'undefined') {
  window.AIAssistant = AIAssistant
}

export { VoiceCommand, CommandResult, ElementMap, InteractiveElement, TTSOptions }