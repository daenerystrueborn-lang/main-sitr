/**
 * state.js - the app's shared session/cache store.
 *
 * One object, one module: every screen, the shell and the router import THIS
 * `state`, so a mutation here is visible everywhere immediately (ES module
 * identity guarantees there is only ever one instance).
 */

export const state = {
  me: null,            // serializeSelf payload, or null when signed out
  needsRegistration: false,
  meta: null,
  notes: { items: [], unread: 0 },
  board: 'level',
  // The stacked rows currently drawn in the profile inventory grid, so a slot
  // click can resolve back to its item without a refetch.
  inv: [],
  boardCache: new Map(),
  lbRows: [],
  /** The route currently on screen - set by the router, read when reconnecting. */
  route: null,
  /**
   * The in-flight sign-in/sign-up attempt.
   *
   * `target` is what identifies the account to the API: `{ handle }` when
   * signing in (the browser is never given the real number, only a short-lived
   * handle from /auth/lookup), or a typed phone string when signing up, where
   * there is no username to look up yet.
   */
  otp: { target: null, masked: null, name: null, mode: 'login', registered: false },
}

/** Route bodies already fetched this session - the router's lazy-load cache. */
export const loaded = new Set()

export const isSignedIn = () => !!state.me

/** Drops a route's cache so the next visit refetches. */
export function invalidate(...names) {
  for (const n of names) loaded.delete(n)
}
