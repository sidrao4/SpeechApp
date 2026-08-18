// Aligns a rolling buffer of recently-heard words against a window of the
// script using LCS (longest common subsequence) — the same core algorithm
// behind `diff`. Rather than deciding word-by-word whether each new word
// matches exactly the next expected word (brittle: one missed word throws
// the whole thing off), this looks at several recent words together and
// finds where they best line up as a *subsequence* of the script, which
// tolerates a skipped, extra, or misheard word in the middle — the
// surrounding correct words carry the match.

const BACK_SLACK = 2 // let the match resolve slightly behind the cursor
const FORWARD_WINDOW = 14 // how far ahead of the cursor to search
const MIN_MATCH = 2 // minimum aligned words before we trust the result

export function alignRecentSpeech(
  recentSpoken: string[],
  normalized: string[],
  cursor: number,
): number | null {
  const windowStart = Math.max(0, cursor - BACK_SLACK)
  const windowEnd = Math.min(normalized.length, cursor + FORWARD_WINDOW)
  const target = normalized.slice(windowStart, windowEnd)

  const n = recentSpoken.length
  const m = target.length
  if (!n || !m) return null

  // dp[i][j] = LCS length between recentSpoken[0..i) and target[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        recentSpoken[i - 1] === target[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  if (dp[n][m] < MIN_MATCH) return null

  // Backtrack to find the last (furthest-right) matched position in `target`.
  let i = n
  let j = m
  let lastMatchJ = -1
  while (i > 0 && j > 0) {
    if (recentSpoken[i - 1] === target[j - 1]) {
      if (lastMatchJ === -1) lastMatchJ = j - 1
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  if (lastMatchJ === -1) return null
  return windowStart + lastMatchJ + 1 // cursor lands just past the matched word
}
