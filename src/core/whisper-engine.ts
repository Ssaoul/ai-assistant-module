/**
 * WhisperEngine - OpenAI Whisper API 기반 음성 인식 엔진
 * 기존 Web Speech API 대체용 고성능 한국어 음성 인식
 */

export interface WhisperConfig {
  apiKey: string
  model?: 'whisper-1'
  language?: string
  temperature?: number
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
}

export interface TranscriptionResult {
  text: string
  language?: string
  duration?: number
  confidence?: number
}

export class WhisperEngine {
  private config: WhisperConfig
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private isRecording = false
  private stream: MediaStream | null = null

  constructor(config: WhisperConfig) {
    this.config = {
      model: 'whisper-1',
      language: 'ko',
      temperature: 0,
      response_format: 'verbose_json',
      ...config
    }
  }

  async startRecording(): Promise<void> {    if (this.isRecording) return

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      this.audioChunks = []
      this.isRecording = true

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.start()
    } catch (error) {
      throw new Error(`마이크 접근 실패: ${error}`)
    }
  }

  async stopRecording(): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('녹음이 시작되지 않았습니다'))
        return
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
          const result = await this.transcribeAudio(audioBlob)
          
          this.cleanup()
          resolve(result)
        } catch (error) {
          this.cleanup()
          reject(error)
        }
      }

      this.mediaRecorder.stop()
      this.isRecording = false
    })
  }

  private async transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.webm')
    formData.append('model', this.config.model!)
    
    if (this.config.language) {
      formData.append('language', this.config.language)
    }
    if (this.config.temperature !== undefined) {
      formData.append('temperature', this.config.temperature.toString())
    }
    if (this.config.response_format) {
      formData.append('response_format', this.config.response_format)
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Whisper API 오류: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    
    return {
      text: result.text || '',
      language: result.language,
      duration: result.duration,
      confidence: this.calculateConfidence(result)
    }
  }

  private calculateConfidence(result: any): number {
    // verbose_json 응답에서 신뢰도 계산
    if (result.segments && result.segments.length > 0) {
      const avgConfidence = result.segments.reduce((sum: number, segment: any) => 
        sum + (segment.avg_logprob || 0), 0) / result.segments.length
      return Math.max(0, Math.min(1, (avgConfidence + 1) / 2)) // -1~0을 0~1로 정규화
    }
    return 0.8 // 기본값
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.audioChunks = []
    this.isRecording = false
  }

  get recording(): boolean {
    return this.isRecording
  }

  destroy(): void {
    this.cleanup()
  }
}