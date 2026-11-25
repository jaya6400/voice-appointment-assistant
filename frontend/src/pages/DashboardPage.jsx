import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  AudioLines,
  CalendarCheck,
  CalendarDays,
  Home,
  MessageCircle,
  Plus,
  Stethoscope,
  Users,
  XCircle,
  Clock,
} from 'lucide-react';
import { useVoice } from '../context/VoiceContext';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { doctors, appointments, stats, highlightedId, callState } = useVoice();

  const [query, setQuery] = useState('');
  const [activeNav, setActiveNav] = useState('home');

  const appointmentsRef = useRef(null);
  const doctorsRef = useRef(null);

  const isCallActive = ['connecting', 'listening', 'speaking'].includes(callState);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate('/chat', { state: { initialMessage: trimmed } });
  };

  const handleVoiceClick = () => {
    navigate('/chat', { state: { autoStartVoice: true } });
  };

  const scrollToSection = (section, ref) => {
    setActiveNav(section);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="dash-shell">
      <div className="dash-frame">
        {/* Left Indigo Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo" title="CarePulse Clinic">
            <Plus size={22} strokeWidth={2.8} />
          </div>

          <nav className="sidebar-nav">
            <button
              className={`nav-icon-btn ${activeNav === 'home' ? 'active' : ''}`}
              onClick={() => setActiveNav('home')}
              title="Home"
            >
              <Home size={20} />
            </button>

            <button
              className="nav-icon-btn"
              onClick={() => navigate('/chat')}
              title="Voice & Chat Agent"
            >
              <MessageCircle size={20} />
              {isCallActive && <span className="nav-live-dot" />}
            </button>

            <button
              className={`nav-icon-btn ${activeNav === 'appointments' ? 'active' : ''}`}
              onClick={() => scrollToSection('appointments', appointmentsRef)}
              title="Appointments"
            >
              <CalendarDays size={20} />
            </button>

            <button
              className={`nav-icon-btn ${activeNav === 'doctors' ? 'active' : ''}`}
              onClick={() => scrollToSection('doctors', doctorsRef)}
              title="Doctors"
            >
              <Stethoscope size={20} />
            </button>
          </nav>

          <div className="sidebar-bottom">
            <button
              className="nav-icon-btn"
              onClick={handleVoiceClick}
              title="Start Voice Call"
            >
              <AudioLines size={20} />
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="dash-main">
          {/* Top Bar */}
          <div className="dash-topbar">
            <div className="dash-brand">CarePulse Clinic</div>
            {isCallActive ? (
              <button className="live-call-badge" onClick={() => navigate('/chat')}>
                <span className="live-pulse" />
                <span>Call active — Return to Voice</span>
              </button>
            ) : (
              <button className="try-call-btn" onClick={handleVoiceClick}>
                <AudioLines size={16} />
                <span>Start Voice Call</span>
              </button>
            )}
          </div>

          {/* Greeting Banner */}
          <section className="greeting-banner">
            <div className="greeting-text">
              <h1>
                Good Morning, <span className="accent-name">Dr. Smith</span>
              </h1>
              <p>Have a nice day at the clinic</p>
            </div>
            <div className="greeting-art" aria-hidden="true">
              <div className="art-circle art-c1" />
              <div className="art-circle art-c2" />
              <div className="art-badge">
                <Stethoscope size={30} color="#ffffff" />
              </div>
            </div>
          </section>

          {/* ChatGPT-style Search / Voice Bar directly below banner */}
          <form className="hero-search-bar" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Ask anything or book an appointment…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="hero-search-actions">
              <button
                type="submit"
                className={`hero-send-btn ${query.trim() ? 'ready' : ''}`}
                title="Send message"
                disabled={!query.trim()}
              >
                <ArrowUp size={18} />
              </button>
              <button
                type="button"
                className="hero-mic-btn"
                onClick={handleVoiceClick}
                title="Start voice call"
              >
                <AudioLines size={18} />
              </button>
            </div>
          </form>

          {/* Stat Cards */}
          <section className="stats-grid">
            <div className="stat-card primary">
              <div className="stat-icon">
                <Users size={18} />
              </div>
              <div className="stat-label">Total Doctors</div>
              <div className="stat-value">{stats.total_doctors}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon soft-orange">
                <Clock size={18} />
              </div>
              <div className="stat-label">Available Slots</div>
              <div className="stat-value">{stats.available_slots}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon soft-green">
                <CalendarCheck size={18} />
              </div>
              <div className="stat-label">Booked Appointments</div>
              <div className="stat-value">{stats.booked_appointments}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon soft-rose">
                <XCircle size={18} />
              </div>
              <div className="stat-label">Cancelled</div>
              <div className="stat-value">{stats.cancelled_appointments}</div>
            </div>
          </section>

          {/* Two-column lower section: Appointments + Doctors */}
          <section className="content-grid">
            {/* Appointments Table */}
            <div className="panel-card" ref={appointmentsRef}>
              <div className="panel-header">
                <h2>Appointments</h2>
                <span className="panel-count">{appointments.length} total</span>
              </div>

              <div className="table-wrap">
                <table className="apt-table">
                  <thead>
                    <tr>
                      <th>Patient Phone</th>
                      <th>Doctor</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-cell">
                          No appointments yet.
                        </td>
                      </tr>
                    ) : (
                      appointments.map((apt) => (
                        <tr
                          key={apt.id}
                          className={highlightedId === apt.id ? 'row-highlight' : ''}
                        >
                          <td className="phone-cell">{apt.phone_number}</td>
                          <td>
                            <div className="doc-cell-name">{apt.doctor_name}</div>
                            <div className="doc-cell-spec">{apt.speciality}</div>
                          </td>
                          <td>{apt.date}</td>
                          <td>{apt.time}</td>
                          <td>
                            <span className={`status-badge ${apt.status}`}>
                              {apt.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Doctors & Available Slots */}
            <div className="panel-card" ref={doctorsRef}>
              <div className="panel-header">
                <h2>Doctors &amp; Slots</h2>
                <span className="panel-count">{doctors.length} specialists</span>
              </div>

              <div className="doctors-list">
                {doctors.map((doc) => (
                  <div key={doc.id} className="doctor-item">
                    <div className="doctor-top">
                      <div>
                        <div className="doctor-name">{doc.name}</div>
                        <div className="doctor-spec">{doc.speciality}</div>
                      </div>
                      <span className="slot-count-pill">
                        {doc.slots.length} open
                      </span>
                    </div>
                    <div className="slot-chips">
                      {doc.slots.slice(0, 4).map((slot) => (
                        <span key={slot} className="slot-chip">
                          {slot}
                        </span>
                      ))}
                      {doc.slots.length > 4 && (
                        <span className="slot-chip more">
                          +{doc.slots.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
