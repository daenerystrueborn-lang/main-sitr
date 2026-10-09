/* Thin bridge to Capacitor plugins without a bundler: window.Capacitor.nativePromise(plugin, method, options).
   Every helper in the app goes through call(), and callers always catch, so the app still works in a plain browser. */
const cap = () => window.Capacitor
export const can = () => { try { return !!cap()?.isNativePlatform?.() && typeof cap().nativePromise === 'function' } catch { return false } }
export function call(plugin, method, options = {}) {
  if (!can()) return Promise.reject(new Error('native unavailable'))
  return cap().nativePromise(plugin, method, options)
}
