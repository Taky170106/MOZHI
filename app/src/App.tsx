import { useEffect, useState } from 'react'
import Landing from '@/pages/Landing'
import InDevelopment from '@/pages/InDevelopment'

/** Hash routing, so the static build works from any path with no server rules. */
const readRoute = () => window.location.hash.replace(/^#\/?/, '').split('?')[0]

/* The surfaces the navigation lists. Each renders the in-development notice
   until its screen is built — the nav is the product's shape and should not
   shrink while the shape is being filled in. */
const SURFACES = ['counter', 'vocabulary', 'archive', 'settings']

function useHashRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export default function App() {
  const route = useHashRoute()

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {/* The cursor trail belongs to Landing, not the shell. Mounting it here
          would leak it onto every product screen we add. */}
      {SURFACES.includes(route) ? <InDevelopment surface={route} /> : <Landing />}
    </>
  )
}
