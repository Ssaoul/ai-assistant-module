/**
 * KoreanSpeechOptimizer.optimizeTranscript() 회귀 테스트.
 *
 * optimizeTranscript 는 문자열 transcript 를 받아 핵심 명령/신뢰도/즉시실행
 * 여부를 계산하는 순수 함수다(DOM/부작용 없음). 이 스위트는 현재 동작을
 * 고정(lock)한다 — 기대값은 현재 구현의 실제 출력이다.
 *
 * 참고(현재 동작 문서화): 신뢰도 계산의 반복-가중치 정규식 /(\w+)\s*\1/ 은
 * JS 의 \w 가 ASCII 만 매칭하므로 한글 반복에는 걸리지 않는다. 그래서 "확인확인"
 * 같은 한글 축약 반복의 신뢰도는 패턴 선언값(0.95)이 아니라 재계산값(0.7)이며,
 * 즉시실행도 false 다. 이는 회귀 감지를 위해 실제 동작을 있는 그대로 고정한 것이다.
 */
import { KoreanSpeechOptimizer } from '../korean-speech-optimizer'

describe('KoreanSpeechOptimizer.optimizeTranscript', () => {
  let optimizer: KoreanSpeechOptimizer

  beforeEach(() => {
    optimizer = new KoreanSpeechOptimizer()
  })

  it('축약 반복 "확인확인" → 클릭 명령', () => {
    const result = optimizer.optimizeTranscript('확인확인')
    expect(result.cleanCommand).toBe('클릭')
    expect(result.confidence).toBeCloseTo(0.7, 5)
    expect(result.shouldExecuteImmediately).toBe(false)
  })

  it('축약 반복 "다음다음" → 다음 명령', () => {
    const result = optimizer.optimizeTranscript('다음다음')
    expect(result.cleanCommand).toBe('다음')
    expect(result.confidence).toBeCloseTo(0.7, 5)
    expect(result.shouldExecuteImmediately).toBe(false)
  })

  it('축약 반복 "로그인로그인" → 로그인 명령', () => {
    const result = optimizer.optimizeTranscript('로그인로그인')
    expect(result.cleanCommand).toBe('로그인')
    expect(result.confidence).toBeCloseTo(0.7, 5)
    expect(result.shouldExecuteImmediately).toBe(false)
  })

  it('감정 표현 "확인 왜 안 돼" → 클릭 + 최대 신뢰도 + 즉시실행', () => {
    const result = optimizer.optimizeTranscript('확인 왜 안 돼')
    expect(result.cleanCommand).toBe('클릭')
    expect(result.confidence).toBeCloseTo(1.0, 5)
    expect(result.shouldExecuteImmediately).toBe(true)
  })

  it('패턴에 안 걸리는 연속 중복어는 dedup 으로 하나만 남긴다', () => {
    const result = optimizer.optimizeTranscript('확인해 확인해')
    expect(result.cleanCommand).toBe('확인해')
    expect(result.confidence).toBeCloseTo(0.7, 5)
    expect(result.shouldExecuteImmediately).toBe(false)
  })

  it('패턴/중복 없는 일반 명령은 원문을 유지', () => {
    const result = optimizer.optimizeTranscript('메뉴 열어줘')
    expect(result.cleanCommand).toBe('메뉴 열어줘')
    expect(result.confidence).toBeCloseTo(0.7, 5)
    expect(result.shouldExecuteImmediately).toBe(false)
  })
})
