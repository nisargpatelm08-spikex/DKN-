import { useState } from 'react'
import PropTypes from 'prop-types'
import { APP_VERSION, HOME_URL } from '../lib/newsData'

// ---------- help content ----------
//
// Every topic is plain-English beginner copy. A topic is:
//   { id, group, icon, title, intro?, steps?, tips?, go? }
//   intro – one or two sentences saying what this is.
//   steps – numbered "Do this" instructions.
//   tips  – "Good to know" notes.
//   go    – a "{ action }" button that jumps to a view ({ label, view }).

const TOPICS = [
  {
    id: 'welcome',
    group: 'Getting started',
    icon: '🚀',
    title: 'Welcome to DKN',
    intro:
      'DKN is a free storyboarding app for novelists. You write each scene, put a picture with it, then see your whole story on the Board (a big canvas of scene cards) and the Timeline (scenes in story time).',
    steps: [
      'Click "＋ Add chapter" on the left to make a chapter (like "Part One" or "Kings Landing").',
      'Click "＋ Scene" to add scenes inside a chapter — each scene is one moment in your story.',
      'Click a scene to write its title, prose and add a picture.',
      'Switch views at the top: Editor · Board · Timeline. '
    ],
    tips: [
      'Everything you do is saved to your story file automatically — press Ctrl+S any time to save it to disk.',
      'Made a mistake? Press Ctrl+Z to undo.'
    ],
    go: { label: 'Open the Editor', view: 'editor' }
  },
  {
    id: 'files',
    group: 'Getting started',
    icon: '💾',
    title: 'Save, open and recover your story',
    intro:
      'Your story lives in a file called a ".dknproj". DKN also keeps a safe automatic copy while you work, so a crash never eats your work.',
    steps: [
      'Save: press Ctrl+S (or click the 💾 button). The first time, pick where to store the file.',
      'Open: press Ctrl+O (or click the 📂 button) and choose a .dknproj file.',
      'New story: click the ✚ button. DKN asks before letting go of your current story.',
      'Export: click "🖨️ PDF" to make a book-style PDF of the whole story.'
    ],
    tips: [
      'If DKN closes unexpectedly, it opens your last story again on the next start.',
      'The undo button ↶ (top-right) can step back through your last 10 changes.'
    ]
  },
  {
    id: 'write',
    group: 'Editor',
    icon: '✍️',
    title: 'Write a scene',
    intro: 'Each scene is a title, some prose, and an optional picture.',
    steps: [
      'Click a scene in the left list to open it in the Editor.',
      'Type a title in the top box and your prose in the big box below.',
      'Add a new scene with "＋ Scene" in the chapter, reorder scenes with the ↑ ↓ buttons, and rename or delete with the small buttons next to a scene.',
      'The small row under the prose ("When") sets the scene’s date and time — see the Timeline section.'
    ],
    tips: [
      'Scene numbers like "2.3" mean chapter 2, scene 3 — that order is what the Board and Timeline use.'
    ],
    go: { label: 'Open the Editor', view: 'editor' }
  },
  {
    id: 'artwork',
    group: 'Editor',
    icon: '🖼️',
    title: 'Add artwork to a scene',
    intro:
      'Every scene has a picture frame that can hold a photo, a downloaded image, or your own drawing.',
    steps: [
      'Upload: click "⬆ Upload" and pick an image file.',
      'Drop: drag an image from your computer straight onto the empty frame.',
      'Draw: click "✎ Draw" to sketch freehand on the frame and save it.',
      'Remove: click "✕ Remove" above the picture to start over.'
    ],
    tips: [
      'Photos are kept inside the story file, so you can move the file to another computer and the pictures come with it.'
    ]
  },
  {
    id: 'translate',
    group: 'Editor',
    icon: '🌐',
    title: 'Translate your writing',
    intro:
      'Translate one scene or the whole story — great for mixing languages (like Hindi + English).',
    steps: [
      'Open a scene and click "🌐 Translate" in the Editor toolbar.',
      'Pick a language and translate just that scene, or click "Translate whole story".',
      'DKN then asks you to keep English words for names and places — it understands loanwords, so "Radha", "Mumbai" and "kingdom" survive translation.'
    ],
    tips: [
      'Translations need an internet connection. If one language refuses, DKN quietly tries another provider.'
    ]
  },
  {
    id: 'board-basics',
    group: 'Board',
    icon: '🎯',
    title: 'The Board and scene cards',
    intro:
      'The Board is a big open canvas with one card per scene. Cards are placed close to the scenes they belong near — DKN puts new scenes right next to the scene you were just looking at.',
    steps: [
      'Drag the background to pan around the canvas.',
      'Scroll to slide, or Control+scroll to zoom in and out.',
      'Click a card to select it; press Edit (below) to jump to that scene in the Editor.',
      'Right-click a card for a quick menu of things you can do to it.',
      'Drag a card to move it — wires stretch and follow the card.'
    ],
    tips: [
      'The Board remembers the card layout you make and puts it back when you reopen your story.',
      'Run out of room? "▦ Arrange cards by wire flow" in the W menu lays everything out neatly.'
    ],
    go: { label: 'Open the Board', view: 'board' }
  },
  {
    id: 'wires',
    group: 'Board',
    icon: '🧵',
    title: 'Wires: negative → positive',
    intro:
      'Wires are the coloured threads that connect scenes. The rule is simple: a wire leaves the scene it happens after (its right side, the − negative ports) and enters the scene it leads into (its left side, the + positive ports).',
    steps: [
      'Every card has dots on its right (−) and left (+) edges.',
      'To connect scene A → scene B: drag from a − dot on A and drop it onto a ＋ dot on B.',
      'Every wire gets its own dot, so wires never pile up on one port.',
      'Click a wire’s label chip to select it (the wire highlights); press W › Delete, or just press Delete.'
    ],
    tips: [
      'Wire colour follows the link type (storyline, cause-and-effect, theme…).',
      'The little arrows on a wire show which way the story flows.',
      'Turn the "Thread bend" slider down to 0% and wires become perfectly straight; 100% makes them loose and springy.'
    ]
  },
  {
    id: 'wire-tools',
    group: 'Board',
    icon: '〰',
    title: 'Wire tools (press W)',
    intro:
      'This is the knife-and-connections menu: cut a wire, connect scenes in order, insert a scene into a wire, and tidy everything up. Press W (on the Board — and on the Timeline too) to open it. Every item has a number, so press 1–9 to use it instantly.',
    steps: [
      '✂ Cut tool: choose it, then drag a line across any wires — every wire the line crosses is cut. Press Esc or right-click to finish.',
      '⇢ Connect to next scene: wires the selected scene into the next one in story order.',
      '⛓ Auto sequence: wire every scene to the next, across the whole story or just one chapter. Already-wired pairs are left alone.',
      '⤳ Insert a scene into a wire: select a wire, then pick a scene to drop between its two ends (A → C becomes A → B → C).',
      '✕ Delete selected wire / ⊘ Disconnect scene: remove one wire, or all wires touching a scene.',
      '✨ Beautify wires: gives every wire its own tidy port, in order top-to-bottom, and removes duplicate wires and unused ports.',
      '▦ Arrange cards by wire flow: moves the cards so every wire runs left → right, chapters on their own rows.',
      '🗑 Remove all wires: clears the Board (it asks first).'
    ],
    tips: [
      'A "wire in story order" follows your chapter/scene list: 1.1 → 1.2 → 2.1 → 2.2…',
      'Every tool is one undo step — Ctrl+Z puts back whatever it changed.'
    ],
    go: { label: 'Try it on the Board', view: 'board' }
  },
  {
    id: 'scene-tools',
    group: 'Board',
    icon: '▢',
    title: 'Scene tools (press S)',
    intro:
      'Hold your mouse over a scene card and press S to open its scene menu — it works on the card under the mouse, or the selected card.',
    steps: [
      '✎ Edit scene: jump straight to this scene in the Editor.',
      '🖼 Add photo: put a picture on this scene right from the Board.',
      '＋ / − Add port: add extra connection dots on the left or right when a card runs out.',
      '⇢ Connect to next scene / ⊘ Disconnect all wires: wire this card onward, or unplug it.',
      '🏷 Add tag / 📁 Move to chapter: label the scene, or move it to another chapter.',
      '⧉ Duplicate scene: a copy appears right next to it, with fresh ports and no wires.',
      '✕ Delete scene: removes the scene (Ctrl+Z brings it back).'
    ],
    tips: ['The same S menu on the Timeline adds Set date & time and Clear date entries.'],
    go: { label: 'Open the Board', view: 'board' }
  },
  {
    id: 'calendar',
    group: 'Timeline',
    icon: '📅',
    title: 'Your story calendar',
    intro:
      'The Timeline uses a calendar you invent — your own years, months and days. It doesn’t matter what the real-world date is.',
    steps: [
      'Open the Timeline and click "Begin" (or the calendar button) to set up your calendar.',
      'Give your first year a name (like "Year 1" or "313 BC"), then say how many months and how many days per month. Different years can be different lengths.',
      'You can change the calendar later from the Timeline settings.'
    ],
    tips: [
      '100 days a year? 13 months? A fantasy "Tide-Cycle"? All fine — the Timeline counts gaps on your calendar, not the real one.'
    ],
    go: { label: 'Open the Timeline', view: 'timeline' }
  },
  {
    id: 'date-scene',
    group: 'Timeline',
    icon: '🕰',
    title: 'Set a scene’s date & time',
    intro:
      'Every scene can carry a story time: Year · Month · Day · Time (like "Year 1 · 4th month · day 3 · 9:15 pm").',
    steps: [
      'Click a scene card on the Timeline.',
      'In the pop-up choose the year, month, day — and a time of day (hours:minutes) if you like.',
      'The card instantly moves to its place in story time, and wires show the gap to the scenes around it.',
      'Clear a date from the S menu ("Clear date") to move a scene to the "Not dated yet" strip.',
      'You can also set the date from the Editor, in the small "When" row under the prose.'
    ],
    tips: [
      'Scenes without a date hang in the "Not dated yet" area until you date them.',
      'Two scenes at the exact same time sit side by side — order your "same moment" scenes by chapter.'
    ],
    go: { label: 'Open the Timeline', view: 'timeline' }
  },
  {
    id: 'gaps',
    group: 'Timeline',
    icon: '⏳',
    title: 'Time gaps between scenes and chapters',
    intro:
      'Every wire on the Timeline is measured: it shows exactly how much story time passes between its two scenes.',
    steps: [
      'Connect two scenes with a wire, and the gap appears on the wire — like "+2 mo 2 d 14 h".',
      'Click a gap label for the details, and to delete that wire.',
      'The "⏳ Chapters in time" panel shows how much time each whole chapter covers.'
    ],
    tips: [
      'No date or time set on a scene? The gap treats it as the start of that day.',
      'Gaps are "time passes", so a flashback shows as a backwards gap: "⟲ back 1 mo 2 d 6 h".'
    ],
    go: { label: 'Open the Timeline', view: 'timeline' }
  },
  {
    id: 'undated-flash',
    group: 'Timeline',
    icon: '⟲',
    title: 'Not dated yet, and flashbacks',
    intro: 'The Timeline has two special areas for scenes that aren’t in the main flow.',
    steps: [
      '"Not dated yet" strip: every scene without a date waits here, so it’s never lost.',
      'Flashback: give a scene an earlier date than the ones around it, and the wire shows as an orange dashed arc labelled "⟲ back …".',
      'Drag a date earlier on purpose to mark a "meanwhile" or "earlier that day" beat.'
    ],
    tips: ['The orange dashed flashback arc dips below the track so it never hides forward wires.'],
    go: { label: 'Open the Timeline', view: 'timeline' }
  },
  {
    id: 'tl-order',
    group: 'Timeline',
    icon: '⛓',
    title: 'Timeline tools: order, wires, dates',
    intro: 'The Timeline has its own W and S menus — the same keys as the Board.',
    steps: [
      'Press W: ⇢ "Connect to next scene in time" wires a scene to the next dated moment; ⛓ "Auto sequence in time order" chains every dated scene; ✨ "Beautify" replaces all wires with one clean chain by date; ✂ knife cuts wires here too.',
      'Press S over a card: change its date & time, clear the date, connect to the next scene, or delete it.',
      'The "⇢ Connect in time order" button does the whole chain in one click.'
    ],
    tips: [
      'Timeline wires show the time gap (unlike the Board, which isn’t about time).',
      'Undated scenes are never chained by "time order" — they have no time yet.'
    ],
    go: { label: 'Open the Timeline', view: 'timeline' }
  },
  {
    id: 'keys',
    group: 'Shortcut keys & settings',
    icon: '⌨️',
    title: 'Shortcut keys: W, S and how to change them',
    intro:
      'The two big shortcuts are W (wire tools) and S (scene tools). You can change either key in Settings — and everything stays safe while you type.',
    steps: [
      'Press W anywhere for wire tools, or S over a scene for scene tools.',
      'Menu items are numbered — press 1–9 to pick one without clicking. Esc closes a menu.',
      'Change the keys: open ⚙ Settings → Shortcut keys → click the key → press the new one.',
      'Press "Reset keys to W / S" to go back to the defaults.'
    ],
    tips: [
      'Keys never fire while you are typing in a text box — writing the letter "w" is safe.',
      'Control is never part of a menu key, so Ctrl+S still always saves.',
      'The same W and S keys work on both the Board and the Timeline.'
    ]
  },
  {
    id: 'settings',
    group: 'Shortcut keys & settings',
    icon: '⚙',
    title: 'Settings (thread bend & keys)',
    intro:
      '⚙ Settings on the Board and Timeline holds the knobs that change how things look and feel.',
    steps: [
      'Thread bend: 0% makes Board wires perfectly straight; 100% makes them relaxed and curvy (like Blender’s noodle style).',
      'Shortcut keys: change W and S here, on either view.',
      'Both panels save instantly and apply live, so drag the sliders and watch.'
    ]
  },
  {
    id: 'undo',
    group: 'Shortcut keys & settings',
    icon: '↶',
    title: 'Undo almost anything',
    intro:
      'Every change — a drag, a cut, a beautify, a delete — is one undo step you can take back.',
    steps: [
      'Press Ctrl+Z, or click the ↶ button at the top-right.',
      'Keep pressing to step further back (up to 10 steps).'
    ],
    tips: ['A whole drag-gesture counts as one step, so undoing a big tidy-up is still one press.']
  },
  {
    id: 'pdf',
    group: 'Shortcut keys & settings',
    icon: '🖨',
    title: 'Export your story as a PDF',
    intro:
      'Turn the whole story into a clean, book-style PDF with a cover page and one chapter per page break.',
    steps: [
      'Click "🖨️ PDF" in the top bar.',
      'Choose where to save the .pdf file.',
      'The PDF keeps your title, chapter headings, scenes with their pictures and prose.'
    ]
  }
]

const QUICK = [
  { id: 'date-scene', icon: '🕰', label: 'Set a scene’s date & time' },
  { id: 'wire-tools', icon: '〰', label: 'Cut a wire (knife)' },
  { id: 'wire-tools', icon: '⛓', label: 'Auto sequence in order' },
  { id: 'wire-tools', icon: '✨', label: 'Beautify wires' },
  { id: 'wire-tools', icon: '▦', label: 'Arrange cards by flow' },
  { id: 'gaps', icon: '⏳', label: 'See the time gap' },
  { id: 'keys', icon: '⌨️', label: 'Change the W / S keys' },
  { id: 'artwork', icon: '🖼️', label: 'Add a picture' },
  { id: 'translate', icon: '🌐', label: 'Translate writing' },
  { id: 'pdf', icon: '🖨️', label: 'Export to PDF' },
  { id: 'undo', icon: '↶', label: 'Undo a mistake' }
]

function topicText(t) {
  return [t.title, t.intro, t.steps || [], t.tips || []].flat().join(' ').toLowerCase()
}

export default function Help({ onNavigate }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const matching = query ? TOPICS.filter((t) => topicText(t).includes(query)) : TOPICS
  const grouped = []
  const order = []
  for (const t of TOPICS) {
    if (query && !matching.includes(t)) continue
    if (!order.includes(t.group)) order.push(t.group)
    grouped.push(t)
  }

  const jumpTo = (id) => {
    document.getElementById('topic-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="doc-wrap help-view">
      <div className="doc-hero">
        <div className="doc-hero-title">❔ Help desk</div>
        <div className="doc-hero-sub">
          Plain-English answers for everything in DKN {APP_VERSION}. Type below to search, or pick a
          topic.
        </div>
        <input
          className="help-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help…  e.g. “cut a wire”, “set a date”, “save”"
        />
        {!query && (
          <div className="help-chips">
            <span className="help-chips-label">I want to…</span>
            {QUICK.map((c, i) => (
              <button key={i} className="help-chip" onClick={() => jumpTo(c.id)}>
                <span>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {query && (
          <div className="help-results">
            {matching.length
              ? matching.length + ' topic' + (matching.length === 1 ? '' : 's') + ' match'
              : 'No help found — try another word.'}
          </div>
        )}
      </div>

      {query && matching.length === 0 && (
        <div className="help-nothing">
          <div className="help-nothing-big">😕 Nothing found</div>
          <div className="help-nothing-sub">
            Try simpler words like “wire”, “date”, “save”, “draw” or “translate”. If it’s still
            missing, tell me and I’ll add it.
          </div>
        </div>
      )}

      {order.map((group) => (
        <section className="help-group" key={group}>
          <h1 className="help-group-title">{group}</h1>
          {grouped
            .filter((t) => t.group === group)
            .map((t) => (
              <article key={t.id} id={'topic-' + t.id} className="help-topic">
                <h2>
                  <span className="help-topic-icon">{t.icon}</span>
                  {query ? <Mark text={t.title} q={query} /> : t.title}
                </h2>
                {t.intro && (
                  <p className="help-intro">
                    {query ? <Mark text={t.intro} q={query} /> : t.intro}
                  </p>
                )}
                {t.steps && (
                  <ol className="help-steps">
                    {t.steps.map((s, i) => (
                      <li key={i}>{query ? <Mark text={s} q={query} /> : s}</li>
                    ))}
                  </ol>
                )}
                {t.tips && (
                  <div className="help-tips">
                    <b>Good to know</b>
                    <ul>
                      {t.tips.map((s, i) => (
                        <li key={i}>{query ? <Mark text={s} q={query} /> : s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {t.go && (
                  <button className="tonal-btn help-go" onClick={() => onNavigate(t.go.view)}>
                    {t.go.label} →
                  </button>
                )}
              </article>
            ))}
        </section>
      ))}

      <footer className="doc-foot">
        Need more help? Ask on the{' '}
        <a href={HOME_URL} target="_blank" rel="noreferrer">
          DKN homepage
        </a>{' '}
        · DKN {APP_VERSION} · free forever
      </footer>
    </div>
  )
}

// Highlights the search phrase inside text.
function Mark({ text, q }) {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

Mark.propTypes = { text: PropTypes.string.isRequired, q: PropTypes.string.isRequired }

Help.propTypes = { onNavigate: PropTypes.func.isRequired }
