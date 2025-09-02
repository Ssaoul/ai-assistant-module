/**
 * VoiceEngine - TTS/STT 핵심 엔진
 * 기존 VoiceManager.tsx에서 추출한 자연스러운 Nova 음성 처리
 */

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
}

export class VoiceEngine {
  private recognitionRef: any = null
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
      ...config
    }
    this.initializeSpeechRecognition()
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
    if (!this.recognitionRef || this.isListening) return
    
    this.isListening = true
    this.recognitionRef.start()
  }

  stopListening(): void {
    if (this.recognitionRef && this.isListening) {
      this.isListening = false
      this.recognitionRef.stop()
    }
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
    if (this.recognitionRef) {
      this.recognitionRef.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript
        callback(transcript)
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
      isGeneratingTTS: this.isGeneratingTTS
    }
  }
}