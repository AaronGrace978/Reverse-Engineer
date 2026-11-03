import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, ArrowUp, Atom, BookOpen, Box, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CircuitBoard, Cloud, Copy, Download, FileText, FlaskConical, FolderOpen, Image, Layers3, Lightbulb, LoaderCircle, Microscope, MoreHorizontal, Paperclip, PencilLine, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sigma, SlidersHorizontal, Sparkles, Square, ThumbsDown, ThumbsUp, Trash2, Workflow, X, Zap } from 'lucide-react'
import { api } from './api'
import { Markdown } from './Markdown'
import { MODES, PROVIDERS } from './shared/providers'
import { EVALUATIONS } from './shared/evaluations'
import type { AppInfo, Attachment, Investigation, Message, Mode, ProviderId, ProviderStatus, UpdateState, Workspace } from './shared/types'

const emptyWorkspace: Workspace = { investigations: [], lessons: [], evalRuns: [] }
const MODE_ICONS = { engineer: CircuitBoard, mathematics: Sigma, discovery: Atom }
type View = 'workspace' | 'notebook' | 'harness'
function message(error: unknown) { return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '') }
function date(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
function readPreference(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } }
function IconButton({ children, label, onClick, disabled, className = '' }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
}
function Brand({ small = false }: { small?: boolean }) { return <div className={`brand ${small ? 'small' : ''}`}><span className="brand-mark"><Box size={small ? 18 : 22} strokeWidth={1.6} /><span /></span>{!small && <div>reverse<span>engineer</span></div>}</div> }
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = root.current!
    const focusable = () => [...element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, [tabindex="0"]')]
    const initialFocus = element.querySelector<HTMLElement>('input:not(:disabled), textarea') ?? focusable()[0]
    initialFocus?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current() }
      if (e.key === 'Tab') {
        const items = focusable()
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus() }
        else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus() }
      }
    }
    element.addEventListener('keydown', keydown)
    return () => { element.removeEventListener('keydown', keydown); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div ref={root} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></header>{children}</div></div>
}

export default function App() {
  const [info, setInfo] = useState<AppInfo>()
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<View>('workspace')
  const [mode, setMode] = useState<Mode>('engineer')
  const [provider, setProvider] = useState<ProviderId>(readPreference('re-provider', 'ollama-cloud') as ProviderId)
  const [model, setModel] = useState(readPreference('re-model', ''))
  const [catalogs, setCatalogs] = useState<Partial<Record<ProviderId, string[]>>>({})
  const [discovering, setDiscovering] = useState(false)
  const [text, setText] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [refine, setRefine] = useState(false)
  const [useLessons, setUseLessons] = useState(true)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showProviders, setShowProviders] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showLesson, setShowLesson] = useState(false)
  const [lessonSource, setLessonSource] = useState<string>()
  const [lessonText, setLessonText] = useState('')
  const [lessonError, setLessonError] = useState('')
  const [draftingLesson, setDraftingLesson] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [query, setQuery] = useState('')
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle', message: 'Updates include the app and its bundled Electron runtime.' })
  const search = useRef<HTMLInputElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const scrollEnd = useRef<HTMLDivElement>(null)
  const investigation = workspace.investigations.find(i => i.id === selected)
  const currentMode = investigation?.mode ?? mode
  const providerDef = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0]
  const providerStatus = info?.providers.find(p => p.id === provider)
  const connected = !!providerStatus?.configured

  useEffect(() => {
    void api.initialize().then(value => { setInfo(value); setWorkspace(value.workspace) }).catch(e => setError(message(e)))
    const offProgress = api.onProgress(p => setStage(p.stage))
    const offUpdate = api.onUpdate(setUpdate)
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); search.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => { offProgress(); offUpdate(); document.removeEventListener('keydown', onKey) }
  }, [])
  useEffect(() => {
    if (investigation?.messages.length || busy) scrollEnd.current?.scrollIntoView({ behavior: 'smooth' })
    else scrollEnd.current?.parentElement?.scrollTo({ top: 0 })
  }, [investigation?.messages.length, busy])
  useEffect(() => { localStorage.setItem('re-provider', provider); localStorage.setItem('re-model', model) }, [provider, model])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer) }, [notice])

  const attempt = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    setError('')
    try { return await action() } catch (e) { setError(message(e)); return undefined }
  }
  async function newInvestigation(nextMode: Mode = mode) {
    const result = await attempt(() => api.createInvestigation(nextMode))
    if (!result) return
    setWorkspace(result); setSelected(result.investigations[0].id); setMode(nextMode); setText(''); setSelectedFiles([]); setView('workspace')
    composer.current?.focus()
    return result.investigations[0]
  }
  function selectInvestigation(item: Investigation) { setSelected(item.id); setMode(item.mode); setView('workspace'); setSelectedFiles([]); setText(''); setError('') }
  async function discoverModels() {
    setDiscovering(true)
    const id = provider
    const list = await attempt(() => api.models(id))
    if (list) { setCatalogs(previous => ({ ...previous, [id]: list })); setNotice(`${list.length} model IDs loaded from ${providerDef.name}. Choose a model that supports your input.`) }
    setDiscovering(false)
  }
  async function attach() {
    const target = investigation ?? await newInvestigation(currentMode)
    if (!target) return
    const result = await attempt(() => api.importFiles(target.id))
    if (result) {
      setWorkspace(result)
      const updated = result.investigations.find(i => i.id === target.id)!
      const added = updated.attachments.filter(a => !target.attachments.some(old => old.id === a.id)).map(a => a.id)
      setSelectedFiles(previous => [...previous, ...added].slice(0, 4))
    }
  }
  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim() || busy) return
    if (!info?.desktop) { setError('This is a browser preview. Launch npm run dev for model connections and analysis.'); return }
    if (!connected) { setShowProviders(true); return }
    if (!model.trim()) { setError('Refresh the model catalog or enter an exact model ID first.'); return }
    const target = investigation ?? await newInvestigation(currentMode)
    if (!target) return
    // Creating a new investigation clears its composer, so retain this submission.
    const submission = text
    setBusy(true); setError(''); setStage('Connecting to provider')
    try {
      const result = await api.run({ investigationId: target.id, provider, model: model.trim(), text: submission, attachmentIds: selectedFiles, refine, useLessons })
      setWorkspace(result); setText(''); setSelectedFiles([])
    } catch (e) { setText(submission); setError(message(e)) }
    finally { setBusy(false); setStage('') }
  }
  async function runHarness() {
    if (!connected) { setShowProviders(true); return }
    if (!model.trim()) { setError('Select a model before running evaluations.'); return }
    setBusy(true); setStage('Starting regression suite'); setError('')
    try { setWorkspace(await api.runEvaluations(provider, model.trim(), useLessons)) }
    catch (e) { setError(message(e)) }
    finally { setBusy(false); setStage('') }
  }
  async function saveLesson() {
    setLessonError('')
    try {
      const result = await api.saveLesson(lessonText, lessonSource)
      setWorkspace(result); setShowLesson(false); setLessonText(''); setNotice('Lesson saved. Future runs can use it as reference guidance.')
    } catch (e) { setLessonError(message(e)) }
  }
  async function draftLesson() {
    if (!investigation || !lessonSource || busy) return
    setBusy(true); setDraftingLesson(true); setLessonError('')
    try { setLessonText(await api.suggestLesson(investigation.id, lessonSource, provider, model.trim())) }
    catch (e) { setLessonError(message(e)) }
    finally { setBusy(false); setDraftingLesson(false); setStage('') }
  }
  function openLesson(sourceId?: string) { setLessonSource(sourceId); setLessonText(''); setLessonError(''); setShowLesson(true) }
  function setProviders(providers: ProviderStatus[]) { setInfo(previous => previous ? { ...previous, providers } : previous) }
  async function copy(value: string) { await attempt(async () => { await api.copyText(value); setNotice('Copied to clipboard') }) }

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="workspace-label"><span className="workspace-avatar">AG</span><div>Personal workspace<small>RESEARCH LAB</small></div><ChevronDown size={14} /></div>
      <button className="new-button" disabled={busy} onClick={() => void newInvestigation(currentMode)}><Plus size={17} />New investigation</button>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className={view === 'workspace' ? 'active' : ''} onClick={() => setView('workspace')}><Layers3 size={17} />Workbench<span className="nav-dot" /></button>
        <button className={view === 'notebook' ? 'active' : ''} onClick={() => setView('notebook')}><BookOpen size={17} />Knowledge notebook<span className="count">{workspace.lessons.length}</span></button>
        <button className={view === 'harness' ? 'active' : ''} onClick={() => setView('harness')}><Workflow size={17} />Evaluation harness</button>
      </nav>
      <div className="sidebar-section-label">INVESTIGATIONS <span>{workspace.investigations.length.toString().padStart(2, '0')}</span></div>
      <label className="search-field"><Search size={14} /><input ref={search} aria-label="Search investigations" placeholder="Search investigations" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label>
      <div className="investigation-list">
        {workspace.investigations.filter(i => i.title.toLowerCase().includes(query.toLowerCase())).map(item => {
          const Icon = MODE_ICONS[item.mode]
          return <button key={item.id} className={item.id === selected && view === 'workspace' ? 'selected' : ''} onClick={() => selectInvestigation(item)}><Icon size={15} /><span>{item.title}<small>{MODES[item.mode].short} · {date(item.createdAt)}</small></span></button>
        })}
        {!workspace.investigations.length && <div className="sidebar-empty"><FolderOpen size={21} /><p>Your next discovery<br />starts with a question.</p></div>}
        {!!workspace.investigations.length && !workspace.investigations.some(i => i.title.toLowerCase().includes(query.toLowerCase())) && <p className="muted small-text">No matching investigations.</p>}
      </div>
      <div className="sidebar-bottom">
        <button className="provider-nav" onClick={() => setShowProviders(true)}><span className="provider-cluster"><Cloud size={17} /></span><span>Model providers<small>{info?.providers.filter(p => p.configured && p.id !== 'ollama-local').length ?? 0} cloud connections</small></span><ChevronRight size={15} /></button>
        <div className="sidebar-footer"><button onClick={() => setShowAbout(true)}><CircleHelp size={15} />About & updates</button><span>v{info?.version ?? '0.1.0'}</span></div>
      </div>
    </aside>

    <main className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{view === 'workspace' ? 'Workbench' : view === 'harness' ? 'Evaluation harness' : 'Knowledge notebook'}</strong></div><div className="topbar-status"><span className="status-dot" />{info?.desktop ? 'LOCAL WORKSPACE' : 'BROWSER PREVIEW'}<span className="topbar-divider" /><ShieldCheck size={14} /><span>Stored on your device</span></div></header>
      <div className="model-bar">
        <div className="model-connection"><span className="provider-logo">{providerDef.short}</span><label><span className="sr-only">Model provider</span><select aria-label="Model provider" value={provider} disabled={busy} onChange={e => { setProvider(e.target.value as ProviderId); setModel('') }}>{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}{info?.providers.find(s => s.id === p.id)?.configured ? ' · connected' : ''}</option>)}</select></label><span className="model-bar-divider" /><input aria-label="Model ID" placeholder="Select or enter a model ID" value={model} disabled={busy} list="model-catalog" onChange={e => setModel(e.target.value)} /><datalist id="model-catalog">{catalogs[provider]?.map(id => <option key={id} value={id} />)}</datalist><IconButton label="Refresh model catalog" disabled={busy || discovering || !connected} onClick={() => void discoverModels()}><RefreshCw size={14} className={discovering ? 'spin' : ''} /></IconButton></div>
        <button className={`connection-badge ${connected ? 'connected' : ''}`} onClick={() => setShowProviders(true)}><span className="status-dot" />{connected ? 'Connected' : 'Connect provider'}<SlidersHorizontal size={13} /></button>
      </div>
      {error && <div className="error-banner" role="alert"><span>{error}</span><IconButton label="Dismiss error" onClick={() => setError('')}><X size={16} /></IconButton></div>}
      {!info?.desktop && info && <div className="preview-banner"><CircuitBoard size={14} /><span>Interface preview. Launch the Electron desktop app to connect models and analyze files.</span><code>npm run dev</code></div>}

      {view === 'workspace' ? <div className="workbench">
        <section className="conversation-panel">
          <div className="investigation-heading"><div><span className="eyebrow">{MODES[currentMode].short.toUpperCase()}</span><button className="title-button" onClick={() => { if (investigation) { setTitle(investigation.title); setEditingTitle(true) } }} disabled={!investigation}><h1>{investigation?.title ?? 'A space for your next discovery'}</h1>{investigation && <PencilLine size={13} />}</button></div><div className="heading-actions">{investigation && <><IconButton label="Export investigation" disabled={busy} onClick={() => void attempt(async () => { if (await api.exportInvestigation(investigation.id)) setNotice('Investigation exported as Markdown') })}><ArrowDownToLine size={16} /></IconButton><IconButton label="Delete investigation" disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={15} /></IconButton></>}</div></div>
          <div className="conversation-scroll">
            {!investigation?.messages.length ? <Welcome mode={currentMode} onMode={next => { if (investigation) void newInvestigation(next); else setMode(next) }} onPrompt={value => { setText(value); composer.current?.focus() }} /> : <div className="messages">{investigation.messages.map(m => <MessageCard key={m.id} item={m} investigation={investigation} onCopy={() => void copy(m.content)} onLesson={() => openLesson(m.id)} onFeedback={value => void attempt(async () => setWorkspace(await api.feedback(investigation.id, m.id, value)))} />)}</div>}
            {busy && stage && <div className="run-progress" role="status"><span className="pulse-icon"><Sparkles size={16} /></span><div>{stage}<small>{refine ? 'Draft → critique → refine' : 'Waiting for the selected model'}</small></div><LoaderCircle size={15} className="spin" /></div>}
            <div ref={scrollEnd} />
          </div>
          <div className="composer-area">
            {!!selectedFiles.length && <div className="selected-files">{selectedFiles.map(id => { const a = investigation?.attachments.find(f => f.id === id); return a ? <span key={id}><Paperclip size={12} />{a.name}<button aria-label={`Deselect ${a.name}`} disabled={busy} onClick={() => setSelectedFiles(p => p.filter(f => f !== id))}><X size={12} /></button></span> : null })}</div>}
            <form className="composer" onSubmit={e => void send(e)}><textarea ref={composer} aria-label="Your research question" placeholder={MODES[currentMode].placeholder} value={text} disabled={busy} rows={3} maxLength={30_000} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} /><div className="composer-toolbar"><div><IconButton label="Attach evidence" disabled={busy} onClick={() => void attach()}><Paperclip size={17} /></IconButton><span className="composer-separator" /><label className={`option-toggle ${refine ? 'enabled' : ''}`} title="Draft, critique, and refine: three model requests per answer"><input type="checkbox" checked={refine} disabled={busy} onChange={e => setRefine(e.target.checked)} /><Sparkles size={13} />Critique & refine</label></div>{busy ? <button className="stop-button" type="button" onClick={() => void attempt(() => api.cancel())}><Square size={13} fill="currentColor" />Stop</button> : <button className="send-button" type="submit" disabled={!text.trim()} aria-label="Send research question"><ArrowUp size={19} /></button>}</div></form>
            <div className="composer-footnote"><span><span className="tiny-dot" />{refine ? '3 requests per answer · provider usage charges apply' : 'Evidence first. Assumptions explicit. Answers worth checking.'}</span><span>↵ Send <b>·</b> ⇧ ↵ New line</span></div>
          </div>
        </section>
        <aside className="context-panel">
          <div className="context-heading"><span><Layers3 size={15} />Investigation context</span><span className="live-label">LOCAL</span></div>
          <section className="context-section"><div className="section-title"><h2>Evidence library</h2><span>{investigation?.attachments.length ?? 0}</span></div><p className="context-description">Give your model something to work from.</p>
            {investigation?.attachments.length ? <div className="file-list">{investigation.attachments.map(file => <EvidenceFile key={file.id} file={file} selected={selectedFiles.includes(file.id)} disabled={busy} inHistory={investigation.messages.some(m => m.attachmentIds?.includes(file.id))} onToggle={() => setSelectedFiles(p => p.includes(file.id) ? p.filter(id => id !== file.id) : p.length < 4 ? [...p, file.id] : p)} onRemove={() => void attempt(async () => setWorkspace(await api.removeAttachment(investigation.id, file.id)))} />)}</div> : <button className="evidence-dropzone" disabled={busy} onClick={() => void attach()}><span className="file-stack"><FileText size={25} /><Image size={25} /></span><strong>Add your first evidence</strong><span>Photos, blueprints, notes, or PDFs</span><span className="upload-hint"><Plus size={12} />Browse files</span></button>}
            {!!investigation?.attachments.length && <button className="subtle-button add-evidence" disabled={busy} onClick={() => void attach()}><Plus size={13} />Add evidence</button>}
            <div className="file-formats">PNG, JPG, WEBP · PDF text · TXT, MD, CSV, JSON<br />Images ≤ 4 MiB · Select up to 4 files per message</div>
          </section>
          <section className="context-section"><div className="section-title"><h2>Research approach</h2><Microscope size={14} /></div><ol className="approach-list"><li><span>01</span><div>Observe the evidence<small>Identify what is actually present</small></div></li><li><span>02</span><div>Build an explanation<small>Connect components and principles</small></div></li><li><span>03</span><div>Challenge the answer<small>Expose gaps and test alternatives</small></div></li></ol><label className="memory-toggle"><span><BookOpen size={14} />Use notebook lessons<small>{workspace.lessons.length} saved · last 12 included</small></span><input type="checkbox" checked={useLessons} disabled={busy} onChange={e => setUseLessons(e.target.checked)} /></label></section>
          <Calculator onError={setError} onInsert={value => setText(p => `${p}${p ? '\n' : ''}${value}`)} />
          <div className="context-bottom"><ShieldCheck size={17} /><p>Evidence stays in this workspace.<br /><span>Selected evidence and conversation history are sent to the provider you choose.</span></p></div>
        </aside>
      </div> : view === 'notebook' ? <section className="page-view"><div className="page-heading"><div><span className="eyebrow">LEARN FROM THE WORK</span><h1>Knowledge notebook</h1><p>Keep reviewed lessons. Bring better context to the next question.</p></div><button className="primary-button" onClick={() => openLesson()}><Plus size={16} />Add a lesson</button></div><div className="info-card"><Lightbulb size={19} /><div><strong>Learning you can inspect</strong><p>Save corrections and useful methods here. When enabled, the 12 most recent lessons become reference guidance for future runs. Feedback ratings are recorded separately; they do not automatically change model weights or become facts.</p></div></div>{workspace.lessons.length ? <div className="lesson-grid">{[...workspace.lessons].reverse().map((lesson, i) => <article className="lesson-card" key={lesson.id}><div><span>LESSON {String(workspace.lessons.length - i).padStart(2, '0')}</span><IconButton label="Delete lesson" onClick={() => void attempt(async () => setWorkspace(await api.deleteLesson(lesson.id)))}><Trash2 size={14} /></IconButton></div><p>{lesson.text}</p><footer><BookOpen size={12} />{date(lesson.createdAt)}{lesson.sourceId && <span>From an investigation</span>}</footer></article>)}</div> : <div className="empty-state"><BookOpen size={35} /><h2>A notebook that grows with you</h2><p>Save a verified correction or a useful research method.<br />You control what future investigations remember.</p><button className="subtle-button" onClick={() => openLesson()}><Plus size={15} />Write your first lesson</button></div>}</section> : <section className="page-view"><div className="page-heading"><div><span className="eyebrow">MEASURE. REVIEW. IMPROVE.</span><h1>Evaluation harness</h1><p>A repeatable baseline for reasoning and evidence discipline.</p></div><button className={busy ? 'stop-button' : 'primary-button'} onClick={() => void (busy ? attempt(() => api.cancel()) : runHarness())}>{busy ? <><Square size={13} />Stop evaluation</> : <><Activity size={16} />Run baseline suite</>}</button></div><div className="harness-config"><span><Box size={16} />{model || 'Choose a model above'}</span><label><input type="checkbox" checked={useLessons} disabled={busy} onChange={e => setUseLessons(e.target.checked)} />Include notebook lessons</label><span>4 model requests · usage charges apply</span></div>{busy && <div className="run-progress" role="status"><LoaderCircle size={18} className="spin" />{stage}</div>}<div className="eval-cases">{EVALUATIONS.map((test, i) => <div key={test.id}><span>0{i + 1}</span><strong>{test.name}</strong><small>{MODES[test.mode].short}</small></div>)}</div><div className="info-card"><FlaskConical size={20} /><div><strong>A smoke test, not a capability score</strong><p>Checks match expected words or numbers. They can flag regressions but can also pass incorrect answers or reject valid wording. Inspect each answer. Compare runs with and without lessons; no automatic promotion or self-training occurs.</p></div></div><div className="section-title runs-heading"><h2>Run history</h2><span>{workspace.evalRuns.length}</span></div>{workspace.evalRuns.length ? workspace.evalRuns.map(run => <details className="eval-run" key={run.id}><summary><span className={`eval-score ${run.results.every(r => r.passed) && run.results.length === 4 ? 'pass' : ''}`}>{run.results.filter(r => r.passed).length}/{run.results.length}</span><div><strong>{run.model}</strong><small>{PROVIDERS.find(p => p.id === run.provider)?.name} · {run.useLessons ? 'With lessons' : 'Baseline'} · {date(run.createdAt)} · {run.status}</small></div><ChevronDown size={16} /></summary><div className="eval-results">{run.results.map(result => <div key={result.caseId}><div className="eval-result-title"><strong>{EVALUATIONS.find(t => t.id === result.caseId)?.name}</strong><span className={result.error ? 'fail-text' : result.passed ? 'pass-text' : 'fail-text'}>{result.error ? 'Request failed' : result.passed ? 'Matched' : 'Needs review'}</span></div>{result.error ? <p className="fail-text">{result.error}</p> : <><p className="match-terms">Expected terms: {result.expected.join(', ')} · Matched: {result.matched.join(', ') || 'none'}</p><Markdown>{result.answer}</Markdown></>}</div>)}{run.status === 'cancelled' && <p className="muted">Cancelled: remaining cases were not run.</p>}</div></details>) : <div className="empty-state compact"><Activity size={28} /><h2>No evaluation runs yet</h2><p>Connect a provider, choose a model, and establish a baseline.</p></div>}</section>}
      <footer className="status-bar"><span><span className="status-dot" />{busy ? 'RUN IN PROGRESS' : 'READY TO EXPLORE'}</span><span>{PROVIDERS.length} provider connections<span className="status-bar-divider">/</span>Evidence-led research<span className="status-bar-divider">/</span><span className="mono">RE / 0.1</span></span></footer>
    </main>
    {notice && <div className="toast" role="status"><Check size={15} />{notice}</div>}
    {showProviders && info && <ProvidersModal info={info} selected={provider} busy={busy} onClose={() => setShowProviders(false)} onSave={setProviders} onError={setError} />}
    {showLesson && <Modal title="Save a research lesson" onClose={() => setShowLesson(false)}><div className="modal-body"><p className="muted">Write a correction or reusable method you have reviewed. Future runs may receive this as fallible reference guidance.</p>{lessonSource && <div className="draft-lesson-row"><button className="subtle-button" disabled={busy || !connected || !model.trim()} onClick={() => void draftLesson()}>{draftingLesson ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{draftingLesson ? 'Reflecting on the answer…' : 'Draft lesson with model'}</button><small>1 model request · review before saving</small></div>}<label className="field-label" htmlFor="lesson-text">What should the notebook remember?</label><textarea id="lesson-text" className="form-textarea" rows={6} maxLength={2000} disabled={draftingLesson} value={lessonText} onChange={e => setLessonText(e.target.value)} placeholder="For example: Verify gear ratios using tooth counts, and distinguish angular speed from torque." />{lessonError && <p className="inline-error" role="alert">{lessonError}</p>}<div className="modal-actions"><button className="subtle-button" onClick={() => setShowLesson(false)}>Cancel</button><button className="primary-button" disabled={!lessonText.trim() || draftingLesson} onClick={() => void saveLesson()}><BookOpen size={14} />Save lesson</button></div></div></Modal>}
    {editingTitle && investigation && <Modal title="Rename investigation" onClose={() => setEditingTitle(false)}><form className="modal-body" onSubmit={e => { e.preventDefault(); void attempt(async () => { setWorkspace(await api.renameInvestigation(investigation.id, title)); setEditingTitle(false) }) }}><label className="field-label" htmlFor="investigation-name">Investigation name</label><input id="investigation-name" className="form-input" maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /><div className="modal-actions"><button type="submit" className="primary-button" disabled={!title.trim()}>Save name</button></div></form></Modal>}
    {deleting && investigation && <Modal title="Delete investigation?" onClose={() => setDeleting(false)}><div className="modal-body"><p>“{investigation.title}” and its local evidence will be permanently removed from this workspace. Export it first if you need a copy.</p><div className="modal-actions"><button className="subtle-button" onClick={() => setDeleting(false)}>Keep investigation</button><button className="danger-button" onClick={() => void attempt(async () => { setWorkspace(await api.deleteInvestigation(investigation.id)); setSelected(null); setText(''); setSelectedFiles([]); setDeleting(false) })}>Delete investigation</button></div></div></Modal>}
    {showAbout && <Modal title="About Reverse Engineer" onClose={() => setShowAbout(false)}><div className="modal-body about-content"><Brand /><p>An evidence-led workspace for understanding how things work.</p><dl><div><dt>Application</dt><dd>{info?.version}</dd></div><div><dt>Electron</dt><dd>{info?.electronVersion}</dd></div><div><dt>Credential storage</dt><dd>{info?.secureStorage ? 'OS-encrypted' : 'Session only'}</dd></div></dl><div className="update-card"><Download size={18} /><p>{update.message}</p>{update.status === 'downloaded' ? <button className="primary-button" disabled={busy} onClick={() => void attempt(() => api.installUpdate())}>Restart & install</button> : <button className="subtle-button" disabled={update.status === 'checking'} onClick={() => void attempt(async () => setUpdate(await api.checkUpdates()))}>{update.status === 'checking' ? 'Checking…' : 'Check for updates'}</button>}</div><p className="small-text muted">Electron is upgraded as part of tested application releases. The updater downloads published builds; it does not replace the runtime underneath a running app.</p></div></Modal>}
  </div>
}

function Welcome({ mode, onMode, onPrompt }: { mode: Mode; onMode: (mode: Mode) => void; onPrompt: (value: string) => void }) {
  const prompts: Record<Mode, { title: string; detail: string; prompt: string }[]> = {
    engineer: [ { title: 'Decode a mechanism', detail: 'Components, motion & function', prompt: 'Help me reverse engineer a mechanism. What photos, measurements, and operating details should I provide to reconstruct how it works?' }, { title: 'Read between the lines', detail: 'Blueprints & technical drawings', prompt: 'Help me analyze an engineering blueprint. Explain how to identify components, follow energy or signal flow, and distinguish labeled dimensions from assumptions.' } ],
    mathematics: [ { title: 'Build a rigorous solution', detail: 'Equations, proofs & verification', prompt: 'Solve x² − 5x + 6 = 0. State the domain, derive both solutions, and verify them independently by substitution.' }, { title: 'Challenge a conjecture', detail: 'Assumptions & counterexamples', prompt: 'Help me investigate a mathematical conjecture. Explain how to separate numerical evidence from proof, look for counterexamples, and identify the assumptions a proof needs.' } ],
    discovery: [ { title: 'Explain a phenomenon', detail: 'Patterns, causes & hypotheses', prompt: 'Why do droplets form on the outside of a cold glass? Separate observations from the proposed mechanism, and suggest a test that distinguishes competing explanations.' }, { title: 'Design a useful experiment', detail: 'Predictions & controlled tests', prompt: 'Two plants grew taller after music was played nearby. Design a controlled experiment to test causation, account for confounders, and specify what evidence would change your conclusion.' } ],
  }
  return <div className="welcome"><div className="welcome-visual" aria-hidden="true"><div className="visual-grid" /><svg viewBox="0 0 240 170" fill="none"><path d="M120 18 191 59v72l-71 40-71-40V59l71-41Z" stroke="#6b7478" /><path d="m49 59 71 42 71-42M120 101v70M84 39l71 41v72M155 39 84 80v72" stroke="#899398" strokeWidth=".8" /><path d="M120 18v83M49 131l71-30 71 30" stroke="#41494d" strokeDasharray="3 4" /><path d="M120 48 164 74v45l-44 25-44-25V74l44-26Z" stroke="#d0fb91" strokeWidth="1.5" /><path d="m76 74 44 26 44-26M120 100v44" stroke="#d0fb91" strokeWidth="1.5" /><circle cx="120" cy="100" r="4" fill="#d0fb91" /><path d="M20 96h22M198 96h22M120 0v11" stroke="#6b7478" /><circle cx="49" cy="59" r="3" fill="#111315" stroke="#899398" /><circle cx="191" cy="131" r="3" fill="#111315" stroke="#899398" /></svg><span className="visual-label label-a">FIG. 01 / EXPLORATION</span><span className="visual-label label-b">OBSERVE → UNDERSTAND</span></div><span className="eyebrow welcome-eyebrow">CURIOSITY, WITH A METHOD</span><h2>Make the unknown<br /><span>understandable.</span></h2><p>Take apart an idea. Examine the evidence.<br />Build a clearer picture of how things work.</p><div className="mode-cards">{(Object.keys(MODES) as Mode[]).map(id => { const Icon = MODE_ICONS[id]; return <button key={id} className={`mode-card ${mode === id ? 'selected' : ''}`} onClick={() => onMode(id)}><Icon size={20} strokeWidth={1.5} /><strong>{MODES[id].name}</strong><span>{id === 'engineer' ? 'Systems & blueprints' : id === 'mathematics' ? 'Problems & proofs' : 'Patterns & principles'}</span>{mode === id && <span className="mode-selected"><Check size={10} /></span>}</button> })}</div><div className="starter-heading"><span>A PLACE TO START</span><span>or ask your own question below</span></div><div className="starter-cards">{prompts[mode].map(prompt => <button key={prompt.title} onClick={() => onPrompt(prompt.prompt)}><span><strong>{prompt.title}</strong><small>{prompt.detail}</small></span><ArrowRight size={16} /></button>)}</div></div>
}

function MessageCard({ item, investigation, onCopy, onLesson, onFeedback }: { item: Message; investigation: Investigation; onCopy: () => void; onLesson: () => void; onFeedback: (value: 'useful' | 'incorrect') => void }) {
  return <article className={`message ${item.role}`}><header>{item.role === 'assistant' ? <Brand small /> : <span className="user-avatar">AG</span>}<strong>{item.role === 'user' ? 'You' : 'Reverse Engineer'}</strong>{item.model && <span className="message-model">{item.model}</span>}<time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header><Markdown>{item.content}</Markdown>{!!item.attachmentIds?.length && <div className="message-attachments">{item.attachmentIds.map(id => { const a = investigation.attachments.find(f => f.id === id); return a ? <span key={id}><Paperclip size={12} />{a.name}</span> : null })}</div>}{item.role === 'assistant' && <><div className="answer-meta">{item.refined && <span><CheckCheck size={13} />Critique & refine completed</span>}<span>{((item.durationMs ?? 0) / 1000).toFixed(1)}s</span></div>{item.critique && <details className="critique"><summary><Microscope size={13} />Inspect the critique<ChevronDown size={12} /></summary><Markdown>{item.critique}</Markdown></details>}<footer><IconButton label="Copy answer" onClick={onCopy}><Copy size={14} /></IconButton><IconButton label="Mark answer useful" className={item.feedback === 'useful' ? 'rated' : ''} onClick={() => onFeedback('useful')}><ThumbsUp size={14} /></IconButton><IconButton label="Mark answer incorrect" className={item.feedback === 'incorrect' ? 'rated' : ''} onClick={() => onFeedback('incorrect')}><ThumbsDown size={14} /></IconButton><button className="save-lesson-button" onClick={onLesson}><BookOpen size={13} />Save a lesson</button></footer></>}</article>
}

function EvidenceFile({ file, selected, disabled, inHistory, onToggle, onRemove }: { file: Attachment; selected: boolean; disabled: boolean; inHistory: boolean; onToggle: () => void; onRemove: () => void }) {
  return <div className={`evidence-file ${selected ? 'selected' : ''}`}><button className="evidence-file-main" onClick={onToggle} disabled={disabled} aria-pressed={selected} title={file.note ?? 'Select to include in your next message'}>{file.data ? <img src={`data:${file.mime};base64,${file.data}`} alt={file.name} /> : <FileText size={22} />}<span><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(0)} KiB · {inHistory ? 'In conversation' : selected ? 'Selected' : 'Click to select'}</small></span><span className="file-check">{selected && <Check size={10} />}</span></button>{file.note && <p>{file.note}</p>}{!inHistory && <button className="file-remove" disabled={disabled} aria-label={`Remove ${file.name}`} onClick={onRemove}><X size={12} /></button>}</div>
}

function Calculator({ onError, onInsert }: { onError: (error: string) => void; onInsert: (text: string) => void }) {
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  async function calculate(e: FormEvent) { e.preventDefault(); setBusy(true); setResult(''); try { setResult(await api.calculate(expression)) } catch (e) { onError(message(e)) } finally { setBusy(false) } }
  return <section className="context-section calculator"><div className="section-title"><h2>Calculation check</h2><Sigma size={15} /></div><p className="context-description">Check a numeric result independently.</p><form onSubmit={e => void calculate(e)}><input aria-label="Math expression" placeholder="e.g. 120 * 12 / 36" value={expression} maxLength={300} onChange={e => setExpression(e.target.value)} /><button type="submit" aria-label="Calculate expression" disabled={busy || !expression.trim()}>{busy ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}</button></form>{result && <div className="calculation-result"><code>{result}</code><button onClick={() => onInsert(`Independent calculator check: ${expression} = ${result}`)} title="Add result to question"><Plus size={13} /></button></div>}<small>64-digit precision · radians · numeric expressions</small></section>
}

function ProvidersModal({ info, selected, busy, onClose, onSave, onError }: { info: AppInfo; selected: ProviderId; busy: boolean; onClose: () => void; onSave: (providers: ProviderStatus[]) => void; onError: (error: string) => void }) {
  const [id, setId] = useState<ProviderId>(selected)
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(info.providers.find(p => p.id === selected)?.baseUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const def = PROVIDERS.find(p => p.id === id)!
  const connection = info.providers.find(p => p.id === id)!
  function choose(value: ProviderId) { setId(value); setKey(''); setUrl(info.providers.find(p => p.id === value)!.baseUrl); setStatus(''); setError('') }
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setStatus('')
    try { onSave(await api.saveProvider(id, key, ['custom', 'ollama-local'].includes(id) ? url : undefined)); setKey(''); setStatus('Connection settings saved. Use Test connection to check access.') }
    catch (e) { setError(message(e)) } finally { setSaving(false) }
  }
  async function test() {
    setSaving(true); setStatus(''); setError('')
    try { const models = await api.models(id); setStatus(`Connection verified. ${models.length} model IDs available. Refresh the workbench catalog to choose one.`) }
    catch (e) { setError(message(e)) } finally { setSaving(false) }
  }
  return <Modal title="Model providers" onClose={onClose} wide><div className="providers-layout"><nav aria-label="Provider settings">{PROVIDERS.map(p => <button key={p.id} className={id === p.id ? 'selected' : ''} onClick={() => choose(p.id)}><span className="provider-logo">{p.short}</span><span>{p.name}</span>{info.providers.find(s => s.id === p.id)?.configured && <span className="status-dot" />}</button>)}</nav><div className="provider-form"><div className="provider-intro"><span className="provider-logo large">{def.short}</span><div><h3>{def.name}</h3><p>{def.description}</p></div></div>{!info.desktop && <p className="inline-warning">Browser preview: credentials are accepted only in the Electron desktop app.</p>}<form onSubmit={e => void save(e)}>{id !== 'ollama-local' && <><label className="field-label" htmlFor="api-key">API key <span>{connection.configured ? 'Connected · enter a new key to replace' : 'Required'}</span></label><input id="api-key" className="form-input" type="password" autoComplete="off" placeholder={connection.configured ? '••••••••••••••••' : `Enter your ${def.name} API key`} disabled={!info.desktop || busy || saving} value={key} onChange={e => setKey(e.target.value)} /><p className="input-hint">Also reads <code>{def.envKey}</code> from the desktop process environment.</p></>}
      <label className="field-label" htmlFor="base-url">API endpoint{!['custom', 'ollama-local'].includes(id) && <span>Fixed provider origin</span>}</label><input id="base-url" className="form-input mono" value={url} disabled={!['custom', 'ollama-local'].includes(id) || busy || saving} onChange={e => setUrl(e.target.value)} />{id === 'ollama-local' && <p className="input-hint">Install and start Ollama, then pull a model. No API key is needed. Only localhost addresses are accepted here.</p>}{id === 'custom' && <p className="input-hint">Use a trusted HTTPS Chat Completions endpoint, including its API base path (usually /v1).</p>}<div className="key-storage"><ShieldCheck size={17} /><div><strong>{info.secureStorage ? 'Encrypted by your operating system' : 'Session-only credential storage'}</strong><p>{info.secureStorage ? 'Keys stay in the desktop main process and are never returned to the page.' : 'No secure OS keychain is available. Keys remain in memory and must be entered again after restart.'}</p></div></div>{error && <p className="inline-error" role="alert">{error}</p>}{status && <p className="inline-success" role="status"><Check size={15} />{status}</p>}<div className="provider-actions"><button type="submit" className="primary-button" disabled={!info.desktop || busy || saving || (!key && !connection.configured && id !== 'ollama-local')}>{saving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Save connection</button><button type="button" className="subtle-button" disabled={!info.desktop || busy || saving || !connection.configured} onClick={() => void test()}><Zap size={14} />Test connection</button></div></form><div className="provider-links">{def.keyUrl && <button className="text-link" onClick={() => void api.openExternal(def.keyUrl).catch(e => onError(message(e)))}>{id === 'ollama-local' ? 'Download Ollama' : 'Get an API key'}<ArrowRight size={13} /></button>}{connection.keyStorage !== 'none' && <button className="text-link danger-text" disabled={busy || saving || connection.keyStorage === 'environment'} title={connection.keyStorage === 'environment' ? 'Remove environment keys from your process environment' : 'Forget saved key'} onClick={async () => { try { onSave(await api.clearProvider(id)); setStatus('Saved key removed. Environment credentials, if present, still apply.') } catch (e) { setError(message(e)) } }}>Forget saved key</button>}</div><p className="provider-note">Model catalogs come directly from each API. Availability, image support, pricing, and access depend on your account and selected model. Provider APIs evolve; manual model IDs are supported.</p></div></div></Modal>
}
