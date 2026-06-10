import { useRef, useEffect, useState } from 'react'
import {
  Bold, Italic, Underline, List, ListOrdered, AlignLeft,
  AlignCenter, AlignRight, AlignJustify, Heading1, Heading2, Link as LinkIcon, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Lightweight rich text editor using contenteditable.
 * - No external dependencies (saves ~80KB vs TipTap/Quill).
 * - Outputs HTML via `onChange(html)`.
 * - Sanitises pasted content (removes scripts/styles/event handlers).
 *
 * Toolbar: bold, italic, underline, H1, H2, lists, alignment, link.
 */
export function RichTextEditor({ value = '', onChange, placeholder = 'Start writing…', className }) {
  const editorRef = useRef(null)
  const [hasFocus, setHasFocus] = useState(false)

  // Only set innerHTML on mount or when the external value changes to one
  // that doesn't match (e.g. parent reset). Avoid clobbering during typing.
  useEffect(() => {
    if (editorRef.current && (value || '') !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const exec = (cmd, arg = null) => {
    // Some commands need the editor focused
    if (editorRef.current) editorRef.current.focus()
    try { document.execCommand(cmd, false, arg) } catch (_) { /* old browsers */ }
    // Push the HTML back up
    if (editorRef.current && onChange) onChange(editorRef.current.innerHTML)
  }

  const handleInput = () => {
    if (editorRef.current && onChange) onChange(editorRef.current.innerHTML)
  }

  // Strip dangerous content from pastes (no scripts, no inline event handlers)
  const handlePaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    // Insert as plain text so we don't import remote styles
    document.execCommand('insertText', false, text)
  }

  const promptLink = () => {
    const url = window.prompt('Enter URL (https://...)', 'https://')
    if (url && /^https?:\/\//i.test(url)) exec('createLink', url)
  }

  const Btn = ({ onClick, title, children, active = false }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        'h-8 w-8 inline-flex items-center justify-center rounded transition-colors',
        'text-foreground/70 hover:text-foreground hover:bg-muted',
        active && 'bg-muted text-foreground'
      )}
    >
      {children}
    </button>
  )

  return (
    <div className={cn('rounded-xl border border-input bg-background overflow-hidden', hasFocus && 'ring-2 ring-primary/30', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30">
        <Btn onClick={() => exec('bold')} title="Bold (Ctrl+B)"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('italic')} title="Italic (Ctrl+I)"><Italic className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('underline')} title="Underline (Ctrl+U)"><Underline className="h-4 w-4" /></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn onClick={() => exec('formatBlock', '<h1>')} title="Heading 1"><Heading1 className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('formatBlock', '<h2>')} title="Heading 2"><Heading2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('formatBlock', '<p>')} title="Paragraph"><span className="text-xs font-semibold">P</span></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn onClick={() => exec('insertUnorderedList')} title="Bullet List"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Numbered List"><ListOrdered className="h-4 w-4" /></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn onClick={() => exec('justifyLeft')} title="Align Left"><AlignLeft className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('justifyCenter')} title="Align Center"><AlignCenter className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('justifyRight')} title="Align Right"><AlignRight className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('justifyFull')} title="Justify"><AlignJustify className="h-4 w-4" /></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn onClick={promptLink} title="Add Link"><LinkIcon className="h-4 w-4" /></Btn>
        <Btn onClick={() => exec('removeFormat')} title="Clear Formatting"><X className="h-4 w-4" /></Btn>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => setHasFocus(true)}
        onBlur={() => setHasFocus(false)}
        onPaste={handlePaste}
        className={cn(
          'min-h-[200px] max-h-[500px] overflow-y-auto p-4 text-sm outline-none',
          'prose prose-sm max-w-none',
          'prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg',
          'prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5',
          'prose-a:text-primary prose-a:underline',
          'dark:prose-invert',
          // Placeholder
          'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none'
        )}
        data-placeholder={placeholder}
      />
    </div>
  )
}

/**
 * Read-only renderer for HTML produced by RichTextEditor.
 * Scrollable container styled to look like a reading panel.
 */
export function RichTextViewer({ html = '', className }) {
  return (
    <div
      className={cn(
        'overflow-y-auto p-5 sm:p-6 prose prose-sm sm:prose-base max-w-none',
        'prose-headings:font-bold prose-h1:text-xl sm:prose-h1:text-2xl prose-h2:text-lg sm:prose-h2:text-xl',
        'prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1',
        'prose-a:text-primary prose-a:underline hover:prose-a:no-underline',
        'dark:prose-invert',
        className
      )}
      // We trust this HTML because:
      // - It is created by an authenticated instructor on the platform
      // - Server-side will sanitize-on-display later if needed
      // For now, content is rendered as-is. Future: hook in DOMPurify if XSS becomes a concern.
      dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted-foreground italic">No content.</p>' }}
    />
  )
}
