// lines up a buffer of recently heard words against a window of the script
// using LCS (longest common subsequence, same idea as `diff`). matching
// word-by-word against just "the next expected word" is brittle - miss one
// word and the whole thing falls apart. this way a handful of recent words
// get matched as a subsequence of the script, so a skipped/extra/misheard
// word in the middle doesn't derail things, the words around it still carry
// the match
//
// plain LCS isn't quite enough on its own though. a subsequence match
// doesn't care how far apart the matched words are, so early on when there's
// not much context yet and the lookahead window is wide, two common short
// words like "to" and "of" can both show up somewhere in the window by pure
// coincidence and look like a real match. so there's two extra checks:
// matched words have to be reasonably close together (not just present
// somewhere, in order), and bigger jumps need more words backing them up
// than small ones do

const BACK_SLACK = 2 // let the match resolve slightly behind the cursor
const FORWARD_WINDOW = 14 // how far ahead of the cursor to search
const MIN_MATCH = 2 // minimum aligned words before we trust any result
const SPAN_SLACK = 3 // how much wider than the match itself its spread may be

function requiredMatchForJump(distance: number): number {
  if (distance <= 2) return 2
  if (distance <= 9) return 3
  return 4
}

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

  const lcsLength = dp[n][m]
  if (lcsLength < MIN_MATCH) return null

  // walk back through the dp table to find where the match starts/ends
  let i = n
  let j = m
  let firstMatchJ = -1
  let lastMatchJ = -1
  while (i > 0 && j > 0) {
    if (recentSpoken[i - 1] === target[j - 1]) {
      if (lastMatchJ === -1) lastMatchJ = j - 1
      firstMatchJ = j - 1
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  if (lastMatchJ === -1) return null

  // if the matched words are way more spread out than how many actually
  // matched, that's not real contiguous speech, bail
  const span = lastMatchJ - firstMatchJ + 1
  if (span > lcsLength + SPAN_SLACK) return null

  const aligned = windowStart + lastMatchJ + 1
  const distance = aligned - cursor
  if (lcsLength < requiredMatchForJump(distance)) return null

  return aligned
}
