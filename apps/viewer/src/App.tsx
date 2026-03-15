import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import VaultPage from './pages/VaultPage';
import HomePage from './pages/HomePage';
import OwnerPortfolioPage from './pages/OwnerPortfolioPage';
import OperatorPage from './pages/OperatorPage';
import AnalyticsTokensPage from './pages/AnalyticsTokensPage';
import TokenAnalyticsPage from './pages/TokenAnalyticsPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/owner/portfolio" element={<OwnerPortfolioPage />} />
        <Route path="/operator" element={<OperatorPage />} />
        <Route path="/analytics/tokens" element={<AnalyticsTokensPage />} />
        <Route path="/analytics/tokens/:tokenAddress" element={<TokenAnalyticsPage />} />
        <Route path="/vault/:address" element={<VaultPage />} />
      </Routes>
    </Layout>
  );
}
