// Devanagari → Roman transliteration so Hindi translations can be shown in
// "Hinglish" (Hindi typed in Latin script) — the way most Indians type.
// Purely local, deterministic. Not a dictionary: gives an understandable
// romanisation, plus a small exception table for the most common words.

const DEVA_RE = /[\u0900-\u097F]/

const IND_VOWEL = {
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ऋ: 'ri',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
  ऑ: 'o'
}

// vowel signs (matras) including anusvara/visarga/nukta
const VOWEL_SIGN = {
  '\u093E': 'aa',
  '\u093F': 'i',
  '\u0940': 'ee',
  '\u0941': 'u',
  '\u0942': 'oo',
  '\u0943': 'ri',
  '\u0945': 'e',
  '\u0947': 'e',
  '\u0948': 'ai',
  '\u0949': 'o',
  '\u094B': 'o',
  '\u094C': 'au',
  '\u0902': 'n',
  '\u0903': 'h',
  '\u093C': '',
  '\u0952': ''
}

const VIrama = '\u094D' // ्

const CONS = {
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'ng',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'ny',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h'
}

// Exact-word exceptions in the *input* word (whole Devanagari word → Hinglish)
const EXCEPTIONS = {
  में: 'mein',
  मैं: 'main',
  है: 'hai',
  हैं: 'hain',
  हूँ: 'hoon',
  हूं: 'hoon',
  क्या: 'kya',
  नहीं: 'nahi',
  नही: 'nahi',
  अच्छा: 'acha',
  अच्छी: 'achhi',
  अच्छे: 'achhe',
  ठीक: 'theek',
  बहुत: 'bahut',
  और: 'aur',
  लेकिन: 'lekin',
  वह: 'voh',
  वो: 'vo',
  यह: 'yeh',
  ये: 'ye',
  वे: 've',
  घर: 'ghar',
  दोस्त: 'dost',
  दोस्तों: 'doston',
  पार्क: 'park',
  काम: 'kaam',
  नाम: 'naam',
  बात: 'baat',
  आज: 'aaj',
  कल: 'kal',
  आदमी: 'aadmi',
  औरत: 'aurat',
  लड़का: 'ladka',
  लड़की: 'ladki',
  बच्चा: 'bachcha',
  बच्चे: 'bachche',
  भाई: 'bhai',
  बहन: 'behen',
  सुबह: 'subah',
  शाम: 'shaam',
  रात: 'raat',
  दिन: 'din',
  साल: 'saal',
  लोग: 'log',
  लोगों: 'logon',
  पानी: 'paani',
  खाना: 'khana',
  चीज़: 'cheez',
  जगह: 'jagah',
  तरीका: 'tareeka',
  सही: 'sahi',
  गलत: 'galat',
  नया: 'naya',
  नई: 'nayi',
  पुराना: 'purana',
  बड़ा: 'bada',
  बड़ी: 'badi',
  छोटा: 'chhota',
  छोटी: 'chhoti',
  स्कूल: 'school',
  बाजार: 'bazaar',
  वापस: 'wapas',
  अपने: 'apne',
  अपनी: 'apni',
  अपना: 'apna'
}

function polishWord(word) {
  // Hinglish writers drop the drawn-out final "aa" (रहा → raha, था → tha)
  if (word.endsWith('aa') && word.length > 2) return word.slice(0, -1)
  return word
}

function transliterateWord(word) {
  let out = ''
  let i = 0
  const n = word.length
  while (i < n) {
    const c = word[i]
    if (IND_VOWEL[c]) {
      out += IND_VOWEL[c]
      i++
      continue
    }
    if (CONS[c]) {
      out += CONS[c]
      const next = word[i + 1]
      if (next === VIrama) {
        i += 2 // consonant cluster: no vowel, skip the virama
        continue
      }
      if (next && VOWEL_SIGN[next]) {
        out += VOWEL_SIGN[next]
        i += 2
        continue
      }
      // inherent vowel 'a' unless this consonant ends the word
      if (i + 1 < n) out += 'a'
      i++
      continue
    }
    if (VOWEL_SIGN[c]) {
      out += VOWEL_SIGN[c] === 'n' && out.endsWith('n') ? '' : VOWEL_SIGN[c]
      i++
      continue
    }
    out += c // anything else passes through (punctuation, spaces, Latin…)
    i++
  }
  return polishWord(out)
}

export function toRoman(text) {
  if (!text || !DEVA_RE.test(text)) return text
  return text
    .split(/(\s+)/)
    .map((part) => {
      if (!DEVA_RE.test(part)) return part
      const clean = part.replace(/[.,!?;:'"\u0964]+/g, '')
      if (EXCEPTIONS[clean] !== undefined) return EXCEPTIONS[clean] + part.slice(clean.length)
      return transliterateWord(part)
    })
    .join('')
}
