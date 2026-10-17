/** Shared formatters (React escapes text itself, so no esc() needed). */
export const num = (v) => Number(v ?? 0).toLocaleString('en-US')
export const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
export const initials = (name = '') =>
  String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?'
export const titleCase = (s = '') => String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
export const duration = (ms) => {
  const d = Math.max(0, Math.floor(ms / 86400000))
  if (d >= 1) return `${d}d`
  const h = Math.floor(ms / 3600000)
  if (h >= 1) return `${h}h`
  return `${Math.max(1, Math.floor(ms / 60000))}m`
}
export const OPEN = !!window.ASTRAL_PREVIEW_OPEN
