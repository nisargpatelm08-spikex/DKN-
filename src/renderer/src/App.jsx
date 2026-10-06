import { useState } from 'react'
import { sampleStory } from './data/sampleStory'

// ---------- tiny helpers for finding/updating parts of the story ----------

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

// ---------- the app ----------

function App() {
  const [story, setStory] = useState(sampleStory)
  const [selectedSceneId, setSelectedSceneId] = useState(sampleStory.chapters[0].scenes[0].id)
  const [expanded, setExpanded] = useState(() => new Set(sampleStory.chapters.map((c) => c.id)))

  const toggleChapter = (chapterId) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }

  const selected = findScene(story, selectedSceneId)
  const sceneCount = story.chapters.reduce((total, ch) => total + ch.scenes.length, 0)

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
          {story.chapters.map((chapter, ci) => {
            const isOpen = expanded.has(chapter.id)
            return (
              <section className="chapter" key={chapter.id}>
                <button className="chapter-header" onClick={() => toggleChapter(chapter.id)}>
                  <span className="chevron">{isOpen ? '▾' : '▸'}</span>
                  <span className="chapter-title">{chapter.title}</span>
                  <span className="chapter-count">{chapter.scenes.length}</span>
                </button>
                {isOpen && (
                  <ul className="scenes">
                    {chapter.scenes.map((scene, si) => (
                      <li key={scene.id}>
                        <button
                          className={
                            'scene-item' + (scene.id === selectedSceneId ? ' selected' : '')
                          }
                          onClick={() => setSelectedSceneId(scene.id)}
                        >
                          <span className="scene-number">
                            {ci + 1}.{si + 1}
                          </span>
                          <span className="scene-item-title">{scene.title}</span>
                        </button>
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
              <div className="editor-path">
                {selected.chapter.title} › {selected.scene.title}
              </div>

              <input
                className="scene-title-input"
                value={selected.scene.title}
                onChange={(e) => updateScene(setStory, selectedSceneId, { title: e.target.value })}
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
                onChange={(e) => updateScene(setStory, selectedSceneId, { text: e.target.value })}
                placeholder="Write your scene prose here…"
              />
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-big">No scene selected</div>
              <div className="empty-hint">Pick a scene from the sidebar to edit it.</div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App