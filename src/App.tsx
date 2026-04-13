/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DataManagement from './pages/DataManagement';
import ChainGraph from './pages/ChainGraph';
import Recognition from './pages/Recognition';
import Transformation from './pages/Transformation';
import IndustryMap from './pages/IndustryMap';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/data/*" element={<DataManagement />} />
        <Route path="/chain" element={<ChainGraph />} />
        <Route path="/recognize" element={<Recognition />} />
        <Route path="/transition" element={<Transformation />} />
        <Route path="/map" element={<IndustryMap />} />
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </Router>
  );
}

