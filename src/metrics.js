/** Lowercase, drop punctuation, optionally strip diacritics, split into words. */
export function tokenize(text, { stripDiacritics = false } = {}) {
  let t = String(text ?? '').normalize('NFC').toLowerCase();
  t = t.replace(/[^\p{L}\p{N}\s]+/gu, ' ');
  if (stripDiacritics) t = t.normalize('NFD').replace(/\p{M}/gu, '');
  return t.split(/\s+/).filter(Boolean);
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** { wer, cer, werNoDiacritics } as fractions, or null without a reference. */
export function score(reference, hypothesis) {
  const ref = tokenize(reference);
  if (!ref.length) return null;
  const hyp = tokenize(hypothesis);
  const refChars = [...ref.join(' ')];
  const hypChars = [...hyp.join(' ')];
  const refPlain = tokenize(reference, { stripDiacritics: true });
  const hypPlain = tokenize(hypothesis, { stripDiacritics: true });
  return {
    wer: editDistance(ref, hyp) / ref.length,
    cer: editDistance(refChars, hypChars) / refChars.length,
    werNoDiacritics: editDistance(refPlain, hypPlain) / refPlain.length,
  };
}

/** Word alignment: [{ type: 'eq' | 'sub' | 'ins' | 'del', word, expected? }]. */
export function diffWords(reference, hypothesis) {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  const n = ref.length;
  const m = hyp.length;
  const d = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array(m + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
  }

  const out = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      out.push(ref[i - 1] === hyp[j - 1]
        ? { type: 'eq', word: hyp[j - 1] }
        : { type: 'sub', word: hyp[j - 1], expected: ref[i - 1] });
      i--; j--;
    } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
      out.push({ type: 'ins', word: hyp[j - 1] });
      j--;
    } else {
      out.push({ type: 'del', word: ref[i - 1] });
      i--;
    }
  }
  return out.reverse();
}
