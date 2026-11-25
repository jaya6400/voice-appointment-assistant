import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarCheck,
  MessageSquareText,
  Mic,
  MicOff,
  Phone,
  Plus,
  Send,
  X,
} from 'lucide-react';
import { useVoice } from '../context/VoiceContext';

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    callState,
    isMuted,
    audioLevel,
    errorMessage,
    messages,
    bookingCard,
    startCall,
    endCall,
    toggleMute,
    sendTypedMessage,
  } = useVoice();

  const [inputText, setInputText] = useState('');
  const [showTranscript, setShowTranscript] = useState(true);
  const initializedRef = useRef(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const navState = location.state || {};
    if (navState.initialMessage) {
      startCall({ initialMessage: navState.initialMessage });
    } else if (navState.autoStartVoice) {
      startCall();
    }
  }, [location.state, startCall]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, bookingCard]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    await sendTypedMessage(text);
  };

  const isActive = ['connecting', 'listening', 'speaking'].includes(callState);

  const statusLabel = {
    idle: 'Ready to call',
    connecting: 'Connecting…',
    listening: isMuted ? 'Muted' : 'Listening',
    speaking: 'Speaking',
    ended: 'Call ended',
    error: 'Connection error',
  }[callState];

  const orbScale =
    callState === 'speaking'
      ? 1 + Math.max(0.06, audioLevel * 0.28)
      : callState === 'listening'
      ? 1 + audioLevel * 0.14
      : 1;

  return (
    <div className="chat-screen">
      {/* Top bar */}
      <header className="chat-header">
        <button
          className="chat-back-btn"
          onClick={() => navigate('/')}
          title="Back to Dashboard"
        >
          <ArrowLeft size={20} />
          <span>Dashboard</span>
        </button>

        <div className="chat-header-right">
          <button
            className={`chat-toggle-btn ${showTranscript ? 'active' : ''}`}
            onClick={() => setShowTranscript((v) => !v)}
            title="Toggle transcript"
          >
            <MessageSquareText size={18} />
            <span>Transcript</span>
          </button>
        </div>
      </header>

      {/* Center Orb + Status */}
      <main className="chat-main">
        <div className="orb-section">
          <div className="orb-status-pill">
            <span className={`orb-dot ${callState}`} />
            <span>{statusLabel}</span>
          </div>

          <div
            className={`voice-orb ${callState}`}
            style={{ transform: `scale(${orbScale.toFixed(3)})` }}
          >
            <div className="voice-orb-core" />
            <div className="voice-orb-glow" />
          </div>

          {errorMessage && <p className="chat-error">{errorMessage}</p>}

          {!isActive && (
            <button className="start-call-pill" onClick={() => startCall()}>
              <Phone size={16} />
              <span>{callState === 'ended' ? 'Start New Call' : 'Start Voice Call'}</span>
            </button>
          )}
        </div>

        {/* Booking confirmation card */}
        {bookingCard && (
          <div className="booking-confirm-card">
            <div className="booking-confirm-icon">
              <CalendarCheck size={18} />
            </div>
            <div className="booking-confirm-body">
              <div className="booking-confirm-title">Appointment Confirmed</div>
              <div className="booking-confirm-meta">
                {bookingCard.doctor_name} · {bookingCard.date} at {bookingCard.time}
              </div>
              <div className="booking-confirm-phone">Phone: {bookingCard.phone_number}</div>
            </div>
          </div>
        )}

        {/* Live Transcript */}
        {showTranscript && (
          <div className="transcript-panel">
            {messages.length === 0 ? (
              <div className="transcript-empty">
                Speak or type to check availability, book, or cancel an appointment.
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`transcript-row ${m.role === 'user' ? 'user' : 'bot'}`}
                >
                  <div className={`transcript-bubble ${m.interim ? 'interim' : ''}`}>
                    {m.text}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Bottom ChatGPT-style input bar */}
      <footer className="chat-footer">
        <form className="chat-input-bar" onSubmit={handleSend}>
          <button
            type="button"
            className="chat-plus-btn"
            onClick={() => setShowTranscript((v) => !v)}
            title="Toggle transcript"
          >
            <Plus size={18} />
          </button>

          <input
            type="text"
            className="chat-text-input"
            placeholder="Type"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          {inputText.trim() && (
            <button type="submit" className="chat-send-btn" title="Send message">
              <Send size={16} />
            </button>
          )}

          <button
            type="button"
            className={`chat-mic-btn ${isMuted ? 'muted' : ''}`}
            onClick={toggleMute}
            disabled={!isActive}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            type="button"
            className="chat-end-btn"
            onClick={() => (isActive ? endCall() : navigate('/'))}
            title={isActive ? 'End call' : 'Close'}
          >
            <X size={18} />
          </button>
        </form>
      </footer>
    </div>
  );
}
