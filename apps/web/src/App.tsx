import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/shared/toast";
import LoginPage from "./routes/login";
import PeopleDirectory from "./routes/people/index";
import Gallery from "./routes/gallery/index";
import Downloads from "./routes/downloads";
import AdminDashboard from "./routes/admin/dashboard";
import AdminPlayground from "./routes/admin/playground";
import AdminLogs from "./routes/admin/logs";
import SharePage from "./routes/share";

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/share/:code" element={<SharePage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/people" element={
          <AuthProvider>
            <PeopleDirectory />
          </AuthProvider>
        } />
        <Route path="/gallery/:personId" element={
          <AuthProvider>
            <Gallery />
          </AuthProvider>
        } />
        <Route path="/downloads" element={
          <AuthProvider>
            <Downloads />
          </AuthProvider>
        } />
        <Route path="/admin" element={
          <AuthProvider>
            <AdminDashboard />
          </AuthProvider>
        } />
        <Route path="/admin/playground" element={
          <AuthProvider>
            <AdminPlayground />
          </AuthProvider>
        } />
        <Route path="/admin/logs" element={
          <AuthProvider>
            <AdminLogs />
          </AuthProvider>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ToastProvider>
  );
}
