// Trusted judge acceptance only; never copied into an agent workspace or image.
export const references = {
  'debug-amount': `export function normalizeAmount(x) {
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (typeof x !== 'string') return null;
    const s = x.trim();
    if (!/^[+-]?(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d+)?$/.test(s)) return null;
    const value=Number(s.replaceAll(',', '')); return Number.isFinite(value)?value:null;
  }`,
  'debug-ranges': `export function mergeRanges(a) {
    const out = [];
    for (const [lo, hi] of a.slice().sort((a,b) => a[0]-b[0])) {
      const last = out.at(-1);
      if (last && lo <= last[1]) last[1] = Math.max(last[1],hi);
      else out.push([lo,hi]);
    }
    return out;
  }`,
  'reuse-config': 'export const resolveConfig = (a,b) => ({...a,...b,flags:{...a.flags,...b.flags}});',
  'reuse-slug': `export const slugify = x => x.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase().replace(/[\\s-]+/g,'-');`,
  'stale-fee': 'export const serviceFee = x => Math.round(x * .08);',
  'stale-date': `export function parseDay(x) {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(x)) return null;
    const d = new Date(x+'T00:00:00.000Z');
    return Number.isFinite(+d) && d.toISOString().slice(0,10) === x ? +d : null;
  }`,
}
