// ============================================================================
// Agent Foundry — 에이전트 출산 심의 엔진
// ----------------------------------------------------------------------------
// 실행: Workflow 툴로 이 파일을 scriptPath로 지정하고, args 에 need-brief 를 넘긴다.
//   args = {
//     need: "무엇이 필요한가 (한 문단)",
//     repo: "agetech-busan",           // 대상 저장소 id (registry 참조)
//     autonomy: "L0",                  // 대상 저장소 자율등급
//     risk: "high",                    // high면 합격점 85, 아니면 75
//     existingAgents: ["planner", ...] // 중복 판정을 위한 기존 명단
//   }
// 반환: { decision: "birth"|"reject", spec, ledger }  — birth면 orchestrator가 파일로 등록.
// 헌장: foundry/CHARTER.md · 관점: foundry/perspectives.yaml
// ============================================================================
export const meta = {
  name: 'agent-foundry',
  description: '여러 관점이 논쟁해 합격점을 넘은 새 에이전트를 설계·심의·출산',
  phases: [
    { title: 'Draft',   detail: 'agent-architect가 에이전트 스펙 초안 작성/갱신' },
    { title: 'Council', detail: 'advocate·skeptic·systems·domain·ops 병렬 심의+채점' },
    { title: 'Gate',    detail: '가중 총점·차단조건·blocking 반대 판정' },
    { title: 'Birth',   detail: '통과 시 최종 스펙 확정, 미달 시 재설계 or 기각' },
  ],
}

// ---- args 방어적 정규화 ----
// Workflow 호출자가 args를 JSON 문자열로 넘겨도(흔한 실수) 객체로 복원한다.
// 이게 없으면 brief.need 가 undefined 가 되어 architect가 엉뚱한 기본 스펙을 설계한다.
let brief = args || {}
if (typeof brief === 'string') {
  try { brief = JSON.parse(brief) } catch (e) { brief = { need: brief } }
}
if (!brief || typeof brief !== 'object' || !brief.need) {
  throw new Error('Foundry: args.need 가 비어있다. {need, repo, autonomy, risk, existingAgents} 객체를 전달하라.')
}

// ---- 대상 위험도에 따른 합격점 ----
const GATE = brief.risk === 'high' ? 85 : 75
const MAX_ROUNDS = 3
const AXES = [
  { key: 'necessity', weight: 5 },
  { key: 'clarity',   weight: 4 },
  { key: 'safety',    weight: 5 },
  { key: 'fit',       weight: 3 },
  { key: 'cost',      weight: 3 },
]
const MAXW = AXES.reduce((s, a) => s + a.weight * 5, 0) // 가중 만점

const PERSPECTIVES = [
  { key: 'advocate', stance: '문제의 가치를 강하게 변론하되 초안이 실제로 달성하는지 냉정히 검증한다.' },
  { key: 'skeptic',  stance: '레드팀. 기본 입장은 반대. 중복·범위확장·실패모드·악용을 공격하고 설득돼야 물러선다.' },
  { key: 'systems',  stance: '키트 적합성·도구권한 최소화·인터페이스·유지보수성. 불필요한 도구는 차단.' },
  { key: 'domain',   stance: '휴레이 도메인/규제 경계. 개인정보·실데이터 금지, SaMD 진단·처방 금지, 컨소시엄 규약.' },
  { key: 'ops',      stance: '상시 운영비·관측가능성·롤백 용이성·자율등급 정합성.' },
]

const SPEC_SCHEMA = {
  type: 'object',
  required: ['name', 'purpose', 'inputs', 'outputs', 'tools', 'guardrails', 'success_criteria', 'system_prompt'],
  properties: {
    name: { type: 'string', description: 'kebab-case 에이전트 이름' },
    purpose: { type: 'string' },
    inputs: { type: 'string' },
    outputs: { type: 'string' },
    tools: { type: 'array', items: { type: 'string' }, description: '최소 권한 원칙. 필요 입증된 도구만.' },
    guardrails: { type: 'array', items: { type: 'string' } },
    success_criteria: { type: 'array', items: { type: 'string' }, description: '측정 가능해야 함' },
    system_prompt: { type: 'string', description: '.claude/agents/<name>.md 본문이 될 시스템 프롬프트' },
    overlaps_with: { type: 'array', items: { type: 'string' }, description: '겹칠 소지가 있는 기존 에이전트' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['scores', 'blocking', 'objections', 'summary'],
  properties: {
    scores: {
      type: 'object',
      description: '각 축 0~5',
      required: AXES.map(a => a.key),
      properties: Object.fromEntries(AXES.map(a => [a.key, { type: 'integer', minimum: 0, maximum: 5 }])),
    },
    blocking: { type: 'boolean', description: '차단 반대(자동 기각 사유)가 있는가' },
    objections: { type: 'array', items: { type: 'string' }, description: 'architect가 다음 라운드에 반영할 반대의견' },
    summary: { type: 'string' },
  },
}

function weighted(scores) {
  return AXES.reduce((s, a) => s + (scores[a.key] || 0) * a.weight, 0)
}

// ---- 심의 루프 ----
let spec = null
let objections = []
let prevScore = -Infinity
const ledger = []
const MIN_GAIN = 3 // 라운드당 최소 점수 개선. blocking이 남은 채 개선이 이보다 작으면 수렴 불가로 판단.

for (let round = 1; round <= MAX_ROUNDS; round++) {
  phase('Draft')
  const draftPrompt = [
    `너는 agent-architect다. 아래 필요를 충족하는 새 서브에이전트 스펙을 설계하라.`,
    `필요: ${brief.need}`,
    `대상 저장소: ${brief.repo} (autonomy=${brief.autonomy}, risk=${brief.risk})`,
    `기존 에이전트(중복 회피): ${(brief.existingAgents || []).join(', ') || '없음'}`,
    `헌장 원칙: 도구는 최소권한. 성공기준은 측정가능. 개인정보·SaMD 진단/처방 금지. autonomy 등급을 넘는 권한 요구 금지.`,
    round > 1 ? `\n[직전 라운드 반대의견 — 반드시 반영/반박하라]\n- ${objections.join('\n- ')}` : '',
    round > 1 ? `\n[직전 스펙]\n${JSON.stringify(spec)}` : '',
  ].join('\n')
  spec = await agent(draftPrompt, { label: `architect:r${round}`, phase: 'Draft', schema: SPEC_SCHEMA })

  phase('Council')
  const verdicts = await parallel(PERSPECTIVES.map(p => () =>
    agent(
      [
        `너는 Council의 '${p.key}' 관점이다. 입장: ${p.stance}`,
        `아래 에이전트 스펙을 헌장 루브릭(necessity·clarity·safety·fit·cost, 각 0~5)으로 채점하라.`,
        `대상 저장소 autonomy=${brief.autonomy}, risk=${brief.risk}. 기존: ${(brief.existingAgents || []).join(', ') || '없음'}.`,
        `차단조건에 해당하면 blocking=true. architect가 고칠 수 있게 objections를 구체적으로.`,
        `\n[스펙]\n${JSON.stringify(spec)}`,
      ].join('\n'),
      { label: `council:${p.key}:r${round}`, phase: 'Council', schema: VERDICT_SCHEMA },
    ).then(v => ({ perspective: p.key, ...v })),
  ))

  const valid = verdicts.filter(Boolean)
  // 총점 = 관점별 가중총점의 평균 → 100점 환산
  const perTotal = valid.map(v => (weighted(v.scores) / MAXW) * 100)
  const score = perTotal.reduce((s, x) => s + x, 0) / (perTotal.length || 1)
  const blocking = valid.filter(v => v.blocking)
  objections = valid.flatMap(v => v.objections || [])

  phase('Gate')
  const pass = score >= GATE && blocking.length === 0
  log(`R${round}: 총점 ${score.toFixed(1)}/${GATE} · blocking ${blocking.length}건 → ${pass ? '통과' : '미달'}`)
  ledger.push({ round, spec, verdicts: valid, score: Number(score.toFixed(1)), gate: GATE, blocking: blocking.length, pass })

  if (pass) {
    phase('Birth')
    return { decision: 'birth', spec, ledger, gate: GATE, score: Number(score.toFixed(1)) }
  }

  // 조기 종료: blocking이 남은 채 라운드 개선이 미미하면 3라운드까지 가지 않고 수렴 불가로 기각.
  if (round >= 2 && blocking.length > 0 && (score - prevScore) < MIN_GAIN) {
    log(`R${round}: blocking 지속 + 개선 ${(score - prevScore).toFixed(1)}<${MIN_GAIN} → 수렴 불가, 조기 종료`)
    return { decision: 'reject', spec, ledger, gate: GATE, reason: `조기 종료: blocking 반대 지속 + 라운드 개선 미미(수렴 불가). 최종 ${score.toFixed(1)}/${GATE}` }
  }
  prevScore = score
}

// 3라운드 후에도 미달 → 기각
return { decision: 'reject', spec, ledger, gate: GATE, reason: '3라운드 심의 후 합격점 미달 또는 blocking 반대 미해결' }
