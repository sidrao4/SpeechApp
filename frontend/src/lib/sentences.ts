export interface SentenceRange {
  start: number // inclusive index into the script's word array
  end: number // exclusive
}

// Groups a word array (as produced by splitting the script on whitespace)
// into sentences, breaking after any word that ends in a period — except
// an ellipsis ("...", or a word ending in "..."), which is punctuation
// within a sentence, not three sentence endings.
export function computeSentenceRanges(words: string[]): SentenceRange[] {
  const ranges: SentenceRange[] = []
  let start = 0

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const endsSentence = word.endsWith('.') && !word.endsWith('...')
    if (endsSentence) {
      ranges.push({ start, end: i + 1 })
      start = i + 1
    }
  }

  if (start < words.length) {
    ranges.push({ start, end: words.length })
  }

  return ranges.length ? ranges : [{ start: 0, end: words.length }]
}

// The sentence the cursor is currently inside (or about to start).
export function currentSentenceRange(ranges: SentenceRange[], cursor: number): SentenceRange {
  for (const range of ranges) {
    if (cursor < range.end) return range
  }
  return ranges[ranges.length - 1] ?? { start: 0, end: 0 }
}
