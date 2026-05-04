import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import AdminDashboard from "./routes/admin/dashboard";
import AdminPlayground from "./routes/admin/playground";
import AdminLogs from "./routes/admin/logs";

function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-400">FaceShare — loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/playground" element={<AdminPlayground />} />
        <Route path="/admin/logs" element={<AdminLogs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
