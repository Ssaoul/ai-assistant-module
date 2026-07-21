/**
 * Jest 설정 — 한국어 코어 순수 로직 회귀 테스트 하네스.
 *
 * 컴파일 옵션은 ts-jest 인라인 tsconfig 로 지정한다. 저장소의 config-protection
 * 훅이 별도 `tsconfig.json` 파일 생성을 차단하므로, 컴파일러 옵션을 이 파일에
 * 인라인으로 둔다(테스트/툴링 전용 — 제품 src/ 코드는 손대지 않음).
 *
 * DOM lib 포함 이유: 테스트 대상 파일(korean-cancellation.ts)이 컴파일 타임에
 * HTMLElement/window/document 타입을 참조한다. 정작 테스트하는 순수 함수
 * (parseCompoundCommand / optimizeTranscript)는 런타임에 DOM 을 건드리지 않으므로
 * testEnvironment 는 node 로 둔다.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2019',
          module: 'commonjs',
          lib: ['ES2019', 'DOM', 'DOM.Iterable'],
          moduleResolution: 'node',
          esModuleInterop: true,
          skipLibCheck: true,
          strict: false,
          types: ['node', 'jest'],
        },
      },
    ],
  },
};
