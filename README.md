# CarePulse — Voice AI Doctor Appointment Assistant

Real-time voice AI receptionist built with **Pipecat** (SmallWebRTC + Silero VAD + ElevenLabs STT/TTS + Google Gemini `gemini-2.5-flash`) and a **React + Vite** dashboard.

## Tech Stack
- **Voice Framework:** Pipecat (`pipecat-ai==1.17.0`) with `SmallWebRTCTransport` & `RTVIProcessor`
- **VAD:** Silero VAD (`SileroVADAnalyzer`)
- **STT & TTS:** ElevenLabs (`ElevenLabsSTTService`, `ElevenLabsTTSService`)
- **LLM:** Google Gemini (`gemini-2.5-flash` via `GoogleLLMService` with function calling)
- **Backend:** FastAPI + Uvicorn + in-memory JSON store (`backend/data.json`)
- **Frontend:** React + Vite + `@pipecat-ai/client-js` + `@pipecat-ai/small-webrtc-transport`

## Setup & Run (5 Commands)

### 1. Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Add ELEVENLABS_API_KEY and GOOGLE_API_KEY
python server.py
```
Backend runs on `http://localhost:7860`.

### 2. Frontend
```bash
cd frontend
npm install && npm run dev
```
Frontend runs on `http://localhost:5173` (proxies `/api/*` to `http://localhost:7860`).

## 3-Minute Demo Video Script
1. **Dashboard Overview (`/`)**: Show the 5 doctors, available slots, stat cards, and existing appointments.
2. **Start Voice Call**: Click the **mic/waveform icon** inside the search bar (or **Start Voice Call**). It navigates to `/chat` and auto-connects.
3. **Check Availability**: Say *"Hi, I'd like to check cardiology availability for tomorrow."* Agent offers 2–3 slots for Dr. Sarah Chen / Dr. Priya Nair.
4. **Book Appointment + Phone Confirmation**: Say *"Book Dr. Sarah Chen at 9:30 AM. My phone number is 9876543210."* Agent reads back the digits *"nine eight seven, six five four, three two one zero"* and asks for *"yes"*. Say *"Yes."*
5. **Live Dashboard Update**: Click the **Back arrow** (call stays active) or end the call. On `/`, the new booking row highlights in the Appointments table and the stat cards update.
6. **Optional Cancel**: Ask the agent *"Actually, cancel my appointment for 9876543210"* -> confirm *"Yes"* -> watch the row update to `cancelled` and the slot return to the doctor's available chips.
