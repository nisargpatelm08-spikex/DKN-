// What's-new feed for the News tab, plus the app version shown in Help.
//
// To announce a future update: add a new object at the TOP of NEWS_ITEMS
// (it must be newer than everything below it). The News tab shows the first
// item big, and the rest under "Earlier releases". The red dot on the News
// tab appears when the newest item hasn't been opened yet.

export const APP_VERSION = '1.1.0'

export const HOME_URL = 'https://nisargmpatel.itch.io/dkn-storyboard-for-novelists'

// localStorage key that remembers which news item the user has already seen.
export const NEWS_SEEN_KEY = 'dkn_news_seen_v1'

export const NEWS_ITEMS = [
  {
    id: 'v1.1.0',
    version: '1.1.0',
    date: 'Oct 2026',
    tag: 'NEW',
    title: 'Wire & scene tools, a calendar Timeline, Help and News',
    bullets: [
      'Press W for wire tools and S for scene tools on the Board and the Timeline — cut, connect, auto sequence, beautify and more.',
      'Shortcut keys W and S are adjustable in ⚙ Settings.',
      'Timeline rebuilt around each scene\u2019s own Year \u00b7 Month \u00b7 Day \u00b7 Time.',
      'See the time gap between scenes and between chapters, a "Not dated yet" strip, and flashback markers.',
      'Board wires always visible, flowing negative \u2192 positive, with a thread bend you can set yourself.',
      'Scene cards snap into place as a story graph, so long wires stay tidy.',
      'A new Help desk in the app plus this News tab, so you always know what\u2019s new.',
      'Translate keeps English names and places intact in Hindi and other languages.'
    ]
  },
  {
    id: 'v1.0.0',
    version: '1.0.0',
    date: '2026',
    tag: '',
    title: 'The first public release',
    bullets: [
      'Write scenes chapter by chapter, add artwork (upload or draw), and translate your writing.',
      'A visual Board with threaded wires, a story Timeline, and a dark theme.',
      'Save, open, automatic backups and PDF export are all built in.'
    ]
  }
]
