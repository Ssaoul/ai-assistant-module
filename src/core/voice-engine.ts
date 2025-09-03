/**
 * VoiceEngine - TTS/STT 핵심 엔진
 * 기존 VoiceManager.tsx에서 추출한 자연스러운 Nova 음성 처리
 * Whisper API 통합 지원
 */

import { WhisperEngine, WhisperConfig } from './whisper-engine'

export interface TTSOptions {
  voice?: 'nova' | 'alloy' | 'echo'
  speed?: number
  language?: 'ko-KR' | 'en-US'
  volume?: number
}

export interface VoiceEngineConfig {
  apiEndpoint?: string
  defaultVoice?: string
  fallbackEnabled?: boolean
  useWhisper?: boolean
  whisperConfig?: WhisperConfig
}

export class VoiceEngine {
  private recognitionRef: any = null
  private whisperEngine: WhisperEngine | null = null
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private isListening = false
  private isSpeaking = false
  private isGeneratingTTS = false
  private config: VoiceEngineConfig

  constructor(config: VoiceEngineConfig = {}) {
    this.config = {
      apiEndpoint: '/api/tts',
      defaultVoice: 'nova',
      fallbackEnabled: true,
      useWhisper: false,
      ...config
    }
    
    if (this.config.useWhisper && this.config.whisperConfig) {
      this.whisperEngine = new WhisperEngine(this.config.whisperConfig)
    } else {
      this.initializeSpeechRecognition()
    }
  }

  private initializeSpeechRecognition(): void {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      this.recognitionRef = new SpeechRecognition()
      
      if (this.recognitionRef) {
        this.recognitionRef.continuous = false
        this.recognitionRef.interimResults = false
        this.recognitionRef.lang = "ko-KR"
      }
    }
  }  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    if (this.currentUtterance) {
      speechSynthesis.cancel()
    }

    if (!("speechSynthesis" in window) || this.isSpeaking || this.isGeneratingTTS) {
      return
    }

    this.isGeneratingTTS = true

    try {
      const response = await fetch(this.config.apiEndpoint!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: this.enhanceTextForSeniors(text),
          voice: options.voice || this.config.defaultVoice,
          speed: options.speed || 1.0,
        }),
      })

      if (response.ok) {
        this.isGeneratingTTS = false
        this.isSpeaking = true
        
        const audioBlob = await response.blob()
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        
        audio.volume = options.volume || 0.9
        audio.onended = () => this.handleAudioEnd(audioUrl)
        audio.onerror = () => this.handleAudioError(audioUrl, text)
        
        await audio.play()
      } else {
        this.isGeneratingTTS = false
        if (this.config.fallbackEnabled) {
          this.fallbackToSpeechSynthesis(text, options)
        }
      }
    } catch (error) {
      this.isGeneratingTTS = false
      if (this.config.fallbackEnabled) {
        this.fallbackToSpeechSynthesis(text, options)
      }
    }
  }  private enhanceTextForSeniors(text: string): string {
    let enhancedText = text
    
    // 시니어 친화적 존댓말 변환
    enhancedText = enhancedText.replace(/\b안녕\b/g, '안녕하세요')
    enhancedText = enhancedText.replace(/\b고마워\b/g, '감사합니다')
    enhancedText = enhancedText.replace(/\b괜찮아\b/g, '괜찮습니다')
    
    return enhancedText
  }

  private fallbackToSpeechSynthesis(text: string, options: TTSOptions = {}): void {
    this.isSpeaking = true
    const utterance = new SpeechSynthesisUtterance(text)
    this.currentUtterance = utterance
    
    utterance.lang = options.language || "ko-KR"
    utterance.rate = options.speed || 0.9
    utterance.pitch = 1.0
    utterance.volume = options.volume || 0.8
    
    utterance.onend = () => this.handleSpeechEnd()
    utterance.onerror = () => this.handleSpeechEnd()
    
    speechSynthesis.speak(utterance)
  }

  private handleAudioEnd(audioUrl: string): void {
    this.isSpeaking = false
    URL.revokeObjectURL(audioUrl)
  }

  private handleAudioError(audioUrl: string, text: string): void {
    this.isSpeaking = false
    URL.revokeObjectURL(audioUrl)
    if (this.config.fallbackEnabled) {
      this.fallbackToSpeechSynthesis(text)
    }
  }

  private handleSpeechEnd(): void {
    this.isSpeaking = false
    this.currentUtterance = null
  }

  async startListening(): Promise<void> {
    if (this.isListening) return

    this.isListening = true

    if (this.config.useWhisper && this.whisperEngine) {
      try {
        await this.whisperEngine.startRecording()
      } catch (error) {
        this.isListening = false
        throw error
      }
    } else if (this.recognitionRef) {
      this.recognitionRef.start()
    }
  }

  async stopListening(): Promise<string | null> {
    if (!this.isListening) return null

    this.isListening = false

    if (this.config.useWhisper && this.whisperEngine) {
      try {
        const result = await this.whisperEngine.stopRecording()
        return result.text
      } catch (error) {
        console.error('Whisper 전사 오류:', error)
        return null
      }
    } else if (this.recognitionRef) {
      this.recognitionRef.stop()
      return null // Web Speech API는 콜백으로 처리
    }

    return null
  }

  stopSpeaking(): void {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel()
    }
    if (this.currentUtterance) {
      this.currentUtterance = null
    }
    this.isSpeaking = false
  }

  onTranscriptReceived(callback: (transcript: string) => void): void {
    if (this.config.useWhisper) {
      // Whisper는 stopListening()에서 직접 텍스트 반환
      this.transcriptCallback = callback
    } else if (this.recognitionRef) {
      this.recognitionRef.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        callback(transcript)
      }
    }
  }

  private transcriptCallback?: (transcript: string) => void

  async processWhisperResult(): Promise<void> {
    if (this.config.useWhisper && this.transcriptCallback) {
      const transcript = await this.stopListening()
      if (transcript) {
        this.transcriptCallback(transcript)
      }
    }
  }

  onError(callback: (error: Error) => void): void {
    if (this.recognitionRef) {
      this.recognitionRef.onerror = (event: any) => {
        callback(new Error(event.error))
      }
    }
  }

  get state() {
    return {
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
      isGeneratingTTS: this.isGeneratingTTS,
      usingWhisper: this.config.useWhisper || false
    }
  }

  destroy(): void {
    this.stopListening()
    this.stopSpeaking()
    if (this.whisperEngine) {
      this.whisperEngine.destroy()
    }
  }
}