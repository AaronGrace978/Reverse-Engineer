import { parentPort, workerData } from 'node:worker_threads'
import { calculate } from './calculator'
try { parentPort!.postMessage({ result: calculate(workerData) }) }
catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : 'Calculation failed.' }) }
