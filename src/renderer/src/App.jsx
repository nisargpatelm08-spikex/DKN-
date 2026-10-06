import { useEffect, useRef, useState } from 'react'
import { sampleStory } from './data/sampleStory'
import DrawingPad from './components/DrawingPad'
import Board from './components/Board'
import Timeline from './components/Timeline'
import { buildPrintHtml } from './lib/printHtml'
import { pruneLinksForScene, sanitizeBoard, CARD_W, CARD_H } from './lib/boardUtils'

const uid = () => crypto.randomUUID()
const UNDO_LIMIT = 10

// ---------- pure helpers ----------

function findScene(story, sceneId) {
  for (const chapter of story.chapters) {
    const scene = chapter.scenes.find((s) => s.id === sceneId)
    if (scene) return { chapter, scene }
  }
  return null
}

function updateScene(story, sceneId, patch) {
  return {
    ...story,
    chapters: story.chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s))
    }))
  }
}

function updateChapter(story, chapterId, patch) {
  return {
    ...story,
    chapters: story.chapters.map((c) => (c.id === chapterId ? { ...c, ...patch } : c))
  }
}

function deleteScene(story, sceneId) {
  return {
    ...story,
    chapters: story.chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.filter((s) => s.id !== sceneId)
    }))
  }
}

function deleteChapter(story, chapterId) {
  return { ...story, chapters: story.chapters.filter((c) => c.id !== chapterId) }
}

function moveChapter(story, chapterId, dir) {
  const index = story.chapters.findIndex((c) => c.id === chapterId)
  const target = index + dir
  if (index < 0 || target < 0 || target >= story.chapters.length) return story
  const chapters = [...story.chapters]
  const [item] = chapters.splice(index, 1)
  chapters.splice(target, 0, item)
  return { ...story, chapters }
}

function moveScene(story, sceneId, dir) {
  for (const chapter of story.chapters) {
    const index = chapter.scenes.findIndex((s) => s.id === sceneId)
    if (index >= 0) {
      const target = index + dir
      if (target < 0 || target >= chapter.scenes.length) return story
      const scenes = [...chapter.scenes]
      const [item] = scenes.splice(index, 1)
      scenes.splice(target, 0, item)
      return {
        ...story,
        chapters: story.chapters.map((c) => (c.id === chapter.id ? { ...c, scenes } : c))
      }
    }
  }
  return story
}

function reorderScenes(story, draggedId, targetChapterId, targetIndex) {
  let draggedChapter = null
  let draggedIndex = -1
  let draggedScene = null
  for (const chapter of story.chapters) {
    const i = chapter.scenes.findIndex((s) => s.id === draggedId)
    if (i >= 0) {
      draggedChapter = chapter
      draggedIndex = i
      draggedScene = chapter.scenes[i]
      break
    }
  }
  if (!draggedChapter || !draggedScene) return story

  let chapters = story.chapters.map((c) => ({
    ...c,
    scenes: c.id === draggedChapter.id ? c.scenes.filter((s) => s.id !== draggedId) : [...c.scenes]
  }))

  let insertIndex = targetIndex
  if (targetChapterId === draggedChapter.id && draggedIndex < targetIndex) insertIndex -= 1
  insertIndex = Math.max(
    0,
    Math.min(insertIndex, chapters.find((c) => c.id === targetChapterId).scenes.length)
  )

  chapters = chapters.map((c) => {
    if (c.id !== targetChapterId) return c
    const scenes = [...c.scenes]
    scenes.splice(insertIndex, 0, draggedScene)
    return { ...c, scenes }
  })

  return { ...story, chapters }
}

function chooseAfterDelete(story, deletedFromChapterId) {
  const chapter = story.chapters.find((c) => c.id === deletedFromChapterId)
  if (chapter && chapter.scenes.length) return chapter.scenes[0].id
  const all = story.chapters.flatMap((c) => c.scenes)
  return all.length ? all[0].id : null
}

function shrinkImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1600
      let { width, height } = img
      if (width > MAX || height > MAX) {
        const scale = Math.min(MAX / width, MAX / height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, width)
      canvas.height = Math.max(1, height)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// ---------- the app ----------

function App() {
  const [story, setStory] = useState(sampleStory)
  const [selectedSceneId, setSelectedSceneId] = useState(sampleStory.chapters[0].scenes[0].id)
  const [expanded, setExpanded] = useState(() => new Set(sampleStory.chapters.map((c) => c.id)))
  const [editingChapterId, setEditingChapterId] = useState(null)
  const [editingSceneId, setEditingSceneId] = useState(null)
  const [draft, setDraft] = useState('')
  const [draggedSceneId, setDraggedSceneId] = useState(null)
  const [dragOverSceneId, setDragOverSceneId] = useState(null)
  const [history, setHistory] = useState([])
  const [drawingSceneId, setDrawingSceneId] = useState(null)
  const [projectPath, setProjectPath] = useState(null)
  const [status, setStatus] = useState('')
  const [view, setView] = useState('editor') // editor | board | timeline
  const sessionRef = useRef(false)
  const fileInputRef = useRef(null)

  const selected = findScene(story, selectedSceneId)
  const sceneCount = story.chapters.reduce((total, ch) => total + ch.scenes.length, 0)

  // Keep undo limited to the last UNDO_LIMIT snapshots.
  const pushSnapshot = () => {
    setHistory((h) => [...h, story].slice(-UNDO_LIMIT))
  }

  // Call before any change. A run of rapid edits (typing) counts as ONE undo step.
  const markChange = () => {
    if (sessionRef.current) return
    sessionRef.current = true
    pushSnapshot()
  }

  const endSession = () => {
    sessionRef.current = false
  }

  const undo = () => {
    if (!history.length) return
    const previous = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setStory(previous)
    sessionRef.current = false
  }

  // Board & Timeline use these so every change is one undo step, and a whole
  // drag gesture (many tiny updates) still counts as a single undo step.
  const commit = (mutate) => {
    markChange()
    setStory((prev) => mutate(prev))
    endSession()
  }

  const patch = (mutate) => {
    // Same as commit but keeps the session open (used mid-gesture).
    markChange()
    setStory((prev) => mutate(prev))
  }

  // ----- file management -----

  const openStory = (data, filePath) => {
    setStory(data)
    const allScenes = data.chapters.flatMap((c) => c.scenes)
    setSelectedSceneId(allScenes.length ? allScenes[0].id : null)
    setExpanded(new Set(data.chapters.map((c) => c.id)))
    setProjectPath(filePath)
    setView('editor')
  }

  const handleNew = () => {
    if (!window.confirm('Start a new story? Your current work will be replaced.')) return
    const fresh = {
      id: uid(),
      title: 'Untitled Story',
      chapters: [
        { id: uid(), title: 'Chapter 1', scenes: [{ id: uid(), title: 'Scene 1', text: '' }] }
      ]
    }
    setStory(fresh)
    setSelectedSceneId(fresh.chapters[0].scenes[0].id)
    setExpanded(new Set([fresh.chapters[0].id]))
    setProjectPath(null)
    setView('editor')
    setStatus('New story')
  }

  const handleSave = async () => {
    if (!window.api) return
    try {
      const res = await window.api.saveProject(sanitizeBoard(story), projectPath)
      if (!res.canceled) {
        setProjectPath(res.path)
        setStatus('Saved · ' + res.path)
      }
    } catch (err) {
      window.alert('Could not save: ' + err.message)
    }
  }

  const handleOpen = async () => {
    if (!window.api) return
    if (!window.confirm('Open a different story? Your current work will be replaced.')) return
    try {
      const res = await window.api.openProject()
      if (res.canceled) return
      if (!res.data || !Array.isArray(res.data.chapters)) throw new Error('not a DKN story file')
      openStory(res.data, res.path)
      setStatus('Opened · ' + res.path)
    } catch (err) {
      window.alert('Could not open that file: ' + err.message)
    }
  }

  const handleExportPdf = async () => {
    if (!window.api) return
    try {
      const res = await window.api.exportPdf(buildPrintHtml(story), story.title)
      if (!res.canceled) setStatus('Exported PDF · ' + res.path)
    } catch (err) {
      window.alert('Could not export PDF: ' + err.message)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      const key = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && key === 's') {
        e.preventDefault()
        handleSave()
      } else if (mod && key === 'o') {
        e.preventDefault()
        handleOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Recover the last session from autosave on launch.
  useEffect(() => {
    if (!window.api) return
    window.api
      .loadAutosave()
      .then((res) => {
        if (res && res.ok && res.data && Array.isArray(res.data.chapters)) {
          openStory(res.data, null)
          setStatus('Recovered your last session automatically')
        }
      })
      .catch(() => {})
  }, [])

  // Safety net: quietly save to app data ~1s after changes.
  useEffect(() => {
    if (!window.api) return
    const timer = setTimeout(() => {
      window.api.autosave(story).catch(() => {})
    }, 1000)
    return () => clearTimeout(timer)
  }, [story])

  const selectScene = (sceneId) => {
    endSession()
    setSelectedSceneId(sceneId)
  }

  const openInEditor = (sceneId) => {
    endSession()
    setSelectedSceneId(sceneId)
    setView('editor')
  }

  const expand = (chapterId) => setExpanded((prev) => new Set([...prev, chapterId]))

  const toggleChapter = (chapterId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(chapterId)) next.delete(chapterId)
      else next.add(chapterId)
      return next
    })
  }

  // ----- adding -----

  const handleAddChapter = () => {
    const chapter = {
      id: uid(),
      title: 'New Chapter',
      scenes: [{ id: uid(), title: 'Scene 1', text: '' }]
    }
    markChange()
    setStory((prev) => ({ ...prev, chapters: [...prev.chapters, chapter] }))
    endSession()
    expand(chapter.id)
    selectScene(chapter.scenes[0].id)
  }

  const handleAddScene = (chapterId) => {
    const scene = { id: uid(), title: 'New scene', text: '' }
    markChange()
    setStory((prev) => ({
      ...prev,
      chapters: prev.chapters.map((c) =>
        c.id === chapterId ? { ...c, scenes: [...c.scenes, scene] } : c
      )
    }))
    endSession()
    expand(chapterId)
    selectScene(scene.id)
  }

  // Used by the Board's right-click menu: same as handleAddScene but the new
  // card is placed exactly where the user right-clicked on the canvas.
  const handleAddSceneAt = (chapterId, x, y) => {
    const scene = {
      id: uid(),
      title: 'New scene',
      text: '',
      board: { x: Math.round(x), y: Math.round(y) }
    }
    markChange()
    setStory((prev) => ({
      ...prev,
      chapters: prev.chapters.map((c) =>
        c.id === chapterId ? { ...c, scenes: [...c.scenes, scene] } : c
      )
    }))
    endSession()
    expand(chapterId)
    selectScene(scene.id)
  }

  const handleAddChapterAt = (x, y) => {
    const scene = {
      id: uid(),
      title: 'Scene 1',
      text: '',
      board: { x: Math.round(x), y: Math.round(y) }
    }
    const chapter = {
      id: uid(),
      title: 'New Chapter',
      zone: { x: Math.round(x) - 24, y: Math.round(y) - 30, w: CARD_W + 48, h: CARD_H + 56 },
      scenes: [scene]
    }
    markChange()
    setStory((prev) => ({ ...prev, chapters: [...prev.chapters, chapter] }))
    endSession()
    expand(chapter.id)
    selectScene(scene.id)
  }

  // ----- deleting -----

  const handleDeleteScene = (sceneId) => {
    const location = findScene(story, sceneId)
    if (!location) return
    if (!window.confirm(`Delete scene "${location.scene.title}"?`)) return
    markChange()
    let next = pruneLinksForScene(story, sceneId)
    next = deleteScene(next, sceneId)
    setStory(next)
    endSession()
    selectScene(chooseAfterDelete(next, location.chapter.id))
  }

  const handleDeleteChapter = (chapterId) => {
    const chapter = story.chapters.find((c) => c.id === chapterId)
    if (!chapter) return
    if (!window.confirm(`Delete chapter "${chapter.title}" and all its scenes?`)) return
    markChange()
    let next = deleteChapter(story, chapterId)
    for (const scene of chapter.scenes) {
      next = pruneLinksForScene(next, scene.id)
    }
    setStory(next)
    endSession()
    const all = next.chapters.flatMap((c) => c.scenes)
    selectScene(all.length ? all[0].id : null)
  }

  // ----- moving -----

  const handleMoveChapter = (chapterId, dir) => {
    const next = moveChapter(story, chapterId, dir)
    if (next === story) return
    markChange()
    setStory(next)
    endSession()
  }

  const handleMoveScene = (sceneId, dir) => {
    const next = moveScene(story, sceneId, dir)
    if (next === story) return
    markChange()
    setStory(next)
    endSession()
  }

  const handleDropOnScene = (chapterId, targetSceneId) => {
    if (!draggedSceneId || draggedSceneId === targetSceneId) {
      setDraggedSceneId(null)
      setDragOverSceneId(null)
      return
    }
    const chapter = story.chapters.find((c) => c.id === chapterId)
    const targetIndex = chapter.scenes.findIndex((s) => s.id === targetSceneId)
    const next = reorderScenes(story, draggedSceneId, chapterId, targetIndex)
    if (next !== story) markChange()
    setStory(next)
    endSession()
    setDraggedSceneId(null)
    setDragOverSceneId(null)
  }

  // ----- renaming -----

  const startEditChapter = (chapter) => {
    endSession()
    setEditingChapterId(chapter.id)
    setEditingSceneId(null)
    setDraft(chapter.title)
  }

  const startEditScene = (scene) => {
    endSession()
    setEditingSceneId(scene.id)
    setEditingChapterId(null)
    setDraft(scene.title)
  }

  const commitRename = () => {
    const title = draft.trim()
    if (editingChapterId && title) {
      markChange()
      setStory((prev) => updateChapter(prev, editingChapterId, { title }))
    }
    if (editingSceneId && title) {
      markChange()
      setStory((prev) => updateScene(prev, editingSceneId, { title }))
    }
    setEditingChapterId(null)
    setEditingSceneId(null)
    endSession()
  }

  const cancelRename = () => {
    setEditingChapterId(null)
    setEditingSceneId(null)
  }

  const onRenameKey = (e) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') cancelRename()
  }

  // ----- images -----

  const attachImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    markChange()
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(file)
    })
    const image = await shrinkImage(dataUrl)
    setStory(updateScene(story, selectedSceneId, { image }))
    endSession()
  }

  const handleFileInput = (e) => {
    const file = e.target.files?.[0]
    if (file) attachImageFile(file)
    e.target.value = ''
  }

  const handleDropFile = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) attachImageFile(file)
  }

  const removeImage = () => {
    if (!window.confirm('Remove the artwork from this scene?')) return
    markChange()
    setStory(updateScene(story, selectedSceneId, { image: undefined }))
    endSession()
  }

  const saveDrawing = (dataUrl) => {
    markChange()
    setStory(updateScene(story, drawingSceneId, { image: dataUrl }))
    endSession()
    setDrawingSceneId(null)
  }

  const sceneIndexInChapter = (chapter, sceneId) =>
    chapter.scenes.findIndex((s) => s.id === sceneId)

  // ---------- render ----------

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">DKN</div>
        <div className="story-title">{story.title}</div>
        <div className="story-stats">
          {story.chapters.length} chapters · {sceneCount} scenes
        </div>
        <div className="view-switch">
          <button
            className={'view-btn' + (view === 'editor' ? ' active' : '')}
            onClick={() => setView('editor')}
          >
            Editor
          </button>
          <button
            className={'view-btn' + (view === 'board' ? ' active' : '')}
            onClick={() => setView('board')}
          >
            Board
          </button>
          <button
            className={'view-btn' + (view === 'timeline' ? ' active' : '')}
            onClick={() => setView('timeline')}
          >
            Timeline
          </button>
        </div>
        <div className="topbar-actions">
          <span className="status-text" title={status}>{status}</span>
          <button className="bar-btn" onClick={handleNew} title="New story">✚</button>
          <button className="bar-btn" onClick={handleOpen} title="Open story (Ctrl+O)">📂</button>
          <button className="bar-btn primary" onClick={handleSave} title="Save story (Ctrl+S)">
            {projectPath ? '💾' : '💾…'}
          </button>
          <button className="bar-btn" onClick={handleExportPdf} title="Export story as PDF">
            🖨️ PDF
          </button>
          <button className="undo-btn" disabled={!history.length} onClick={undo}>
            ↶{history.length ? ` (${history.length})` : ''}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <button className="add-chapter-btn" onClick={handleAddChapter}>
            ＋ Add chapter
          </button>
          {story.chapters.map((chapter, ci) => {
            const isOpen = expanded.has(chapter.id)
            return (
              <section className="chapter" key={chapter.id}>
                <div
                  className="chapter-header"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleChapter(chapter.id)}
                  onKeyDown={(e) => e.key === 'Enter' && toggleChapter(chapter.id)}
                >
                  <span className="chevron">{isOpen ? '▾' : '▸'}</span>
                  {editingChapterId === chapter.id ? (
                    <input
                      className="rename-input chapter-title"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={onRenameKey}
                    />
                  ) : (
                    <span className="chapter-title">{chapter.title}</span>
                  )}
                  <span className="chapter-count">{chapter.scenes.length}</span>
                  <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" title="Rename chapter" onClick={() => startEditChapter(chapter)}>✎</button>
                    <button className="icon-btn" title="Add scene" onClick={() => handleAddScene(chapter.id)}>＋</button>
                    <button className="icon-btn" title="Move chapter up" disabled={ci === 0} onClick={() => handleMoveChapter(chapter.id, -1)}>↑</button>
                    <button className="icon-btn" title="Move chapter down" disabled={ci === story.chapters.length - 1} onClick={() => handleMoveChapter(chapter.id, 1)}>↓</button>
                    <button className="icon-btn danger" title="Delete chapter" onClick={() => handleDeleteChapter(chapter.id)}>✕</button>
                  </span>
                </div>
                {isOpen && (
                  <ul className="scenes">
                    {chapter.scenes.map((scene) => (
                      <li
                        key={scene.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggedSceneId(scene.id)
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', scene.id)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (dragOverSceneId !== scene.id) setDragOverSceneId(scene.id)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          handleDropOnScene(chapter.id, scene.id)
                        }}
                        onDragEnd={() => {
                          setDraggedSceneId(null)
                          setDragOverSceneId(null)
                        }}
                      >
                        <div
                          className={
                            'scene-item' +
                            (scene.id === selectedSceneId ? ' selected' : '') +
                            (scene.id === draggedSceneId ? ' dragging' : '') +
                            (scene.id === dragOverSceneId && dragOverSceneId !== draggedSceneId
                              ? ' drag-over'
                              : '')
                          }
                          onClick={() => selectScene(scene.id)}
                        >
                          <span className="scene-number">
                            {ci + 1}.{sceneIndexInChapter(chapter, scene.id) + 1}
                          </span>
                          <span className="scene-item-main">
                            {editingSceneId === scene.id ? (
                              <input
                                className="rename-input"
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={onRenameKey}
                              />
                            ) : (
                              <span className="scene-item-title">{scene.title}</span>
                            )}
                          </span>
                          <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                            <button className="icon-btn" title="Rename scene" onClick={() => startEditScene(scene)}>✎</button>
                            <button className="icon-btn" title="Move up" onClick={() => handleMoveScene(scene.id, -1)}>↑</button>
                            <button className="icon-btn" title="Move down" onClick={() => handleMoveScene(scene.id, 1)}>↓</button>
                            <button className="icon-btn danger" title="Delete scene" onClick={() => handleDeleteScene(scene.id)}>✕</button>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </aside>

        <main className={view === 'editor' ? 'editor' : 'editor editor-view'}>
          {view === 'editor' ? (
            selected ? (
              <div className="editor-inner">
              <div className="editor-toolbar">
                <span className="editor-path">
                  {selected.chapter.title} › Scene{' '}
                  {sceneIndexInChapter(selected.chapter, selectedSceneId) + 1}
                </span>
                <span className="toolbar-spacer" />
                <button className="tonal-btn" title="Add a scene to this chapter" onClick={() => handleAddScene(selected.chapter.id)}>＋ Scene</button>
                <button className="tonal-btn" title="Move scene up" onClick={() => handleMoveScene(selectedSceneId, -1)}>↑</button>
                <button className="tonal-btn" title="Move scene down" onClick={() => handleMoveScene(selectedSceneId, 1)}>↓</button>
                <button className="tonal-btn danger" title="Delete this scene" onClick={() => handleDeleteScene(selectedSceneId)}>✕</button>
              </div>

              <input
                className="scene-title-input"
                value={selected.scene.title}
                onChange={(e) => {
                  markChange()
                  setStory(updateScene(story, selectedSceneId, { title: e.target.value }))
                }}
                placeholder="Scene title"
              />

              <div
                className={'frame' + (selected.scene.image ? ' has-image' : '')}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={handleDropFile}
              >
                {selected.scene.image ? (
                  <img className="frame-img" src={selected.scene.image} alt={selected.scene.title} />
                ) : (
                  <div className="frame-empty">
                    <div className="frame-icon">🖼️</div>
                    <div>No artwork yet</div>
                    <div className="frame-hint">Upload, drop an image here, or draw</div>
                  </div>
                )}
                <div className="frame-tools">
                  <button className="frame-btn" title="Upload an image" onClick={() => fileInputRef.current?.click()}>⬆ Upload</button>
                  <button className="frame-btn" title="Draw on this frame" onClick={() => setDrawingSceneId(selectedSceneId)}>✎ Draw</button>
                  {selected.scene.image && (
                    <button className="frame-btn danger" title="Remove artwork" onClick={removeImage}>✕ Remove</button>
                  )}
                </div>
              </div>

              <textarea
                className="scene-text"
                value={selected.scene.text}
                onChange={(e) => {
                  markChange()
                  setStory(updateScene(story, selectedSceneId, { text: e.target.value }))
                }}
                placeholder="Write your scene prose here…"
              />
            </div>
          ) : (
              <div className="empty-state">
                <div className="empty-big">No scene selected</div>
                <div className="empty-hint">Pick a scene from the sidebar, or add a chapter.</div>
              </div>
            )
          ) : view === 'board' ? (
            <Board
              story={story}
              selectedSceneId={selectedSceneId}
              onSelectScene={selectScene}
              onOpenInEditor={openInEditor}
              onAddScene={handleAddScene}
              onAddSceneAt={handleAddSceneAt}
              onAddChapterAt={handleAddChapterAt}
              commit={commit}
              patch={patch}
              endSession={endSession}
            />
          ) : (
            <Timeline
              story={story}
              selectedSceneId={selectedSceneId}
              onSelectScene={selectScene}
              onOpenInEditor={openInEditor}
              patch={patch}
              commit={commit}
              endSession={endSession}
            />
          )}
        </main>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileInput}
      />

      {drawingSceneId && findScene(story, drawingSceneId) && (
        <DrawingPad
          image={findScene(story, drawingSceneId).scene.image}
          onSave={saveDrawing}
          onCancel={() => setDrawingSceneId(null)}
        />
      )}
    </div>
  )
}

export default App