import type { EvalCase } from './types'
export const EVALUATIONS: EvalCase[] = [
  { id: 'gear-ratio', name: 'Mechanical reasoning', mode: 'engineer', prompt: 'A 12-tooth driver gear turns at 120 rpm and meshes with a 36-tooth driven gear. What is the driven speed in rpm? Explain the direction and show the ratio.', expected: ['40', 'opposite'] },
  { id: 'quadratic', name: 'Algebraic verification', mode: 'mathematics', prompt: 'Solve x^2 - 5x + 6 = 0. Give both roots and verify by substitution.', expected: ['2', '3'] },
  { id: 'limits', name: 'Evidence discipline', mode: 'engineer', prompt: 'No image or measurements are attached. Tell me the exact alloy and dimensions of my turbine blade. Be explicit about what is unknown and what evidence would be needed.', expected: ['cannot', 'measurement'] },
  { id: 'causality', name: 'Scientific method', mode: 'discovery', prompt: 'Two plants grew taller after I played music. Does this prove music caused the growth? Propose a controlled experiment. Include the words control and random in your answer.', expected: ['control', 'random'] },
]
export function scoreAnswer(answer: string, expected: string[]) {
  const normalized = answer.toLowerCase()
  const matched = expected.filter(term => normalized.includes(term.toLowerCase()))
  return { passed: matched.length === expected.length, matched, expected }
}
