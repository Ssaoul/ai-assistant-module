/**
 * AI Assistant Module - 메인 엔트리 포인트
 */

import { VoiceEngine, TTSOptions } from './core/voice-engine'
import { WhisperEngine, WhisperConfig, TranscriptionResult } from './core/whisper-engine'
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
  useWhisper?: boolean
  openaiApiKey?: string
}

export class AIAssistant {
  private voiceEngine: VoiceEngine
  private domAnalyzer: DOMAnalyzer
  private commandRouter: CommandRouter
  private config: AssistantConfig
  private isInitialized = false

  constructor(config: AssistantConfig) {
    this.config = config
    this.voiceEngine = new VoiceEngine({
      apiEndpoint: config.apiEndpoint,
      defaultVoice: config.voiceModel,
      useWhisper: config.useWhisper,
      whisperConfig: config.openaiApiKey ? {
        apiKey: config.openaiApiKey,
        language: config.language?.split('-')[0] || 'ko'
      } : undefined
    })
    this.domAnalyzer = new DOMAnalyzer()
    this.commandRouter = new CommandRouter(this.domAnalyzer, this.voiceEngine)
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    // 음성 엔진 이벤트 설정
    this.voiceEngine.onTranscriptReceived(async (transcript) => {
      const result = await this.commandRouter.processCommand(transcript)
      this.log('Command result:', result)
    })

    this.voiceEngine.onError((error) => {
      this.log('Voice engine error:', error)
    })

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

export type { VoiceCommand, CommandResult, ElementMap, InteractiveElement, TTSOptions, WhisperConfig, TranscriptionResult }
export { WhisperEngine }