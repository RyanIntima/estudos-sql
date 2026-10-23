import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './ui/AppLayout'
import { LessonPage } from './ui/pages/LessonPage'
import { AchievementsPage } from './ui/pages/AchievementsPage'
import { MapPage } from './ui/pages/MapPage'
import { PlaygroundPage } from './ui/pages/PlaygroundPage'
import { ProjectPage } from './ui/pages/ProjectPage'

// HashRouter: funciona em qualquer hospedagem estática, sem configurar redirecionamento.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<MapPage />} />
          <Route path="aula/:lessonId" element={<LessonPage />} />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route path="projeto" element={<ProjectPage />} />
          <Route path="conquistas" element={<AchievementsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
