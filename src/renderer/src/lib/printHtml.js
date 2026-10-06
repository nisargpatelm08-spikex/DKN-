// Builds a self-contained, print-ready HTML document from a DKN story.
// Loaded into a hidden window and printed to PDF by the main process.

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c])

export function buildPrintHtml(story) {
  const chapters = Array.isArray(story.chapters) ? story.chapters : []
  const sceneCount = chapters.reduce((n, c) => n + (Array.isArray(c.scenes) ? c.scenes.length : 0), 0)

  const chaptersHtml = chapters
    .map((chapter, ci) => {
      const scenes = Array.isArray(chapter.scenes) ? chapter.scenes : []
      const scenesHtml = scenes
        .map((scene, si) => {
          const image = scene.image ? `<img class="scene-img" src="${scene.image}" alt="Scene ${ci + 1}.${si + 1} artwork" />` : ''
          const heading = scene.title ? `<h3 class="scene-title">${esc(scene.title)}</h3>` : ''
          const prose = scene.text ? `<p class="prose">${esc(scene.text)}</p>` : ''
          return `<div class="scene">
  <div class="scene-label">Scene ${ci + 1}.${si + 1}</div>
  ${heading}
  ${image}
  ${prose}
</div>`
        })
        .join('\n')
      return `<section class="chapter">
<h2 class="chapter-title">Chapter ${ci + 1} · ${esc(chapter.title)}</h2>
${scenesHtml}
</section>`
    })
    .join('\n')

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(story.title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.55;
    color: #1c1917;
  }
  .cover {
    text-align: center;
    padding: 48px 0 28px;
    margin-bottom: 28px;
    border-bottom: 1px solid #ccc;
  }
  .cover h1 { font-size: 28pt; margin: 0 0 10px; }
  .cover .meta { font-size: 11pt; color: #555; margin: 4px 0; }
  .chapter-title {
    font-size: 18pt;
    margin: 0 0 14px;
    padding-bottom: 6px;
    border-bottom: 2px solid #333;
    break-after: avoid;
    page-break-after: avoid;
  }
  .chapter + .chapter .chapter-title {
    break-before: page;
    page-break-before: always;
  }
  .scene { margin: 0 0 18px; }
  .scene-label {
    font-size: 9pt;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #777;
  }
  .scene-title { font-size: 14pt; margin: 2px 0 6px; break-after: avoid; page-break-after: avoid; }
  .prose { margin: 0; white-space: pre-wrap; }
  .scene-img {
    display: block;
    max-width: 100%;
    max-height: 500px;
    margin: 8px 0;
    border: 1px solid #ccc;
  }
</style>
</head>
<body>
<div class="cover">
  <h1>${esc(story.title)}</h1>
  <p class="meta">${chapters.length} chapters · ${sceneCount} scenes</p>
  <p class="meta">Exported from DKN · ${dateStr}</p>
</div>
${chaptersHtml}
</body>
</html>`
}