import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Markdown estilizado pela classe `.theory` (ver index.css). */
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`theory ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
