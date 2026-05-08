import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ToastContainer, ConfirmProvider } from './components/AlertSystem';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import BoardView from './pages/BoardView';
import BoardNotifications from './pages/BoardNotifications';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Archived from './pages/Archived';
import AdminLogs from './pages/AdminLogs';
import WidgetView from './pages/WidgetView';
import Support from './pages/Support';
import PublicBoard from './pages/PublicBoard';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <ConfirmProvider>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/share/:token" element={<PublicBoard />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="boards/:boardId/notifications" element={<BoardNotifications />} />
          <Route path="boards/:boardId" element={<BoardView />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
          <Route path="archived" element={<Archived />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="widgets/:widgetId" element={<WidgetView />} />
          <Route path="support" element={<Support />} />
        </Route>
      </Routes>
    </ConfirmProvider>
  );
}
