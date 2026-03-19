import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import { OperatorSessionProvider, useOperatorSession } from './components/OperatorSessionProvider';
import VaultPage from './pages/VaultPage';
import HomePage from './pages/HomePage';

function GuardedVaultPage() {
  const { address = '' } = useParams<{ address: string }>();
  const { walletSession, ownedVaults, ownedVaultsLoading } = useOperatorSession();

  if (!walletSession) {
    return <Navigate to="/" replace />;
  }

  if (ownedVaultsLoading || ownedVaults == null) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-300">
        Loading operator access...
      </div>
    );
  }

  if (ownedVaults.vaults.length === 0) {
    return <Navigate to="/" replace />;
  }

  const requestedAddress = address.toLowerCase();
  const matchingVault = ownedVaults.vaults.find((entry) => entry.metadata.address.toLowerCase() === requestedAddress);
  if (!matchingVault) {
    return <Navigate to={`/vault/${ownedVaults.vaults[0].metadata.address}`} replace />;
  }

  return <VaultPage />;
}

export default function App() {
  return (
    <OperatorSessionProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/vault/:address" element={<GuardedVaultPage />} />
        </Routes>
      </Layout>
    </OperatorSessionProvider>
  );
}
