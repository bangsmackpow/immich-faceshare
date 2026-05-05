import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/shared/toast";
import LoginPage from "./routes/login";
import PeopleDirectory from "./routes/people/index";
import Gallery from "./routes/gallery/index";
import AdminDashboard from "./routes/admin/dashboard";
import AdminPlayground from "./routes/admin/playground";
import AdminLogs from "./routes/admin/logs";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/people" element={<PeopleDirectory />} />
          <Route path="/gallery/:personId" element={<Gallery />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/playground" element={<AdminPlayground />} />
          <Route path="/admin/logs" element={<AdminLogs />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
