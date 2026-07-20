/**
 * 이벤트 구독 API(.on / .off) 회귀 테스트.
 *
 * README(개발자 가이드 §이벤트 리스너)가 공표한
 *   assistant.on('commandReceived', c => ...)
 *   assistant.on('error', e => ...)
 * 계약을 잠근다. 구현 전에는 `assistant.on is not a function` 으로 문서를 따라 하면 깨졌다.
 *
 * 이벤트는 **실제 처리 경로**에서 나와야 한다: VoiceEngine 이 넘긴 트랜스크립트를
 * CommandRouter.processCommand 로 처리한 뒤 그 결과를 재발행한다. `.on()` 만 있는 척하는
 * 스텁은 금지(바통 계약).
 *
 * VoiceEngine/DOMAnalyzer/CommandRouter 는 브라우저 전역(window·MutationObserver·fetch·
 * 마이크)에 의존해 node 테스트 환경에서 생성 자체가 불가능하다. 그래서 이 세 컴포넌트는
 * I/O 경계에서만 mock 한다 — 이벤트 이미터(on/off/emit)와 트랜스크립트→emit 배선은 전부
 * 실제 프로덕션 코드다.
 */
jest.mock('../core/voice-engine', () => ({
  VoiceEngine: jest.fn().mockImplementation(() => ({
    onTranscriptReceived: jest.fn(),
    onError: jest.fn(),
    startListening: jest.fn().mockResolvedValue(undefined),
    stopListening: jest.fn(),
    speak: jest.fn().mockResolvedValue(undefined),
    stopSpeaking: jest.fn(),
    state: { isListening: false, isSpeaking: false, isGeneratingTTS: false }
  }))
}))

jest.mock('../core/dom-analyzer', () => ({
  DOMAnalyzer: jest.fn().mockImplementation(() => ({
    startObserving: jest.fn(),
    stopObserving: jest.fn(),
    scanPage: jest.fn().mockResolvedValue({
      buttons: [], links: [], forms: [], inputs: [], navigation: []
    }),
    findElementByDescription: jest.fn().mockReturnValue(null)
  }))
}))

jest.mock('../core/command-router', () => ({
  CommandRouter: jest.fn().mockImplementation(() => ({
    processCommand: jest.fn(),
    registerCommand: jest.fn(),
    removeCommand: jest.fn(),
    getAvailableCommands: jest.fn().mockReturnValue([])
  }))
}))

import { AIAssistant, CommandReceivedEvent } from '../index'

interface Harness {
  assistant: AIAssistant
  fireTranscript: (transcript: string) => Promise<void> | void
  fireVoiceError: (error: Error) => void
  processCommand: jest.Mock
}

/**
 * 새 AIAssistant 를 만들고 mock 경계를 배선한 뒤 initialize() 로
 * 프로덕션이 등록한 트랜스크립트/에러 핸들러를 포착한다.
 */
async function setup(opts: { result?: any; rejectWith?: Error } = {}): Promise<Harness> {
  const assistant = new AIAssistant({ apiKey: 'test-key' })
  const internals = assistant as any

  let transcriptHandler: (transcript: string) => Promise<void> | void = () => {}
  let voiceErrorHandler: (error: Error) => void = () => {}

  internals.voiceEngine.onTranscriptReceived.mockImplementation((cb: any) => {
    transcriptHandler = cb
  })
  internals.voiceEngine.onError.mockImplementation((cb: any) => {
    voiceErrorHandler = cb
  })

  if (opts.rejectWith) {
    internals.commandRouter.processCommand.mockRejectedValue(opts.rejectWith)
  } else {
    internals.commandRouter.processCommand.mockResolvedValue(
      opts.result ?? {
        success: true,
        message: '다음 페이지로 이동',
        executedCommand: { description: '다음 페이지로 이동' }
      }
    )
  }

  await assistant.initialize()

  return {
    assistant,
    fireTranscript: (transcript: string) => transcriptHandler(transcript),
    fireVoiceError: (error: Error) => voiceErrorHandler(error),
    processCommand: internals.commandRouter.processCommand
  }
}

describe('AIAssistant 이벤트 구독 API (.on / .off)', () => {
  it('commandReceived: 등록한 리스너가 실제 처리 결과로 정확히 1회 호출된다', async () => {
    const { assistant, fireTranscript, processCommand } = await setup()
    const received: CommandReceivedEvent[] = []
    assistant.on('commandReceived', (e) => received.push(e))

    await fireTranscript('다음')

    // 이벤트가 실제 processCommand 경로를 통과했는지 확인 (스텁이 아님)
    expect(processCommand).toHaveBeenCalledWith('다음')
    expect(processCommand).toHaveBeenCalledTimes(1)

    expect(received).toHaveLength(1)
    expect(received[0].transcript).toBe('다음')
    // README 예제: command.description
    expect(received[0].description).toBe('다음 페이지로 이동')
    expect(received[0].success).toBe(true)
    expect(received[0].result.message).toBe('다음 페이지로 이동')
  })

  it('commandReceived: executedCommand 가 없으면 결과 message 를 description 으로 넘긴다', async () => {
    const { assistant, fireTranscript } = await setup({
      result: { success: false, message: '명령을 이해하지 못했습니다' }
    })
    const received: CommandReceivedEvent[] = []
    assistant.on('commandReceived', (e) => received.push(e))

    await fireTranscript('알 수 없는 말')

    expect(received).toHaveLength(1)
    expect(received[0].description).toBe('명령을 이해하지 못했습니다')
    expect(received[0].success).toBe(false)
  })

  it('error: 명령 처리 중 예외가 나면 error 리스너가 호출된다', async () => {
    const boom = new Error('처리 실패')
    const { assistant, fireTranscript } = await setup({ rejectWith: boom })
    const errors: Error[] = []
    assistant.on('error', (e) => errors.push(e))

    await fireTranscript('무언가')

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect(errors[0].message).toBe('처리 실패')
  })

  it('error: 음성 엔진 오류 경로에서도 error 리스너가 호출된다', async () => {
    const { assistant, fireVoiceError } = await setup()
    const errors: Error[] = []
    assistant.on('error', (e) => errors.push(e))

    fireVoiceError(new Error('마이크 접근 실패'))

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('마이크 접근 실패')
  })

  it('복수 리스너: 같은 이벤트의 모든 리스너가 호출된다', async () => {
    const { assistant, fireTranscript } = await setup()
    const a: CommandReceivedEvent[] = []
    const b: CommandReceivedEvent[] = []
    assistant.on('commandReceived', (e) => a.push(e))
    assistant.on('commandReceived', (e) => b.push(e))

    await fireTranscript('다음')

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('off(): 해제된 리스너는 더 이상 호출되지 않는다', async () => {
    const { assistant, fireTranscript } = await setup()
    const seen: CommandReceivedEvent[] = []
    const listener = (e: CommandReceivedEvent) => seen.push(e)
    assistant.on('commandReceived', listener)
    assistant.off('commandReceived', listener)

    await fireTranscript('다음')

    expect(seen).toHaveLength(0)
  })

  it('on() 이 돌려준 해제 함수로도 구독이 취소된다', async () => {
    const { assistant, fireTranscript } = await setup()
    const seen: CommandReceivedEvent[] = []
    const unsubscribe = assistant.on('commandReceived', (e) => seen.push(e))
    unsubscribe()

    await fireTranscript('다음')

    expect(seen).toHaveLength(0)
  })

  it('리스너 격리: 한 리스너가 예외를 던져도 다른 리스너와 본 흐름이 죽지 않는다', async () => {
    const { assistant, fireTranscript } = await setup()
    const survived: CommandReceivedEvent[] = []
    assistant.on('commandReceived', () => {
      throw new Error('리스너 폭발')
    })
    assistant.on('commandReceived', (e) => survived.push(e))

    // 본 흐름(handleTranscript)이 리스너 예외로 reject 되지 않아야 한다.
    await expect(Promise.resolve(fireTranscript('다음'))).resolves.toBeUndefined()
    expect(survived).toHaveLength(1)
  })
})
