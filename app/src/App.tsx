import { Suspense, lazy, useEffect, useState } from 'react'
import Landing from '@/pages/Landing'
import InDevelopment from '@/pages/InDevelopment'
import { isOpen, isSurface } from '@/lib/flags'

const Settings = lazy(() => import('@/pages/Settings'))
const Archive = lazy(() => import('@/pages/Archive'))
const Vocabulary = lazy(() => import('@/pages/Vocabulary'))

const readRoute = () => window.location.hash.replace(/^#\/?/, '').split('?')[0]

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

  const screen = isOpen(route) ? route : isSurface(route) ? 'pending' : 'landing'

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {screen === 'landing' ? <Landing />
        : screen === 'pending' ? <InDevelopment surface={route} />
        : (
          <Suspense fallback={<div className="min-h-screen bg-black" />}>
            {screen === 'settings' ? <Settings />
              : screen === 'archive' ? <Archive />
              : <Vocabulary />}
          </Suspense>
        )}
    </>
  )
}
