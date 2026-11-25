import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PipecatClient } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';

const VoiceContext = createContext(null);

export function VoiceProvider({ children }) {
  const clientRef = useRef(null);
  const audioRef = useRef(null);
  const pendingMessageRef = useRef(null);
  const botStreamIndexRef = useRef(null);

  const [callState, setCallState] = useState('idle'); // idle | connecting | listening | speaking | ended | error
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [bookingCard, setBookingCard] = useState(null);

  // Dashboard data state (polled every 2s + refreshed on booking/cancel/disconnect)
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({
    total_doctors: 0,
    available_slots: 0,
    booked_appointments: 0,
    cancelled_appointments: 0,
  });
  const [highlightedId, setHighlightedId] = useState(null);
  const prevSnapshotRef = useRef({});

  const fetchDashboardData = useCallback(async () => {
    try {
      const [docRes, aptRes, statRes] = await Promise.all([
        fetch('/api/doctors'),
        fetch('/api/appointments'),
        fetch('/api/stats'),
      ]);
      if (!docRes.ok || !aptRes.ok || !statRes.ok) return;

      const docData = await docRes.json();
      const aptData = await aptRes.json();
      const statData = await statRes.json();

      const nextApts = aptData.appointments || [];
      const prevMap = prevSnapshotRef.current;

      // Detect newly booked or newly cancelled row to briefly highlight it
      if (Object.keys(prevMap).length > 0) {
        const changed = nextApts.find(
          (a) => !prevMap[a.id] || prevMap[a.id] !== a.status
        );
        if (changed) {
          setHighlightedId(changed.id);
          setTimeout(() => setHighlightedId(null), 3200);
        }
      }

      const nextMap = {};
      nextApts.forEach((a) => {
        nextMap[a.id] = a.status;
      });
      prevSnapshotRef.current = nextMap;

      setDoctors(docData.doctors || []);
      setAppointments(nextApts);
      setStats(statData);
    } catch {
      // Backend might not be running yet; ignore transient poll error
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(fetchDashboardData, 2000);
    return () => clearInterval(timer);
  }, [fetchDashboardData]);

  const appendUserMessage = useCallback((text) => {
    if (!text?.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}_${Math.random()}`, role: 'user', text: text.trim() },
    ]);
  }, []);

  const startCall = useCallback(
    async ({ initialMessage = '' } = {}) => {
      if (clientRef.current && ['connecting', 'listening', 'speaking'].includes(callState)) {
        if (initialMessage) {
          appendUserMessage(initialMessage);
          try {
            await clientRef.current.sendText(initialMessage, {
              run_immediately: true,
              audio_response: true,
            });
          } catch {
            // Fallback if not yet ready
          }
        }
        return;
      }

      setErrorMessage('');
      setBookingCard(null);
      botStreamIndexRef.current = null;
      setCallState('connecting');

      if (initialMessage) {
        pendingMessageRef.current = initialMessage;
        setMessages([{ id: `u_${Date.now()}`, role: 'user', text: initialMessage }]);
      } else {
        setMessages([]);
      }

      const transport = new SmallWebRTCTransport({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      const client = new PipecatClient({
        transport,
        enableCam: false,
        enableMic: true,
        callbacks: {
          onConnected: () => {
            setCallState('listening');
          },
          onBotReady: async () => {
            setCallState('listening');
            if (pendingMessageRef.current) {
              const msg = pendingMessageRef.current;
              pendingMessageRef.current = null;
              try {
                await client.sendText(msg, {
                  run_immediately: true,
                  audio_response: true,
                });
              } catch (err) {
                console.warn('sendText on botReady failed:', err);
              }
            }
          },
          onDisconnected: () => {
            setCallState('ended');
            setAudioLevel(0);
            fetchDashboardData();
          },
          onError: (err) => {
            setErrorMessage(err?.data?.message || 'Connection error. Check backend & API keys.');
            setCallState('error');
            setAudioLevel(0);
          },
          onTrackStarted: (track, participant) => {
            if (track.kind === 'audio' && !participant?.local && audioRef.current) {
              audioRef.current.srcObject = new MediaStream([track]);
              audioRef.current.play().catch(() => {});
            }
          },
          onUserStartedSpeaking: () => {
            botStreamIndexRef.current = null;
            setCallState('listening');
          },
          onBotStartedSpeaking: () => {
            setCallState('speaking');
          },
          onBotStoppedSpeaking: () => {
            botStreamIndexRef.current = null;
            setCallState((prev) => (prev === 'speaking' ? 'listening' : prev));
            setAudioLevel(0);
          },
          onLocalAudioLevel: (level) => {
            setAudioLevel((prev) => (callState === 'speaking' ? prev : Math.min(1, level * 2.5)));
          },
          onRemoteAudioLevel: (level) => {
            setAudioLevel(Math.min(1, level * 2.8));
          },
          onUserTranscript: (data) => {
            if (!data?.text?.trim()) return;
            if (data.final) {
              setMessages((prev) => {
                const withoutInterim = prev.filter((m) => !m.interim);
                return [
                  ...withoutInterim,
                  { id: `u_${Date.now()}_${Math.random()}`, role: 'user', text: data.text.trim() },
                ];
              });
            } else {
              setMessages((prev) => {
                const withoutInterim = prev.filter((m) => !m.interim);
                return [
                  ...withoutInterim,
                  { id: 'user_interim', role: 'user', text: data.text.trim(), interim: true },
                ];
              });
            }
          },
          onBotOutput: (data) => {
            if (!data?.text) return;
            setMessages((prev) => {
              const idx = botStreamIndexRef.current;
              if (idx !== null && prev[idx] && prev[idx].role === 'bot') {
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  text: data.text,
                };
                return updated;
              }
              const next = [
                ...prev,
                { id: `b_${Date.now()}_${Math.random()}`, role: 'bot', text: data.text },
              ];
              botStreamIndexRef.current = next.length - 1;
              return next;
            });
          },
          onServerMessage: (data) => {
            if (data?.type === 'appointment_booked' && data.appointment) {
              setBookingCard(data.appointment);
              fetchDashboardData();
            } else if (data?.type === 'appointment_cancelled') {
              fetchDashboardData();
            }
          },
          onLLMFunctionCallStopped: () => {
            fetchDashboardData();
          },
        },
      });

      clientRef.current = client;
      setIsMuted(false);

      try {
        await client.connect({
          webrtcRequestParams: {
            endpoint: '/api/offer',
          },
        });
      } catch (err) {
        setErrorMessage(err?.message || 'Unable to reach voice server on port 7860.');
        setCallState('error');
      }
    },
    [appendUserMessage, callState, fetchDashboardData]
  );

  const endCall = useCallback(async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
      } catch {
        // ignore
      }
      clientRef.current = null;
    }
    setCallState('ended');
    setAudioLevel(0);
    fetchDashboardData();
  }, [fetchDashboardData]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (clientRef.current) {
      clientRef.current.enableMic(!nextMuted);
    }
  }, [isMuted]);

  const sendTypedMessage = useCallback(
    async (text) => {
      const clean = text.trim();
      if (!clean) return;
      appendUserMessage(clean);

      if (!clientRef.current || !['listening', 'speaking'].includes(callState)) {
        await startCall({ initialMessage: clean });
        return;
      }

      try {
        await clientRef.current.sendText(clean, {
          run_immediately: true,
          audio_response: true,
        });
      } catch (err) {
        console.warn('Failed to send text to agent:', err);
      }
    },
    [appendUserMessage, callState, startCall]
  );

  return (
    <VoiceContext.Provider
      value={{
        callState,
        isMuted,
        audioLevel,
        errorMessage,
        messages,
        bookingCard,
        doctors,
        appointments,
        stats,
        highlightedId,
        startCall,
        endCall,
        toggleMute,
        sendTypedMessage,
        fetchDashboardData,
      }}
    >
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  return useContext(VoiceContext);
}
