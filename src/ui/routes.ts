import { useEffect, useState } from 'react';

// ---------------------------------------------------------------- routing
// Hash routes work everywhere the app ships: GitHub Pages, Capacitor, Tauri.
//   #/                                checks list
//   #/check/<checkId>                 check detail
//   #/check/<checkId>/ping/<n>        ping body
//   #/check/<checkId>/icon            choose or upload the check's icon
//   #/settings                        projects, links out to healthchecks.io
//   #/settings/add                    add a project
//   #/settings/project/<projectId>    edit one project (name, API key, ping log days)
//   #/settings/risky                  risky actions (remove keys, reset the app)

export type Route =
  | { name: 'list' }
  | { name: 'check'; checkId: string }
  | { name: 'ping'; checkId: string; pingNumber: number }
  | { name: 'icon'; checkId: string }
  | { name: 'settings' }
  | { name: 'project'; projectId: string }
  | { name: 'addProject' }
  | { name: 'risky' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'check' && parts[1] && parts[2] === 'ping' && parts[3]) {
    return { name: 'ping', checkId: parts[1], pingNumber: Number(parts[3]) };
  }
  if (parts[0] === 'check' && parts[1] && parts[2] === 'icon') return { name: 'icon', checkId: parts[1] };
  if (parts[0] === 'check' && parts[1]) return { name: 'check', checkId: parts[1] };
  if (parts[0] === 'settings' && parts[1] === 'project' && parts[2]) return { name: 'project', projectId: parts[2] };
  if (parts[0] === 'settings' && parts[1] === 'add') return { name: 'addProject' };
  if (parts[0] === 'settings' && parts[1] === 'risky') return { name: 'risky' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'list' };
}

export function href(route: Route): string {
  const encode = encodeURIComponent;
  switch (route.name) {
    case 'list': return '#/';
    case 'check': return `#/check/${encode(route.checkId)}`;
    case 'ping': return `#/check/${encode(route.checkId)}/ping/${route.pingNumber}`;
    case 'icon': return `#/check/${encode(route.checkId)}/icon`;
    case 'settings': return '#/settings';
    case 'project': return `#/settings/project/${encode(route.projectId)}`;
    case 'addProject': return '#/settings/add';
    case 'risky': return '#/settings/risky';
  }
}

export function navigate(route: Route): void {
  location.hash = href(route);
}

/** Go up to `parent` (the back arrow, or after a save) without adding a history entry, so Android's Back doesn't
 *  return to the screen just left: back, if this screen was opened from `parent`; else in place of this screen. */
export function goBackTo(parent: Route): void {
  if (history.state?.openedFrom === href(parent)) history.back();
  else location.replace(href(parent));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    // The entry the app starts on was opened from no screen of the app.
    if (!history.state) history.replaceState({ openedFrom: null }, '');
    const onChange = (event: HashChangeEvent) => {
      // A new entry has no state yet: note the screen it was opened from, for goBackTo.
      if (!history.state) history.replaceState({ openedFrom: href(parseRoute(new URL(event.oldURL).hash)) }, '');
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
