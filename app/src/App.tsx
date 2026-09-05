import { Suspense, lazy, useEffect, useState } from 'react'
import Landing from '@/pages/Landing'
import InDevelopment from '@/pages/InDevelopment'
import { isOpen, isSurface } from '@/lib/flags'

/* The product screens pull Three.js, the VRM loader, MediaPipe and
   TensorFlow between them — about a megabyte of JavaScript that the landing
   page has no use for and, imported statically here, used to be parsed
   before its first frame could paint. Split out, the landing page no longer
   waits on any of it, and a screen's code is fetched when someone opens it. */
const Counter = lazy(() => import('@/pages/Counter'))
const Settings = lazy(() => import('@/pages/Settings'))
const Archive = lazy(() => import('@/pages/Archive'))
const Vocabulary = lazy(() => import('@/pages/Vocabulary'))

/* The review bench. Not in the nav: it is a tool for checking the sign data
   against its reference, not a surface a visitor should ever reach. */
const Review = lazy(() => import('@/pages/Review'))

/** Hash routing, so the static build works from any path with no server rules. */
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

  /* A surface the nav lists but that is switched off in flags.ts renders the
     in-development notice. The check is on the route rather than inside each
     page, so a pasted hash cannot reach a half-built screen either. */
  if (route === 'review') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <Review />
      </Suspense>
    )
  }

  const screen = isOpen(route)
    ? route
    : isSurface(route)
      ? 'pending'
      : 'landing'

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      {/* The cursor trail belongs to Landing, not the shell. Mounting it here
          would leak it onto every product screen we add. */}
      {screen === 'landing' ? <Landing />
        : screen === 'pending' ? <InDevelopment surface={route} />
        : (
          /* Black, because every product screen opens on black — a flash of
             page background between the click and the screen would read as a
             fault rather than as loading. */
          <Suspense fallback={<div className="min-h-screen bg-black" />}>
            {screen === 'counter' ? <Counter />
              : screen === 'settings' ? <Settings />
              : screen === 'archive' ? <Archive />
              : <Vocabulary />}
          </Suspense>
        )}
    </>
  )
}
