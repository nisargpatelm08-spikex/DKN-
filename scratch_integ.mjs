import { translateText } from './src/renderer/src/lib/translate.js'

// Stub the renderer IPC exactly like src/main/index.js dkn:translate handler.
globalThis.window = {
  api: {
    translate: async ({ q, from, to }) => {
      const url =
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
        encodeURIComponent(from) +
        '&tl=' +
        encodeURIComponent(to) +
        '&dt=t&q=' +
        encodeURIComponent(q)
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      const data = await res.json()
      const text = ((data && data[0]) || []).map((s) => (s && s[0]) || '').join('')
      return {
        text,
        detected: data && data[2] ? data[2] : null,
        detectedScript: data && data[8] && data[8][3] ? data[8][3][0] : null
      }
    }
  }
}

const cases = [
  { name: 'Hinglish -> English', text: 'main park mein walk kar raha tha, but time nahi tha', opts: { to: 'en' } },
  { name: 'English -> Hindi (Devanagari)', text: 'I am going to the market right now.', opts: { to: 'hi' } },
  { name: 'English -> Hindi + keep English (mix)', text: 'I am going to the park with my friends.', opts: { to: 'hi', keepEnglish: true } },
  { name: 'English -> Hindi Roman (Hinglish)', text: 'I am going to the market right now.', opts: { to: 'hi', roman: true } },
  { name: 'Hinglish -> Hindi Roman (pivot)', text: 'kal main apne doston ke saath movie dekhne jaunga', opts: { to: 'hi', roman: true } },
  { name: 'Hindi (Devanagari) -> English', text: 'मैं कल अपने दोस्तों के साथ बाजार जाऊंगा।', opts: { to: 'en' } },
  { name: 'English -> Spanish', text: 'The story is about a brave young girl in a mountain village.', opts: { to: 'es' } },
  { name: 'Long chunk > 3800 chars (Hinglish)', text: (Array(10).fill('main park mein walk kar raha tha, but time nahi tha')).join(' '), opts: { to: 'en' } }
]

for (const c of cases) {
  try {
    const r = await translateText(c.text, c.opts)
    console.log(`--- ${c.name}`)
    console.log(`  IN : ${c.text.slice(0, 90)}${c.text.length > 90 ? '…' : ''}`)
    console.log(`  OUT: ${r.text.slice(0, 200)}${r.text.length > 200 ? '…' : ''}`)
    console.log(`  det: ${r.detected} / ${r.detectedScript}`)
  } catch (e) {
    console.log(`--- ${c.name}\n  ERR: ${e.message}`)
  }
}