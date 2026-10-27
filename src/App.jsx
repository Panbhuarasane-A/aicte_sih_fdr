import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { usePortal } from './context/PortalContext.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Verify from './pages/Verify.jsx';
import Documents from './pages/Documents.jsx';
import Assistant from './pages/Assistant.jsx';
import Calculator from './pages/Calculator.jsx';
import Audit from './pages/Audit.jsx';
import MaturityTracker from './pages/MaturityTracker.jsx';
import ReleaseRequests from './pages/ReleaseRequests.jsx';
import NotificationCenter from './pages/NotificationCenter.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import OfficerPreview from './pages/OfficerPreview.jsx';
import InstitutionPreview from './pages/InstitutionPreview.jsx';
import InstitutionSettings from './pages/InstitutionSettings.jsx';
import InstitutionAnnouncements from './pages/InstitutionAnnouncements.jsx';

function ProtectedLayout() {
  const { user } = usePortal();
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/officer-preview" element={<OfficerPreview />} />
      <Route path="/institution-preview" element={<InstitutionPreview />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="verify" element={<Verify />} />
        <Route path="documents" element={<Documents />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="calculator" element={<Calculator />} />
        <Route path="audit" element={<Audit />} />
        <Route path="maturities" element={<MaturityTracker />} />
        <Route path="release-requests" element={<ReleaseRequests />} />
        <Route path="notifications" element={<NotificationCenter />} />
        <Route path="announcements" element={<InstitutionAnnouncements />} />
        <Route path="institution-announcements" element={<InstitutionAnnouncements />} />
        <Route path="settings" element={<InstitutionSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
