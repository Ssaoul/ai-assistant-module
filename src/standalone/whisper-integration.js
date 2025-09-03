  // Whisper API 기반 음성 인식 메서드들
  async startWhisperRecording() {
    if (this.isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.isListening = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      this.showFeedback('🎤 Whisper 음성 인식 시작', 'info');

    } catch (error) {
      this.showFeedback('❌ 마이크 접근 실패', 'error');
      throw error;
    }
  }

  async stopWhisperRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isListening) {
        reject(new Error('녹음이 시작되지 않았습니다'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          const transcript = await this.transcribeWithWhisper(audioBlob);
          
          this.isListening = false;
          this.showFeedback('✅ Whisper 인식 완료', 'success');
          
          // 기존 processCommand 로직 호출
          this.processCommand(transcript);
          resolve(transcript);
        } catch (error) {
          this.isListening = false;
          this.showFeedback('❌ Whisper 인식 실패', 'error');
          reject(error);
        }
      };

      this.mediaRecorder.stop();
      
      // 스트림 정리
      if (this.mediaRecorder.stream) {
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
    });
  }

  async transcribeWithWhisper(audioBlob) {
    if (!this.config.openaiApiKey) {
      throw new Error('OpenAI API 키가 필요합니다');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', this.config.language?.split('-')[0] || 'ko');
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openaiApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Whisper API 오류: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    this.log('Whisper 결과:', result);
    
    return result.text || '';
  }