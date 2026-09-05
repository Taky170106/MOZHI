import { useEffect, useState } from 'react'
import Landing from '@/pages/Landing'
import InDevelopment from '@/pages/InDevelopment'
const readRoute = () => window.location.hash.replace(/^#\/?/, '').split('?')[0]

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
      {}
      {SURFACES.includes(route) ? <InDevelopment surface={route} /> : <Landing />}
    </>
  )
}
