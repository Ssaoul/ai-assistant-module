/**
 * KoreanCancellationManager.parseCompoundCommand() 회귀 테스트.
 *
 * parseCompoundCommand 는 문자열 transcript 를 받아 취소 의도를 판정하는 순수
 * 함수다(DOM/부작용 없음). 이 스위트는 현재 동작을 고정(lock)해 향후 회귀를
 * 잡는 것이 목적이다 — 기대값은 기대 사양이 아니라 현재 구현의 실제 출력이다.
 */
import { KoreanCancellationManager } from '../korean-cancellation'

describe('KoreanCancellationManager.parseCompoundCommand', () => {
  let manager: KoreanCancellationManager

  beforeEach(() => {
    manager = new KoreanCancellationManager()
  })

  it('복합 명령 "확인, 아니 취소" → 취소로 판정(confidence 0.9)', () => {
    const result = manager.parseCompoundCommand('확인, 아니 취소')
    expect(result.hasCancellation).toBe(true)
    expect(result.finalCommand).toBe('취소')
    expect(result.confidence).toBeCloseTo(0.9, 5)
  })

  it('복합 명령 "확인, 아니 되돌려" → 되돌리기 명령 추출', () => {
    const result = manager.parseCompoundCommand('확인, 아니 되돌려')
    expect(result.hasCancellation).toBe(true)
    expect(result.finalCommand).toBe('되돌리기')
    expect(result.confidence).toBeCloseTo(0.9, 5)
  })

  it('"취소해줘"는 취소 단어 감지로 취소 판정', () => {
    const result = manager.parseCompoundCommand('취소해줘')
    expect(result.hasCancellation).toBe(true)
    expect(result.finalCommand).toBe('취소')
    expect(result.confidence).toBeCloseTo(0.9, 5)
  })

  it('취소 키워드만 있는 단순 명령 "다시" → 아니(confidence 0.85)', () => {
    const result = manager.parseCompoundCommand('다시')
    expect(result.hasCancellation).toBe(true)
    expect(result.finalCommand).toBe('아니')
    expect(result.confidence).toBeCloseTo(0.85, 5)
  })

  it('취소 표현이 없으면 원본 transcript 를 그대로 반환(confidence 0.7)', () => {
    const result = manager.parseCompoundCommand('확인')
    expect(result.hasCancellation).toBe(false)
    expect(result.finalCommand).toBe('확인')
    expect(result.confidence).toBeCloseTo(0.7, 5)
  })

  it('취소 없는 경우 finalCommand 는 정규화 전 원본 대소문자를 보존', () => {
    const result = manager.parseCompoundCommand('OK Google')
    expect(result.hasCancellation).toBe(false)
    expect(result.finalCommand).toBe('OK Google')
    expect(result.confidence).toBeCloseTo(0.7, 5)
  })
})
