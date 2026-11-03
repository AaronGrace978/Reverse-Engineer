import type { ProviderDefinition } from './types'

export const PROVIDERS: ProviderDefinition[] = [
  { id: 'ollama-cloud', name: 'Ollama Cloud', short: 'OC', protocol: 'ollama', baseUrl: 'https://ollama.com', envKey: 'OLLAMA_API_KEY', description: 'Open models, hosted by Ollama', keyUrl: 'https://ollama.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', short: 'OA', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', envKey: 'OPENAI_API_KEY', description: 'Responses API · reasoning and vision', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', short: 'AN', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', envKey: 'ANTHROPIC_API_KEY', description: 'Claude · analysis and vision', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', name: 'Google Gemini', short: 'GG', protocol: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', envKey: 'GEMINI_API_KEY', description: 'Gemini · multimodal research', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'ollama-local', name: 'Ollama Local', short: 'OL', protocol: 'ollama', baseUrl: 'http://127.0.0.1:11434', envKey: '', description: 'Run models on your own machine', keyUrl: 'https://ollama.com/download' },
  { id: 'openrouter', name: 'OpenRouter', short: 'OR', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY', description: 'A catalog of models across providers', keyUrl: 'https://openrouter.ai/settings/keys' },
  { id: 'xai', name: 'xAI', short: 'XA', protocol: 'openai', baseUrl: 'https://api.x.ai/v1', envKey: 'XAI_API_KEY', description: 'Grok · reasoning and analysis', keyUrl: 'https://console.x.ai' },
  { id: 'deepseek', name: 'DeepSeek', short: 'DS', protocol: 'openai', baseUrl: 'https://api.deepseek.com', envKey: 'DEEPSEEK_API_KEY', description: 'DeepSeek · mathematical reasoning', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'mistral', name: 'Mistral', short: 'MI', protocol: 'openai', baseUrl: 'https://api.mistral.ai/v1', envKey: 'MISTRAL_API_KEY', description: 'Mistral · open and frontier models', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'groq', name: 'Groq', short: 'GQ', protocol: 'openai', baseUrl: 'https://api.groq.com/openai/v1', envKey: 'GROQ_API_KEY', description: 'Fast inference for open models', keyUrl: 'https://console.groq.com/keys' },
  { id: 'together', name: 'Together AI', short: 'TO', protocol: 'openai', baseUrl: 'https://api.together.xyz/v1', envKey: 'TOGETHER_API_KEY', description: 'Hosted open model inference', keyUrl: 'https://api.together.ai/settings/api-keys' },
  { id: 'custom', name: 'Custom endpoint', short: '++', protocol: 'openai', baseUrl: 'https://api.example.com/v1', envKey: 'CUSTOM_API_KEY', description: 'Any compatible Chat Completions API', keyUrl: '' },
]
export const MODES = {
  engineer: { name: 'Reverse engineer', short: 'Engineering', description: 'Understand the parts. Reconstruct the system.', placeholder: 'What does this mechanism do? Attach a photo or blueprint…' },
  mathematics: { name: 'Mathematics', short: 'Mathematics', description: 'Work from assumptions to a checkable result.', placeholder: 'Describe a problem, conjecture, or equation…' },
  discovery: { name: 'Explore & discover', short: 'Discovery', description: 'Observe a pattern. Find a testable explanation.', placeholder: 'What would you like to understand about the world?' },
}
