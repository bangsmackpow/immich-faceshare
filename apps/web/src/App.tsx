import { Routes, Route, Navigate } from "react-router-dom";

function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-400">FaceShare — loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
