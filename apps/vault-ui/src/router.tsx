import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './routes/Home';
import ViewerLanding from './routes/ViewerLanding';
import Viewer from './routes/Viewer';
import Operator from './routes/Operator';

export default function Router() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/view" element={<ViewerLanding />} />
        <Route path="/view/:vault" element={<Viewer />} />
        <Route path="/operator" element={<Operator />} />
        <Route path="/operator/:vault" element={<Operator />} />
      </Routes>
    </Layout>
  );
}
