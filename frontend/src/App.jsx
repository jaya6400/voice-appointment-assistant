import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { VoiceProvider } from './context/VoiceContext';
import ChatPage from './pages/ChatPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  return (
    <VoiceProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </VoiceProvider>
  );
}
