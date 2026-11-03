export type Mode = 'engineer' | 'mathematics' | 'discovery'
export type ProviderId = 'openai' | 'anthropic' | 'google' | 'ollama-cloud' | 'ollama-local' | 'openrouter' | 'xai' | 'deepseek' | 'mistral' | 'groq' | 'together' | 'custom'
export type Protocol = 'openai' | 'anthropic' | 'google' | 'ollama'
export interface ProviderDefinition { id: ProviderId; name: string; short: string; protocol: Protocol; baseUrl: string; envKey: string; description: string; keyUrl: string }
export interface ProviderStatus { id: ProviderId; configured: boolean; baseUrl: string; keyStorage: 'encrypted' | 'session' | 'environment' | 'none' }
export interface Attachment { id: string; name: string; mime: string; size: number; data?: string; text?: string; note?: string }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; attachmentIds?: string[]; provider?: ProviderId; model?: string; durationMs?: number; critique?: string; refined?: boolean; feedback?: 'useful' | 'incorrect' }
export interface Investigation { id: string; title: string; mode: Mode; createdAt: string; messages: Message[]; attachments: Attachment[] }
export interface Lesson { id: string; text: string; createdAt: string; sourceId?: string }
export interface EvalCase { id: string; name: string; mode: Mode; prompt: string; expected: string[] }
export interface EvalResult { caseId: string; answer: string; passed: boolean; matched: string[]; expected: string[]; error?: string; durationMs: number }
export interface EvalRun { id: string; provider: ProviderId; model: string; createdAt: string; useLessons: boolean; status: 'completed' | 'cancelled'; results: EvalResult[] }
export interface Workspace { investigations: Investigation[]; lessons: Lesson[]; evalRuns: EvalRun[] }
export interface AppInfo { desktop: boolean; version: string; electronVersion: string; secureStorage: boolean; providers: ProviderStatus[]; workspace: Workspace }
export interface RunInput { investigationId: string; provider: ProviderId; model: string; text: string; attachmentIds: string[]; refine: boolean; useLessons: boolean }
export interface Progress { stage: string; investigationId?: string; caseId?: string }
export interface UpdateState { status: 'idle' | 'checking' | 'available' | 'current' | 'downloaded' | 'error' | 'unavailable'; message: string; version?: string; percent?: number }
export interface DesktopApi {
  initialize(): Promise<AppInfo>
  createInvestigation(mode: Mode): Promise<Workspace>
  deleteInvestigation(id: string): Promise<Workspace>
  renameInvestigation(id: string, title: string): Promise<Workspace>
  importFiles(investigationId: string): Promise<Workspace>
  removeAttachment(investigationId: string, id: string): Promise<Workspace>
  run(input: RunInput): Promise<Workspace>
  cancel(): Promise<void>
  saveProvider(id: ProviderId, key: string, baseUrl?: string): Promise<ProviderStatus[]>
  clearProvider(id: ProviderId): Promise<ProviderStatus[]>
  models(id: ProviderId): Promise<string[]>
  feedback(investigationId: string, messageId: string, value: 'useful' | 'incorrect'): Promise<Workspace>
  saveLesson(text: string, sourceId?: string): Promise<Workspace>
  suggestLesson(investigationId: string, messageId: string, provider: ProviderId, model: string): Promise<string>
  deleteLesson(id: string): Promise<Workspace>
  runEvaluations(provider: ProviderId, model: string, useLessons: boolean): Promise<Workspace>
  calculate(expression: string): Promise<string>
  copyText(text: string): Promise<void>
  exportInvestigation(id: string): Promise<boolean>
  checkUpdates(): Promise<UpdateState>
  installUpdate(): Promise<void>
  openExternal(url: string): Promise<void>
  onProgress(callback: (progress: Progress) => void): () => void
  onUpdate(callback: (state: UpdateState) => void): () => void
}
declare global { interface Window { desktop?: DesktopApi } }
