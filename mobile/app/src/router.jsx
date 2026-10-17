/** Hash router: location.hash = '#/dungeon/run' -> path 'dungeon/run'. */
import React, { useEffect, useState, useCallback } from 'react'

const clean = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'home')

export function useRoute() {
  const [path, setPath] = useState(clean)
  useEffect(() => {
    const on = () => setPath(clean())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return path
}

export function go(path) {
  window.location.hash = '#/' + path
}

export function Link({ to, children, className, style }) {
  const onClick = useCallback((e) => {
    if (e.metaKey || e.ctrlKey) return
    e.preventDefault()
    go(to)
  }, [to])
  return (
    <a className={className} style={style} href={'#/' + to} onClick={onClick}>
      {children}
    </a>
  )
}
