import { useEffect, useState } from 'react'

// ---------------------------------------------------------------- routing
// Hash routes work everywhere the app ships: GitHub Pages, Capacitor, Tauri.
//   #/                         checks list
//   #/check/<id>               check detail
//   #/check/<id>/ping/<n>      ping body
//   #/check/<id>/icon          choose or upload the check's icon
//   #/settings                 projects, links out to healthchecks.io
//   #/settings/add             add a project
//   #/settings/project/<id>    edit one project (name, API key, server)
//   #/settings/risky           risky actions (remove keys, reset the app)

export type Route =
  | { name: 'list' }
  | { name: 'check'; id: string }
  | { name: 'ping'; id: string; n: number }
  | { name: 'icon'; id: string }
  | { name: 'settings' }
  | { name: 'project'; id: string }
  | { name: 'addProject' }
  | { name: 'risky' }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'check' && parts[1] && parts[2] === 'ping' && parts[3]) {
    return { name: 'ping', id: parts[1], n: Number(parts[3]) }
  }
  if (parts[0] === 'check' && parts[1] && parts[2] === 'icon') return { name: 'icon', id: parts[1] }
  if (parts[0] === 'check' && parts[1]) return { name: 'check', id: parts[1] }
  if (parts[0] === 'settings' && parts[1] === 'project' && parts[2]) return { name: 'project', id: parts[2] }
  if (parts[0] === 'settings' && parts[1] === 'add') return { name: 'addProject' }
  if (parts[0] === 'settings' && parts[1] === 'risky') return { name: 'risky' }
  if (parts[0] === 'settings') return { name: 'settings' }
  return { name: 'list' }
}

export function href(route: Route): string {
  const e = encodeURIComponent
  switch (route.name) {
    case 'list': return '#/'
    case 'check': return `#/check/${e(route.id)}`
    case 'ping': return `#/check/${e(route.id)}/ping/${route.n}`
    case 'icon': return `#/check/${e(route.id)}/icon`
    case 'settings': return '#/settings'
    case 'project': return `#/settings/project/${e(route.id)}`
    case 'addProject': return '#/settings/add'
    case 'risky': return '#/settings/risky'
  }
}

export function navigate(route: Route): void {
  location.hash = href(route)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
