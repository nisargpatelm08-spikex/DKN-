import { useState } from 'react'
import { sampleStory } from './data/sampleStory'

const uid = () => crypto.randomUUID()

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
  insertIndex = Math.max(0, Math.min(insertIndex, chapters.find((c) => c.id === targetChapterId).scenes.length))

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

  const selected = findScene(story, selectedSceneId)
  const sceneCount = story.chapters.reduce((total, ch) => total + ch.scenes.length, 0)

  const expand = (chapterId) =>
    setExpanded((prev) => new Set([...prev, chapterId]))

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
    const chapter = { id: uid(), title: 'New Chapter', scenes: [{ id: uid(), title: 'Scene 1', text: '' }] }
    setStory((prev) => ({ ...prev, chapters: [...prev.chapters, chapter] }))
    expand(chapter.id)
    setSelectedSceneId(chapter.scenes[0].id)
  }

  const handleAddScene = (chapterId) => {
    const scene = { id: uid(), title: 'New scene', text: '' }
    setStory((prev) => ({
      ...prev,
      chapters: prev.chapters.map((c) => (c.id === chapterId ? { ...c, scenes: [...c.scenes, scene] } : c))
    }))
    expand(chapterId)
    setSelectedSceneId(scene.id)
  }

  // ----- deleting -----

  const handleDeleteScene = (sceneId) => {
    const location = findScene(story, sceneId)
    if (!location) return
    if (!window.confirm(`Delete scene "${location.scene.title}"?`)) return
    const next = deleteScene(story, sceneId)
    setStory(next)
    setSelectedSceneId(chooseAfterDelete(next, location.chapter.id))
  }

  const handleDeleteChapter = (chapterId) => {
    const chapter = story.chapters.find((c) => c.id === chapterId)
    if (!chapter) return
    if (!window.confirm(`Delete chapter "${chapter.title}" and all its scenes?`)) return
    const next = deleteChapter(story, chapterId)
    setStory(next)
    const all = next.chapters.flatMap((c) => c.scenes)
    setSelectedSceneId(all.length ? all[0].id : null)
  }

  // ----- moving -----

  const handleMoveChapter = (chapterId, dir) => {
    setStory((prev) => moveChapter(prev, chapterId, dir))
  }

  const handleMoveScene = (sceneId, dir) => {
    setStory((prev) => moveScene(prev, sceneId, dir))
  }

  // ----- renaming -----

  const startEditChapter = (chapter) => {
    setEditingChapterId(chapter.id)
    setEditingSceneId(null)
    setDraft(chapter.title)
  }

  const startEditScene = (scene) => {
    setEditingSceneId(scene.id)
    setEditingChapterId(null)
    setDraft(scene.title)
  }

  const commitRename = () => {
    const title = draft.trim()
    if (editingChapterId) {
      if (title) setStory((prev) => updateChapter(prev, editingChapterId, { title }))
      setEditingChapterId(null)
    }
    if (editingSceneId) {
      if (title) setStory((prev) => updateScene(prev, editingSceneId, { title }))
      setEditingSceneId(null)
    }
  }

  const cancelRename = () => {
    setEditingChapterId(null)
    setEditingSceneId(null)
  }

  const onRenameKey = (e) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') cancelRename()
  }

  // ----- drag & drop for scenes -----

  const sceneIndexInChapter = (chapter, sceneId) => chapter.scenes.findIndex((s) => s.id === sceneId)

  const handleDropOnScene = (chapterId, targetSceneId) => {
    if (!draggedSceneId || draggedSceneId === targetSceneId) {
      setDraggedSceneId(null)
      setDragOverSceneId(null)
      return
    }
    const chapter = story.chapters.find((c) => c.id === chapterId)
    const targetIndex = sceneIndexInChapter(chapter, targetSceneId)
    setStory((prev) => reorderScenes(prev, draggedSceneId, chapterId, targetIndex))
    setDraggedSceneId(null)
    setDragOverSceneId(null)
  }

  // ---------- render ----------

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">DKN</div>
        <div className="story-title">{story.title}</div>
        <div className="story-stats">
          {story.chapters.length} chapters · {sceneCount} scenes
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
                            (scene.id === dragOverSceneId && dragOverSceneId !== draggedSceneId ? ' drag-over' : '')
                          }
                          onClick={() => setSelectedSceneId(scene.id)}
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

        <main className="editor">
          {selected ? (
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
                onChange={(e) =>
                  setStory(updateScene(story, selectedSceneId, { title: e.target.value }))
                }
                placeholder="Scene title"
              />

              <div className="frame-strip">
                <div className="frame-placeholder">
                  <div className="frame-icon">🖼️</div>
                  <div>Artwork placeholder</div>
                  <div className="frame-hint">Uploading &amp; drawing arrive in Phase 3</div>
                </div>
              </div>

              <textarea
                className="scene-text"
                value={selected.scene.text}
                onChange={(e) =>
                  setStory(updateScene(story, selectedSceneId, { text: e.target.value }))
                }
                placeholder="Write your scene prose here…"
              />
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-big">No scene selected</div>
              <div className="empty-hint">Pick a scene from the sidebar, or add a chapter.</div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App