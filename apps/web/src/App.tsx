import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { api } from './lib/api'
import type { SlotMap } from './lib/slots'
import { CocreatePage } from './pages/CocreatePage'
import { CreateInfoPage } from './pages/CreateInfoPage'
import { CreateInterceptPage } from './pages/CreateInterceptPage'
import { CreateSummaryPage } from './pages/CreateSummaryPage'
import { HomePage } from './pages/HomePage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { ThemeOverviewPage } from './pages/ThemeOverviewPage'
import { ThemePlanDocumentPage } from './pages/ThemePlanDocumentPage'
import { ThemePlanPage } from './pages/ThemePlanPage'
import { ThemePracticePage } from './pages/ThemePracticePage'
import { ThemesPage } from './pages/ThemesPage'
import { ThemeWorkPage } from './pages/ThemeWorkPage'

function ShellLayout() {
  const [slots, setSlots] = useState<SlotMap>()
  const location = useLocation()

  useEffect(() => {
    void api.slots().then(setSlots).catch(() => undefined)
  }, [location.pathname])

  return <AppShell slots={slots} />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route index element={<HomePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="create" element={<CreateInfoPage />} />
          <Route path="create/intercept" element={<CreateInterceptPage />} />
          <Route path="create/:themeId/stage" element={<CocreatePage kind="stage" />} />
          <Route path="create/:themeId/resources" element={<CocreatePage kind="resources" />} />
          <Route path="create/:themeId/plan" element={<CocreatePage kind="plan" />} />
          <Route path="themes" element={<ThemesPage />} />
          <Route path="themes/:themeId" element={<ThemeOverviewPage />} />
          <Route path="themes/:themeId/summary" element={<CreateSummaryPage />} />
          <Route path="themes/:themeId/document" element={<ThemePlanDocumentPage />} />
          <Route path="themes/:themeId/work" element={<ThemeWorkPage />} />
          <Route path="themes/:themeId/plan" element={<ThemePlanPage />} />
          <Route path="themes/:themeId/practice" element={<ThemePracticePage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
