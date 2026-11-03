import { all, create } from 'mathjs'
const math = create(all, { number: 'BigNumber', precision: 64 })
const FUNCTIONS = new Set(['sqrt', 'cbrt', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'log10', 'exp', 'pow', 'round', 'floor', 'ceil', 'min', 'max'])
const CONSTANTS = new Set(['pi', 'e', 'tau'])
export function calculate(expression: string): string {
  if (!expression.trim() || expression.length > 300) throw new Error('Use an expression between 1 and 300 characters.')
  const node = math.parse(expression)
  let count = 0
  node.traverse(n => {
    if (++count > 100) throw new Error('Expression is too complex.')
    if (!['ConstantNode', 'OperatorNode', 'ParenthesisNode', 'FunctionNode', 'SymbolNode'].includes(n.type)) throw new Error('Only numeric expressions and supported functions are allowed.')
    if (n.type === 'SymbolNode' && !CONSTANTS.has((n as any).name) && !FUNCTIONS.has((n as any).name)) throw new Error(`Unknown symbol: ${(n as any).name}`)
    if (n.type === 'OperatorNode' && !['+', '-', '*', '/', '^', '%'].includes((n as any).op)) throw new Error('Unsupported operator.')
    if (n.type === 'FunctionNode' && !FUNCTIONS.has((n as any).name)) throw new Error('Unsupported function.')
    if (n.type === 'ConstantNode' && (typeof (n as any).value === 'string' || Math.abs(Number((n as any).value)) > 1e6)) throw new Error('Use numeric constants with magnitude at most 1,000,000.')
  })
  const value = node.evaluate()
  const result = math.format(value, { precision: 48 })
  if (result.length > 1000) throw new Error('Result is too large.')
  return result
}
