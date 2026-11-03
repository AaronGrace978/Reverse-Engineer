import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { api } from './api'

export function Markdown({ children }: { children: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
    a: ({ href, children }) => <button className="text-link" onClick={() => { if (href?.startsWith('https://')) void api.openExternal(href).catch(() => {}) }}>{children}</button>,
    img: ({ alt }) => <span className="muted">[External image omitted: {alt ?? 'image'}]</span>,
  }}>{children}</ReactMarkdown></div>
}
