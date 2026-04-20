import { FamilyProvider, useFamily } from './family/context'
import FamilyBanner from './family/components/FamilyBanner'
import ProfileManager from './family/components/ProfileManager'
import Loading from './components/Loading'
import './index.css'
import { ErrorBook } from './pages/ErrorBook'
import { FriendLinks } from './pages/FriendLinks'
import MobilePage from './pages/Mobile'
import TypingPage from './pages/Typing'
import { isOpenDarkModeAtom } from '@/store'
import { Analytics } from '@vercel/analytics/react'
import 'animate.css'
import { useAtomValue } from 'jotai'
import { Provider } from 'jotai'
import mixpanel from 'mixpanel-browser'
import process from 'process'
import React, { Suspense, lazy, useEffect, useState } from 'react'
import 'react-app-polyfill/stable'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

const AnalysisPage = lazy(() => import('./pages/Analysis'))
const GalleryPage = lazy(() => import('./pages/Gallery-N'))

if (process.env.NODE_ENV === 'production') {
  // for prod
  mixpanel.init('bdc492847e9340eeebd53cc35f321691')
} else {
  // for dev
  mixpanel.init('5474177127e4767124c123b2d7846e2a', { debug: true })
}

function Root() {
  return (
    <React.StrictMode>
      <FamilyProvider>
        <ScopedApp />
      </FamilyProvider>
      <Analytics />
    </React.StrictMode>
  )
}

function FamilyProtectedPage({ children }: { children: React.ReactNode }) {
  const { activeProfile, isLoading } = useFamily()

  if (isLoading) {
    return <Loading />
  }

  if (!activeProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
        <ProfileManager />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <FamilyBanner />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}

function ThemedRouter() {
  const darkMode = useAtomValue(isOpenDarkModeAtom)
  useEffect(() => {
    darkMode ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark')
  }, [darkMode])

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600)

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = window.innerWidth <= 600
      if (!nextIsMobile) {
        window.location.href = '/'
      }
      setIsMobile(nextIsMobile)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <BrowserRouter basename={REACT_APP_DEPLOY_ENV === 'pages' ? '/qwerty-learner' : ''}>
      <Suspense fallback={<Loading />}>
        <Routes>
          {isMobile ? (
            <Route path="/*" element={<Navigate to="/mobile" />} />
          ) : (
            <>
              <Route
                index
                element={
                  <FamilyProtectedPage>
                    <TypingPage />
                  </FamilyProtectedPage>
                }
              />
              <Route
                path="/gallery"
                element={
                  <FamilyProtectedPage>
                    <GalleryPage />
                  </FamilyProtectedPage>
                }
              />
              <Route
                path="/analysis"
                element={
                  <FamilyProtectedPage>
                    <AnalysisPage />
                  </FamilyProtectedPage>
                }
              />
              <Route
                path="/error-book"
                element={
                  <FamilyProtectedPage>
                    <ErrorBook />
                  </FamilyProtectedPage>
                }
              />
              <Route
                path="/friend-links"
                element={
                  <FamilyProtectedPage>
                    <FriendLinks />
                  </FamilyProtectedPage>
                }
              />
              <Route path="/*" element={<Navigate to="/" />} />
            </>
          )}
          <Route path="/mobile" element={<MobilePage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

function ScopedApp() {
  const { profileStoreKey } = useFamily()

  return (
    <Provider key={profileStoreKey}>
      <ThemedRouter />
    </Provider>
  )
}

const container = document.getElementById('root')

container && createRoot(container).render(<Root />)
