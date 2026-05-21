import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import AnalysisPage from './pages/analysis/AnalysisPage'
import CubesPage from './pages/cubes/CubesPage'
import CubeDetailPage from './pages/cubes/CubeDetailPage'
import CubeEditorPage from './pages/cubes/CubeEditorPage'
import ViewsPage from './pages/views/ViewsPage'
import ViewDetailPage from './pages/views/ViewDetailPage'
import ViewEditorPage from './pages/views/ViewEditorPage'
import MetricsPage from './pages/metrics/MetricsPage'
import MetricDetailPage from './pages/metrics/MetricDetailPage'
import MetricEditorPage from './pages/metrics/MetricEditorPage'
import DisambiguationsPage from './pages/disambiguations/DisambiguationsPage'
import DisambiguationEditorPage from './pages/disambiguations/DisambiguationEditorPage'
import DisambiguationDetailPage from './pages/disambiguations/DisambiguationDetailPage'
import ExperiencesPage from './pages/experiences/ExperiencesPage'
import ExperienceDetailPage from './pages/experiences/ExperienceDetailPage'
import ExperienceEditorPage from './pages/experiences/ExperienceEditorPage'
import OptimizerPage from './pages/optimizer/OptimizerPage'
import AgentsPage from './pages/agents/AgentsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/analysis" replace />} />
          <Route path="analysis" element={<AnalysisPage />} />

          <Route path="cubes" element={<CubesPage />} />
          <Route path="cubes/new" element={<CubeEditorPage />} />
          <Route path="cubes/:cubeId" element={<CubeDetailPage />} />
          <Route path="cubes/:cubeId/edit" element={<CubeEditorPage />} />

          <Route path="views" element={<ViewsPage />} />
          <Route path="views/new" element={<ViewEditorPage />} />
          <Route path="views/:viewId" element={<ViewDetailPage />} />
          <Route path="views/:viewId/edit" element={<ViewEditorPage />} />

          <Route path="metrics" element={<MetricsPage />} />
          <Route path="metrics/new" element={<MetricEditorPage />} />
          <Route path="metrics/:id" element={<MetricDetailPage />} />
          <Route path="metrics/:id/edit" element={<MetricEditorPage />} />

          <Route path="disambiguations" element={<DisambiguationsPage />} />
          <Route path="disambiguations/new" element={<DisambiguationEditorPage />} />
          <Route path="disambiguations/:id" element={<DisambiguationDetailPage />} />
          <Route path="disambiguations/:id/edit" element={<DisambiguationEditorPage />} />

          <Route path="experiences" element={<ExperiencesPage />} />
          <Route path="experiences/new" element={<ExperienceEditorPage />} />
          <Route path="experiences/:id" element={<ExperienceDetailPage />} />
          <Route path="experiences/:id/edit" element={<ExperienceEditorPage />} />

          <Route path="optimizer" element={<OptimizerPage />} />
          <Route path="agents" element={<AgentsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
