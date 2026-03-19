import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import { LoginPage } from "./views/LoginPage";
import { DashboardPage } from "./views/DashboardPage";
import { WorkspacePage } from "./views/WorkspacePage";

const Protected = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="screen-center">Loading workspace...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
};

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
      <Route
        path="/documents/:documentId"
        element={
          <Protected>
            <WorkspacePage />
          </Protected>
        }
      />
    </Routes>
  );
}
