import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import VaultPage from './pages/VaultPage';
import HomePage from './pages/HomePage';
import AnalyticsTokensPage from './pages/AnalyticsTokensPage';
import TokenAnalyticsPage from './pages/TokenAnalyticsPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/analytics/tokens" element={<AnalyticsTokensPage />} />
        <Route path="/analytics/tokens/:tokenAddress" element={<TokenAnalyticsPage />} />
        <Route path="/vault/:address" element={<VaultPage />} />
      </Routes>
    </Layout>
  );
}
