import { useEffect, useState, type ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import type { Element, ElementContent } from 'hast'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { fileUrl, useVersion } from '@/lib/api'
import { markdownSection } from '@/lib/parse'
import { href } from '@/lib/route'
import { DataTable } from './DataTable'
import { Part, PinButton, portal, useFocus } from './Present'

export function joinPath(dir: string, rel: string) {
  const out: string[] = []
  for (const s of `${dir}/${rel}`.split('/')) {
    if (s === '..') out.pop()
    else if (s && s !== '.') out.push(s)
  }
  return out.join('/')
}
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/')
const filePath = /^[\w.-]+(\/[\w.-]+)+\.\w+$/
const external = (u: string) => /^([a-z]+:|#|\/)/i.test(u)
const sourceLine = (text: string, node?: Element) => node?.position && text.split('\n')[node.position.start.line - 1]?.trim()
const textOf = (n: ElementContent): string => (n.type === 'text' ? n.value : 'children' in n ? n.children.map(textOf).join('') : '')

const elements = (n: Element, tag: string) => n.children.filter((c): c is Element => c.type === 'element' && c.tagName === tag)

function MdTable({ node, components, project, id }: { node: Element; components: Components; project?: string; id: string }) {
  const [head, ...body] = node.children.flatMap((c) => (c.type === 'element' ? elements(c, 'tr') : []))
  const seen = new Set<string>()
  const keys = (head ? [...elements(head, 'th'), ...elements(head, 'td')] : []).map((c, j) => {
    let k = textOf(c).trim() || `#${j + 1}`
    while (seen.has(k)) k += ' '
    seen.add(k)
    return k
  })
  const cells = body.map((tr) => elements(tr, 'td'))
  const rows = cells.map((tds) => Object.fromEntries(keys.map((k, j) => [k, tds[j] ? textOf(tds[j]).trim() : ''])))
  return <DataTable id={id} rows={rows} project={project} render={(_, k, i) => {
    const td = cells[i][keys.indexOf(k)]
    return td && <div className="max-w-md min-w-24 whitespace-normal">{toJsxRuntime({ type: 'root', children: td.children }, { Fragment, jsx, jsxs, components: components as never })}</div>
  }} />
}

function PinnableHeading({ node, children, level, text, project, path }: { node?: Element; children?: ReactNode; level: 1 | 2 | 3; text: string; project: string; path: string }) {
  const H = `h${level}` as const
  const line = sourceLine(text, node)
  return (
    <H className="group flex items-center gap-1">
      <span>{children}</span>
      {line && <PinButton pin={{ project, path, section: line, title: `${path.split('/').pop()} · ${textOf(node!)}` }} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />}
    </H>
  )
}

export function Markdown({ text, project, dir = '', path }: { text: string; project?: string; dir?: string; path?: string }) {
  const v = useVersion()
  const focus = useFocus()
  if (focus?.section !== undefined) {
    const section = markdownSection(text, focus.section)
    return section === null ? null : portal(<Markdown text={section} project={project} dir={dir} />, focus.target)
  }
  const heading = (level: 1 | 2 | 3) => project && path
    ? { [`h${level}`]: (p: { node?: Element; children?: ReactNode }) => <PinnableHeading {...p} level={level} text={text} project={project} path={path} /> }
    : {}
  const components: Components = {
    img: ({ src, alt }) => (
      <img alt={alt} src={typeof src === 'string' && project && !external(src) ? fileUrl(project, joinPath(dir, src), v) : (src as string)} />
    ),
    a: ({ href: h, children }) => {
      if (!h || !project || external(h)) return <a href={h} target={h?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">{children}</a>
      const path = joinPath(dir, h.split('#')[0])
      return <a href={href({ view: h.endsWith('/') ? 'dir' : 'file', project, path })}>{children}</a>
    },
    code: ({ children, className }) => typeof children === 'string' && project && filePath.test(children)
      ? <a href={href({ view: 'file', project, path: joinPath(dir, children) })}><code>{children}</code></a>
      : <code className={className}>{children}</code>,
    pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
    table: ({ node }) => {
      const line = sourceLine(text, node)
      const table = node && <MdTable node={node} components={components} project={project} id={`${path}:${line}`} />
      return project && path && line
        ? <Part pin={{ project, path, part: `table:${line}`, title: `${path.split('/').pop()} · table` }}><div className="prose-lab">{table}</div></Part>
        : table
    },
    ...heading(1), ...heading(2), ...heading(3),
  }
  return (
    <div className="prose-lab">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

const LANGS: Record<string, string> = {
  py: 'python', sh: 'bash', bash: 'bash', zsh: 'bash', yaml: 'yaml', yml: 'yaml', toml: 'toml', json: 'json', jsonl: 'json',
  tex: 'latex', bib: 'bibtex', js: 'javascript', ts: 'typescript', tsx: 'tsx', jl: 'julia', r: 'r', c: 'c', cpp: 'cpp',
  h: 'c', rs: 'rust', go: 'go', md: 'markdown', html: 'html', css: 'css', makefile: 'makefile', slurm: 'bash', sql: 'sql',
}
const HIGHLIGHT_LIMIT = 200_000

export function Code({ text, lang }: { text: string; lang?: string }) {
  const language = lang ? LANGS[lang.toLowerCase()] : undefined
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    if (!language || text.length > HIGHLIGHT_LIMIT) return
    let live = true
    import('shiki').then(({ codeToHtml }) => codeToHtml(text, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } }))
      .then((h) => live && setHtml(h), () => {})
    return () => { live = false }
  }, [text, language])
  if (html && language && text.length <= HIGHLIGHT_LIMIT) return <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />
  return <pre className="code-block overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{text}</pre>
}
