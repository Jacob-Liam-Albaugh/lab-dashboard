import { spawn, execFile, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import pty from 'node-pty'
import type { Plugin, ViteDevServer } from 'vite'
import { WebSocketServer } from 'ws'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'data')
const PY = path.join(ROOT, 'server', 'py')
const SKIP = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.ipynb_checkpoints', '.DS_Store'])
const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', html: 'text/html',
  json: 'application/json', ipynb: 'application/json',
}

type Project = { name: string; path: string }
type Run = { id: string; project: string; cmd: string; started: string; finished?: string; code?: number | null; figures: string[]; log: string[]; child?: ChildProcess; listeners: Set<(e: unknown) => void> }

const runs = new Map<string, Run>()

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

function projects(): Project[] {
  const file = path.join(ROOT, 'projects.json')
  if (!fs.existsSync(file)) return []
  const list = JSON.parse(fs.readFileSync(file, 'utf8')) as Project[]
  return list.map((p) => ({ ...p, path: path.resolve(p.path.replace(/^~(?=\/)/, os.homedir())) }))
}

function project(name: string | null): Project {
  const p = projects().find((x) => x.name === name)
  if (!p) throw new HttpError(404, `unknown project ${name}`)
  return p
}

export function resolveIn(root: string, rel = ''): string {
  const abs = path.resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new HttpError(403, 'path escapes project')
  return abs
}

function scan(root: string, maxDepth = 4, cap = 20000) {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (found.length >= cap) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (SKIP.has(e.name) || e.name.startsWith('.')) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { if (depth < maxDepth) walk(full, depth + 1) }
      else found.push(path.relative(root, full))
    }
  }
  walk(root, 0)
  return found
}

function describe(p: Project) {
  const files = scan(p.path)
  const base = (f: string) => path.basename(f)
  const dirOf = (f: string) => path.dirname(f).replace(/^\.$/, '')
  const makefile = path.join(p.path, 'Makefile')
  const makeTargets = fs.existsSync(makefile)
    ? [...fs.readFileSync(makefile, 'utf8').matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)].map((m) => m[1]).filter((t) => !t.startsWith('.'))
    : []
  return {
    name: p.name,
    root: p.path,
    readme: files.find((f) => /^readme\.md$/i.test(f)) ?? null,
    matrix: files.includes('capability-matrix.json'),
    ledgers: files.filter((f) => base(f) === 'results.tsv' || f.endsWith(path.join('runs', 'ledger.jsonl'))),
    harnesses: files.filter((f) => base(f) === 'paper_manifest.json').map(dirOf),
    images: files.filter((f) => IMAGE.test(f)).slice(0, 300),
    scripts: files.filter((f) => f.endsWith('.py') && path.dirname(f).split(path.sep).length <= 2).slice(0, 200),
    makeTargets,
    usesUv: fs.existsSync(path.join(p.path, 'pyproject.toml')),
  }
}

function list(root: string, rel: string) {
  return fs.readdirSync(resolveIn(root, rel), { withFileTypes: true })
    .filter((e) => !SKIP.has(e.name) && !e.name.startsWith('.'))
    .map((e) => {
      const st = fs.statSync(path.join(resolveIn(root, rel), e.name))
      return { name: e.name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs }
    })
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string, head?: number) {
  const st = fs.statSync(file)
  const ext = path.extname(file).slice(1).toLowerCase()
  const type = MIME[ext] ?? 'text/plain; charset=utf-8'
  if (head) {
    res.writeHead(200, { 'Content-Type': type, 'X-Truncated': String(st.size > head) })
    fs.createReadStream(file, { end: Math.min(st.size, head) - 1 }).pipe(res)
    return
  }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Number(range[2]) : st.size - 1
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 })
    fs.createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' })
  fs.createReadStream(file).pipe(res)
}

function python(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile('uv', ['run', '--no-project', '--with', 'numpy', 'python', '-I', path.join(PY, 'npz.py'), ...args],
      { cwd: ROOT, maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
        if (err) reject(new HttpError(500, stderr || err.message))
        else resolve(JSON.parse(stdout))
      })
  })
}

function jsonDir(root: string, rel: string) {
  const dir = resolveIn(root, rel)
  const rows: Record<string, Record<string, unknown>> = {}
  const read = (row: string, d: string) => {
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.json')) continue
      try { (rows[row] ??= {})[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) } catch { /* skips malformed json */ }
    }
  }
  read(path.basename(dir), dir)
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !SKIP.has(e.name)) read(e.name, path.join(dir, e.name))
  }
  return rows
}

function sse(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  return (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function body(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}) } catch (e) { reject(new HttpError(400, String(e))) } })
  })
}

function runMeta(r: Run) {
  return { id: r.id, project: r.project, cmd: r.cmd, started: r.started, finished: r.finished, code: r.code, figures: r.figures, running: !!r.child }
}

function loadRuns() {
  const dir = path.join(DATA, 'runs')
  if (!fs.existsSync(dir)) return
  for (const id of fs.readdirSync(dir)) {
    const meta = path.join(dir, id, 'meta.json')
    if (!fs.existsSync(meta) || runs.has(id)) continue
    const m = JSON.parse(fs.readFileSync(meta, 'utf8'))
    const log = fs.existsSync(path.join(dir, id, 'output.log')) ? fs.readFileSync(path.join(dir, id, 'output.log'), 'utf8').split('\n') : []
    runs.set(id, { ...m, log, listeners: new Set() })
  }
}

function startRun(p: Project, cmd: string): Run {
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(DATA, 'runs', id)
  const figDir = path.join(dir, 'figures')
  fs.mkdirSync(figDir, { recursive: true })
  const child = spawn(process.env.SHELL || 'bash', ['-lc', cmd], {
    cwd: p.path,
    detached: true,
    env: {
      ...process.env,
      MPLBACKEND: 'module://labdash_backend',
      LABDASH_FIG_DIR: figDir,
      PYTHONPATH: [PY, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      PYTHONUNBUFFERED: '1',
    },
  })
  const run: Run = { id, project: p.name, cmd, started: new Date().toISOString(), figures: [], log: [], child, listeners: new Set() }
  const emit = (e: unknown) => run.listeners.forEach((l) => l(e))
  const onData = (stream: string) => (chunk: Buffer) => {
    const text = chunk.toString()
    run.log.push(text)
    emit({ stream, text })
  }
  child.stdout!.on('data', onData('stdout'))
  child.stderr!.on('data', onData('stderr'))
  child.on('close', (code) => {
    run.code = code
    run.finished = new Date().toISOString()
    run.child = undefined
    run.figures = fs.readdirSync(figDir).sort()
    fs.writeFileSync(path.join(dir, 'output.log'), run.log.join(''))
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(runMeta(run), null, 1))
    emit({ done: runMeta(run) })
  })
  runs.set(id, run)
  return run
}

function readPins() {
  const f = path.join(DATA, 'pins.json')
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []
}

// blocks cross-site pages from POSTing commands to the local runner
function assertSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  if (!origin || new URL(origin).host !== req.headers.host) throw new HttpError(403, 'cross-origin request refused')
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url!, 'http://local')
  const q = (k: string) => url.searchParams.get(k)
  const json = (data: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
  if (req.method !== 'GET') assertSameOrigin(req)

  switch (`${req.method} ${url.pathname}`) {
    case 'GET /api/projects':
      return json(projects().map((p) => ({ ...p, exists: fs.existsSync(p.path) })))
    case 'GET /api/project':
      return json(describe(project(q('p'))))
    case 'GET /api/tree':
      return json(list(project(q('p')).path, q('dir') ?? ''))
    case 'GET /api/file': {
      const file = resolveIn(project(q('p')).path, q('path') ?? '')
      return sendFile(req, res, file, q('head') ? Number(q('head')) : undefined)
    }
    case 'GET /api/npz':
      return json(await python(['inspect', resolveIn(project(q('p')).path, q('path') ?? ''), q('as') ?? 'auto']))
    case 'GET /api/sweep':
      return json(await python(['sweep', resolveIn(project(q('p')).path, q('dir') ?? ''), q('key') ?? '']))
    case 'GET /api/jsondir':
      return json(jsonDir(project(q('p')).path, q('dir') ?? ''))
    case 'GET /api/watch': {
      const root = project(q('p')).path
      const send = sse(res)
      let pending = new Set<string>()
      let timer: NodeJS.Timeout | undefined
      const watcher = fs.watch(root, { recursive: true }, (_, file) => {
        if (!file || file.split(path.sep).some((s) => SKIP.has(s) || s.startsWith('.'))) return
        pending.add(file)
        timer ??= setTimeout(() => { send([...pending]); pending = new Set(); timer = undefined }, 300)
      })
      req.on('close', () => watcher.close())
      return
    }
    case 'GET /api/runs':
      loadRuns()
      return json([...runs.values()].filter((r) => !q('p') || r.project === q('p')).map(runMeta).sort((a, b) => b.started.localeCompare(a.started)))
    case 'POST /api/run': {
      const { p, cmd } = await body(req)
      if (typeof cmd !== 'string' || !cmd.trim()) throw new HttpError(400, 'empty command')
      return json(runMeta(startRun(project(p), cmd)))
    }
    case 'GET /api/run/stream': {
      loadRuns()
      const run = runs.get(q('id') ?? '')
      if (!run) throw new HttpError(404, 'unknown run')
      const send = sse(res)
      send({ text: run.log.join('') })
      if (!run.child) { send({ done: runMeta(run) }); return }
      run.listeners.add(send)
      req.on('close', () => run.listeners.delete(send))
      return
    }
    case 'POST /api/run/kill': {
      const run = runs.get(q('id') ?? '')
      if (run?.child?.pid) process.kill(-run.child.pid, 'SIGTERM')
      return json({ ok: true })
    }
    case 'GET /api/run/figure': {
      const id = q('id') ?? ''
      if (!/^[\w-]+$/.test(id)) throw new HttpError(400, 'bad run id')
      return sendFile(req, res, resolveIn(path.join(DATA, 'runs', id, 'figures'), q('name') ?? ''))
    }
    case 'GET /api/pins':
      return json(readPins())
    case 'PUT /api/pins':
      fs.mkdirSync(DATA, { recursive: true })
      fs.writeFileSync(path.join(DATA, 'pins.json'), JSON.stringify(await body(req), null, 1))
      return json({ ok: true })
  }
  throw new HttpError(404, `no route ${req.method} ${url.pathname}`)
}

// gives each socket its own login shell, so TUIs like claude get a real tty
function terminals(server: NonNullable<ViteDevServer['httpServer']>) {
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url!, 'http://local')
    if (url.pathname !== '/api/term') return
    try { assertSameOrigin(req) } catch { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const cwd = projects().find((p) => p.name === url.searchParams.get('p'))?.path
      const term = pty.spawn(process.env.SHELL || 'bash', ['-l'], {
        name: 'xterm-256color',
        cwd: cwd && fs.existsSync(cwd) ? cwd : os.homedir(),
        cols: Number(url.searchParams.get('cols')) || 80,
        rows: Number(url.searchParams.get('rows')) || 24,
        env: { ...process.env, COLORTERM: 'truecolor' },
      })
      let alive = true
      term.onData((d) => ws.send(d))
      term.onExit(() => { alive = false; ws.close() })
      ws.on('message', (m) => {
        const msg = JSON.parse(String(m))
        if (msg.cols) term.resize(msg.cols, msg.rows)
        else term.write(msg.data)
      })
      ws.on('close', () => alive && term.kill())
    })
  })
}

export function labApi(): Plugin {
  return {
    name: 'lab-api',
    configureServer(server) {
      if (server.httpServer) terminals(server.httpServer)
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        handle(req, res).catch((e: unknown) => {
          const status = e instanceof HttpError ? e.status : 500
          if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'text/plain' })
          res.end(e instanceof Error ? e.message : String(e))
        })
      })
    },
  }
}
