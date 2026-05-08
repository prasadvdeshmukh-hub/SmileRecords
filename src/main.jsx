import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Bell,
  CalendarDays,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Database,
  FilePlus2,
  FileSearch,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  NotebookTabs,
  Pill,
  Plus,
  Printer,
  ReceiptIndianRupee,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SkipForward,
  Stethoscope,
  Trash2,
  Upload,
  UserCheck,
  UserRound,
  Users,
  UserRoundPlus,
  WifiOff
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const DRAFT_KEY = 'smileRecordsAssistantDrafts';

function useApi(path, refreshKey = 0) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: null });
    fetch(`${API_URL}${path}`)
      .then((response) => {
        if (!response.ok) throw new Error(`API ${response.status}`);
        return response.json();
      })
      .then((data) => active && setState({ loading: false, data, error: null }))
      .catch((error) => active && setState({ loading: false, data: null, error }));
    return () => {
      active = false;
    };
  }, [path, refreshKey]);

  return state;
}

async function apiPost(path, body, method = 'POST') {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    let detail = `API ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.error || detail;
    } catch {
      // Keep the fallback status text.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/assistant" element={<MobileShell role="assistant" />}>
          <Route index element={<Navigate to="/assistant/intake" replace />} />
          <Route path="intake" element={<AssistantIntake />} />
          <Route path="patients" element={<AssistantPatients />} />
          <Route path="doctor-done" element={<AssistantDoctorDoneQueue />} />
          <Route path="queue" element={<AssistantClosureQueue />} />
          <Route path="case/:caseId" element={<AssistantCase />} />
        </Route>

        <Route path="/doctor" element={<MobileShell role="doctor" />}>
          <Route index element={<Navigate to="/doctor/queue" replace />} />
          <Route path="queue" element={<DoctorQueue />} />
          <Route path="case/:caseId" element={<DoctorCase />} />
        </Route>

        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<AdminDashboard />} />
          <Route path="patients" element={<AdminListing title="Patients" endpoint="/patients" icon={Users} />} />
          <Route path="cases" element={<AdminListing title="All Cases" endpoint="/cases" icon={ClipboardList} />} />
          <Route path="approvals" element={<AdminListing title="User Authorization" endpoint="/users" icon={UserCheck} />} />
          <Route path="roles" element={<AdminListing title="Role Creation" endpoint="/roles" icon={ShieldCheck} />} />
          <Route path="medicines" element={<AdminListing title="Medicine Master" endpoint="/medicines" icon={Pill} />} />
          <Route path="tests" element={<TestMasterAdmin />} />
          <Route path="templates" element={<AdminListing title="Prescription Forms" endpoint="/templates" icon={NotebookTabs} />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="audit" element={<AdminListing title="Audit Logs" endpoint="/audit" icon={FileSearch} />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Login() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  function handlePrototypeLogin(event) {
    event.preventDefault();
    setIsSignedIn(true);
  }

  return (
    <div className="auth-page login-page">
      <div className={`auth-panel login-panel ${isSignedIn ? 'role-mode' : ''}`}>
        <div className="login-logo-shell">
          <img src="/smile-records-login.png" alt="Smile Records" className="login-logo" />
        </div>

        {!isSignedIn ? (
          <>
            <div className="login-copy">
              <p className="eyebrow">Clinic access</p>
              <h1>Welcome back</h1>
              <p>Sign in to manage appointments, patient records and doctor queues.</p>
            </div>

            <button type="button" className="google-login-button" onClick={() => setIsSignedIn(true)}>
              <span className="google-mark" aria-hidden="true">G</span>
              Continue with Google
            </button>

            <div className="login-divider"><span>or continue with email</span></div>

            <form className="login-form" onSubmit={handlePrototypeLogin}>
              <label>
                <span>Email address</span>
                <input type="email" placeholder="clinic@example.com" autoComplete="email" required />
              </label>
              <label>
                <span>Password</span>
                <input type="password" placeholder="Enter password" autoComplete="current-password" required />
              </label>
              <div className="login-options">
                <label className="remember-row">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>
                <NavLink to="/pending" className="text-link">Forgot?</NavLink>
              </div>
              <button type="submit" className="primary-button login-submit">Login</button>
            </form>
          </>
        ) : (
          <div className="login-role-step">
            <div className="login-copy">
              <p className="eyebrow">Signed in</p>
              <h1>Select workspace</h1>
              <p>Choose the role view for this device.</p>
            </div>
            <div className="role-grid login-role-grid">
              <NavLink to="/assistant/intake" className="role-card">
                <UserRoundPlus size={22} />
                <strong>Assistant Mobile</strong>
                <span>Intake, queue dispatch, billing and uploads</span>
                <ChevronRight size={18} />
              </NavLink>
              <NavLink to="/doctor/queue" className="role-card">
                <Stethoscope size={22} />
                <strong>Doctor Mobile</strong>
                <span>Queue, diagnosis, tests and prescription</span>
                <ChevronRight size={18} />
              </NavLink>
              <NavLink to="/admin" className="role-card">
                <LayoutDashboard size={22} />
                <strong>Admin Web</strong>
                <span>Dashboard, masters, roles and settings</span>
                <ChevronRight size={18} />
              </NavLink>
            </div>
            <button type="button" className="secondary-button login-back" onClick={() => setIsSignedIn(false)}>
              <LogOut size={17} />Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingApproval() {
  return (
    <div className="auth-page">
      <div className="auth-panel compact">
        <LockKeyhole size={38} />
        <h1>Access pending</h1>
        <p>Your clinic admin must approve your account and assign a role before patient data is available.</p>
        <NavLink to="/login" className="secondary-button"><LogOut size={18} />Back to login</NavLink>
      </div>
    </div>
  );
}

function MobileShell({ role }) {
  const isDoctor = role === 'doctor';
  const queuePath = isDoctor ? '/cases?queue=doctor' : '/cases?queue=assistant-closure';
  const { data } = useApi(queuePath);
  const queueCount = data?.cases?.length ?? 0;
  const tabs = isDoctor
    ? [{ to: '/doctor/queue', label: 'Queue', icon: ClipboardList }]
    : [
        { to: '/assistant/intake', label: 'Intake', icon: FilePlus2 },
        { to: '/assistant/patients', label: 'Patients', icon: Search },
        { to: '/assistant/doctor-done', label: 'Doctor Done', icon: ClipboardList },
        { to: '/assistant/queue', label: 'Work', icon: ReceiptIndianRupee }
      ];

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <div className="mobile-brand-line">
          <img src="/smile-records-header.png" alt="Smile Records" className="mobile-header-logo" />
        </div>
        <div className="mobile-header-actions">
          <span className="queue-badge">{queueCount}</span>
          <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
        </div>
      </header>
      <main className="mobile-content">
        {isDoctor && <WorkflowRail role={role} />}
        <Outlet />
      </main>
      {isDoctor ? (
        <nav className="mobile-tabs">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to}>
              <tab.icon size={19} />
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      ) : (
        <AssistantBottomDock />
      )}
    </div>
  );
}

function WorkflowRail({ role }) {
  const steps = role === 'doctor'
    ? ['Review', 'Analysis', 'Prescription', 'Submit']
    : ['Intake', 'Doctor', 'Fees', 'Uploads'];
  return (
    <div className="workflow-rail" aria-label={`${role} workflow`}>
      {steps.map((step, index) => (
        <div className={index === 0 ? 'workflow-step active' : 'workflow-step'} key={step}>
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      ))}
    </div>
  );
}

function AssistantIntake() {
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState(readDrafts);
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState('appointments');
  const [selectedDate, setSelectedDate] = useState('2026-05-08');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data, loading, error } = useApi('/cases', refresh);
  const { data: appointmentData } = useApi('/appointments', refresh);
  const navigate = useNavigate();
  const bookedTimes = useMemo(() => new Set((appointmentData?.appointments || []).map((item) => item.time)), [appointmentData]);
  const [returningPatient, setReturningPatient] = useState(null);

  useEffect(() => {
    const refreshQueue = () => setRefresh((value) => value + 1);
    const openIntake = () => setMode('new');
    const showAppointments = () => setMode('appointments');
    window.addEventListener('smile-records-queue-change', refreshQueue);
    window.addEventListener('smile-records-open-intake', openIntake);
    window.addEventListener('smile-records-show-appointments', showAppointments);
    return () => {
      window.removeEventListener('smile-records-queue-change', refreshQueue);
      window.removeEventListener('smile-records-open-intake', openIntake);
      window.removeEventListener('smile-records-show-appointments', showAppointments);
    };
  }, []);

  const submitPatient = async (event) => {
    event.preventDefault();
    const payload = formToPatient(event.currentTarget);
    try {
      const result = await apiPost('/cases', payload);
      setMessage(`No. ${result.case.queueNumber} submitted to doctor queue.`);
      event.currentTarget.reset();
      setMode('appointments');
      setRefresh((value) => value + 1);
    } catch (error) {
      if (error.status) {
        setMessage(error.message);
      } else {
        saveDraft(payload);
        setDrafts(readDrafts());
        setMessage('Network unavailable. Saved offline draft on this device.');
      }
    }
  };

  const saveOffline = (event) => {
    const form = event.currentTarget.closest('form');
    const payload = formToPatient(form);
    saveDraft(payload);
    setDrafts(readDrafts());
    setMessage('Saved offline draft on this device.');
  };

  const syncDrafts = async () => {
    const queued = readDrafts();
    const remaining = [];
    for (const draft of queued) {
      try {
        await apiPost('/cases', draft);
      } catch {
        remaining.push(draft);
      }
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(remaining));
    setDrafts(remaining);
    setMessage(remaining.length ? 'Some drafts are still offline.' : 'Offline drafts synced to doctor queue.');
  };

  const lookupPatient = async (event) => {
    const mobile = event.target.value.trim();
    if (mobile.length < 5) {
      setReturningPatient(null);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/patients/lookup?mobile=${encodeURIComponent(mobile)}`);
      const payload = await response.json();
      setReturningPatient(payload.patient);
    } catch {
      setReturningPatient(null);
    }
  };

  return (
    <MobilePage
      title={mode === 'new' ? 'New Patient' : 'Appointments'}
      subtitle={mode === 'new' ? 'Add patient details and submit to doctor.' : ''}
      action={mode === 'appointments' ? <DatePickerControl value={selectedDate} onChange={setSelectedDate} /> : null}
    >
      {message && <div className="notice">{message}</div>}
      {mode === 'new' ? (
        <form className="new-patient-sheet" onSubmit={submitPatient}>
          <div className="sheet-header">
            <strong>Patient Details</strong>
            <button type="button" onClick={() => setMode('appointments')}>Close</button>
          </div>
          <Input name="name" label="Name" required />
          <Input name="mobile" label="Mobile" required onBlur={lookupPatient} />
          <Input name="age" label="Age" />
          <Input name="gender" label="Gender" />
          <Input name="address" label="Address" wide />
          <Input name="chiefComplaint" label="Complaint" required />
          <TimeSlotSelect name="appointmentTime" label="Time" bookedTimes={bookedTimes} required />
          <Input name="toothNumber" label="Tooth" />
          <Input name="medicalFlags" label="Flags" placeholder="BP, allergy" />
          {returningPatient && (
            <div className="returning-patient-note">
              <strong>Returning patient</strong>
              <span>Last visit: {returningPatient.lastVisitDate || 'Not available'}</span>
            </div>
          )}
          <input type="hidden" name="consent" value="on" />
          <div className="sheet-actions">
            <button className="primary-button" type="submit"><Send size={16} />Submit</button>
          </div>
        </form>
      ) : (
        <>
          <TodayStatusDashboard selectedDate={selectedDate} activeStatus={statusFilter} onStatusChange={setStatusFilter} />
          <AppointmentCalendar compact selectedDate={selectedDate} statusFilter={statusFilter} role="assistant" />
        </>
      )}
    </MobilePage>
  );
}

function TodayStatusDashboard({ selectedDate, activeStatus, onStatusChange, label = 'Today Status' }) {
  const [refresh, setRefresh] = useState(0);
  const { data, loading } = useApi('/appointments', refresh);
  const appointments = data?.appointments || [];

  useEffect(() => {
    const refreshAppointments = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-appointments-change', refreshAppointments);
    return () => window.removeEventListener('smile-records-appointments-change', refreshAppointments);
  }, []);
  const counts = appointments.reduce((acc, item) => {
    const key = item.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const tiles = [
    { label: 'All', status: 'all', value: appointments.length },
    { label: 'Scheduled', status: 'scheduled', value: counts.scheduled || 0 },
    { label: 'Waiting', status: 'waiting', value: counts.waiting || 0 },
    { label: 'Doctor Queue', status: 'doctor_queue', value: counts.doctor_queue || 0 },
    { label: 'Doctor Done', status: 'doctor_done', value: counts.doctor_done || 0 },
    { label: 'Complete', status: 'complete', value: counts.complete || 0 }
  ];

  return (
    <section className="today-dashboard">
      <header>
        <strong>{label}</strong>
        <span>{loading ? 'Syncing' : `${appointments.length} appointments`}</span>
      </header>
      <div className="today-status-grid">
        {tiles.map((tile) => (
          <button
            className={activeStatus === tile.status ? 'today-status-tile active' : 'today-status-tile'}
            key={tile.label}
            onClick={() => onStatusChange(activeStatus === tile.status ? 'all' : tile.status)}
            type="button"
          >
            <strong>{tile.value}</strong>
            <span>{tile.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AssistantPatients() {
  const { data, loading, error } = useApi('/cases?queue=assistant-intake');
  const cases = data?.cases || [];
  return (
    <MobilePage title="Patients" subtitle="Basic details remain editable until doctor starts the case.">
      <QueueCommandCenter compact />
      <QueueInsight title="Intake Cases" value={cases.length} helper="Submitted to doctor or waiting for review" />
      <SearchBox />
      <QueueList loading={loading} error={error} cases={cases} toPrefix="/assistant/case" empty="No intake records found." />
    </MobilePage>
  );
}

function AssistantClosureQueue() {
  const { data, loading, error } = useApi('/cases?queue=assistant-closure');
  return (
    <MobilePage title="Assistant Work Queue" subtitle="Collect fees, upload X-rays or reports, and close supporting work.">
      <QueueCommandCenter compact />
      <QueueInsight title="Ready for Billing" value={data?.cases?.length || 0} helper="Doctor-submitted cases needing assistant action" />
      <QueueList loading={loading} error={error} cases={data?.cases || []} toPrefix="/assistant/case" empty="No completed doctor cases awaiting assistant work." />
    </MobilePage>
  );
}

function AssistantDoctorDoneQueue() {
  const { data, loading, error } = useApi('/cases?queue=assistant-closure');
  return (
    <MobilePage title="Doctor Done" subtitle="Doctor suggestions, tests and prescriptions ready for billing.">
      <QueueInsight title="Ready for Assistant" value={data?.cases?.length || 0} helper="Open a case to view prescription, bill, upload reports and complete visit." />
      <QueueList loading={loading} error={error} cases={data?.cases || []} toPrefix="/assistant/case" empty="No doctor-done cases waiting." />
    </MobilePage>
  );
}

function AssistantCase() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const { data, loading } = useApi(`/cases/${caseId}`, refresh);
  const item = data?.case;

  const updateBasic = async (event) => {
    event.preventDefault();
    const payload = formToBasic(event.currentTarget);
    await apiPost(`/cases/${caseId}/basic`, payload, 'PATCH');
    setMessage('Patient basic details updated.');
    setRefresh((value) => value + 1);
  };

  const closeAssistantWork = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    await apiPost(`/cases/${caseId}/assistant-close`, payload, 'PATCH');
    setMessage('Fees and uploads saved. Case moved to completed.');
    setRefresh((value) => value + 1);
    setTimeout(() => navigate('/assistant/queue'), 600);
  };

  const markVisitComplete = async () => {
    await apiPost(`/cases/${caseId}/visit-complete`, { actor: 'Assistant' }, 'PATCH');
    setMessage('Visit marked complete.');
    setRefresh((value) => value + 1);
  };

  if (loading || !item) return <MobilePage title="Case"><p className="muted">Loading case...</p></MobilePage>;

  return (
    <MobilePage title={item.patient.name} subtitle={`${item.id} - ${formatStatus(item.status)}`}>
      {message && <div className="notice">{message}</div>}
      <MobileSection title="Assistant Basic Details">
        <form className="mobile-form" onSubmit={updateBasic}>
          <Input name="name" label="Patient name" value={item.patient.name} />
          <Input name="mobile" label="Mobile" value={item.patient.mobile} />
          <div className="inline-fields">
            <Input name="age" label="Age" value={item.patient.age} />
            <Input name="gender" label="Gender" value={item.patient.gender} />
          </div>
          <Input name="city" label="City" value={item.patient.city} />
          <Input name="address" label="Address" value={item.patient.address} />
          <button className="secondary-button" type="submit"><Save size={17} />Update Details</button>
        </form>
      </MobileSection>
      <CaseSummary item={item} />
      <DoctorOutputPanel item={item} />
      <button className="secondary-button print-button" type="button" onClick={() => printPrescription(item)}>
        <Printer size={17} />
        Print Prescription
      </button>
      <MobileSection title="Fees and Uploads">
        <form className="mobile-form" onSubmit={closeAssistantWork}>
          <Input name="feesCollected" label="Fees collected" placeholder="1500" />
          <Input name="xrayUploads" label="X-ray uploads" placeholder="OPG, IOPA" />
          <Input name="medicalReports" label="Medical reports / test reports" />
          <Input name="assistantNotes" label="Assistant notes" />
          <button className="primary-button" type="submit"><ReceiptIndianRupee size={17} />Submit Assistant Work</button>
        </form>
      </MobileSection>
      <button className="complete-visit-button" type="button" onClick={markVisitComplete}>
        <CheckCircle2 size={18} />
        Mark Visit Complete
      </button>
    </MobilePage>
  );
}

function DoctorQueue() {
  const { data, loading, error } = useApi('/cases?queue=doctor');
  const [selectedDate, setSelectedDate] = useState('2026-05-08');
  const [tab, setTab] = useState('my');
  return (
    <MobilePage title="Doctor Queue" subtitle="Appointments sent by assistant for consultation." action={<DatePickerControl value={selectedDate} onChange={setSelectedDate} />}>
      <TodayStatusDashboard selectedDate={selectedDate} activeStatus="doctor_queue" onStatusChange={() => {}} label="Today Status - Live" />
      <div className="doctor-tabs">
        <button className={tab === 'my' ? 'active' : ''} type="button" onClick={() => setTab('my')}>My Queue</button>
        <button className={tab === 'overall' ? 'active' : ''} type="button" onClick={() => setTab('overall')}>Overall Queue</button>
      </div>
      <AppointmentCalendar compact role="doctor" statusFilter={tab === 'my' ? 'doctor_queue' : 'all'} selectedDate={selectedDate} />
    </MobilePage>
  );
}

function DoctorCase() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useApi(`/cases/${caseId}`);
  const item = data?.case;
  const [selectedTests, setSelectedTests] = useState([]);
  const [prescriptionItems, setPrescriptionItems] = useState([]);

  const submitDoctor = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    payload.testsRequested = selectedTests.map((test) => test.name);
    payload.prescriptionItems = prescriptionItems;
    await apiPost(`/cases/${caseId}/doctor-submit`, payload, 'PATCH');
    navigate('/doctor/queue');
  };

  const markComplete = async () => {
    await apiPost(`/cases/${caseId}/visit-complete`, { actor: 'Doctor' }, 'PATCH');
    navigate('/doctor/queue');
  };

  if (loading || !item) return <MobilePage title="Case"><p className="muted">Loading case...</p></MobilePage>;

  return (
    <MobilePage title={item.patient.name} subtitle={`${item.patient.mobile} - ${item.patient.city}`}>
      <CaseSummary item={item} compact />
      <form className="mobile-form" onSubmit={submitDoctor}>
        <MobileSection title="Analysis">
          <Input name="diagnosis" label="Diagnosis / analysis" required />
          <Input name="treatmentPlan" label="Treatment plan" required />
          <Input name="treatmentStatus" label="Treatment status" placeholder="Pending / In progress / Completed" />
          <Input name="doctorNotes" label="Doctor notes" />
        </MobileSection>
        <MobileSection title="Tests and Prescription">
          <TestSelector selectedTests={selectedTests} setSelectedTests={setSelectedTests} />
          <MedicineSelector prescriptionItems={prescriptionItems} setPrescriptionItems={setPrescriptionItems} />
          <Input name="prescriptionForm" label="Prescription form" placeholder="RCT Pain Management" />
          <PrescriptionPreview item={item} selectedTests={selectedTests} prescriptionItems={prescriptionItems} />
          <Input name="nextVisitDate" label="Next visit date" placeholder="2026-05-10" />
        </MobileSection>
        <div className="sticky-actions">
          <button className="secondary-button" type="button" onClick={() => printPrescription({ ...item, doctor: { ...item.doctor, testsRequested: selectedTests.map((test) => test.name), prescriptionItems } })}><Printer size={18} />Print</button>
          <button className="secondary-button" type="button" onClick={markComplete}><CheckCircle2 size={18} />Complete Visit</button>
          <button className="primary-button" type="submit"><CheckCircle2 size={18} />Submit Case</button>
        </div>
      </form>
    </MobilePage>
  );
}

function QueueCommandCenter({ compact }) {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const { data, loading } = useApi('/queue', refresh);
  const queue = data?.queue;
  const nextCase = data?.nextCase;

  const runQueueAction = async (path, success) => {
    try {
      await apiPost(path, {}, 'PATCH');
      setMessage(success);
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section className={compact ? 'queue-command compact' : 'queue-command'}>
      <div className="queue-command-main">
        <div>
          <span>Now serving</span>
          <strong>{loading ? '-' : queue?.nowServing}</strong>
        </div>
        <ChevronRight size={20} />
        <div>
          <span>Next number</span>
          <strong>{loading ? '-' : nextCase?.queueNumber || queue?.nextNumber}</strong>
        </div>
      </div>
      <div className="queue-next-card">
        <div>
          <small>Next patient</small>
          <strong>{nextCase?.patient?.name || 'No waiting patient'}</strong>
          <span>{nextCase?.patient?.chiefComplaint || 'Queue is clear'}</span>
        </div>
        <div className="mini-number">{nextCase?.queueNumber || '-'}</div>
      </div>
      <div className="queue-actions">
        <button className="secondary-button" type="button" onClick={() => runQueueAction('/queue/skip-next', 'Number skipped.')}>
          <SkipForward size={17} />
          Skip
        </button>
        <button className="primary-button" type="button" onClick={() => runQueueAction('/queue/send-next', 'Next patient sent to doctor.')}>
          <Send size={17} />
          Send Next
        </button>
      </div>
      <div className="skipped-line">
        <span>Skipped</span>
        <strong>{data?.skippedNumbers?.length ? data.skippedNumbers.join(', ') : 'None'}</strong>
      </div>
      {message && <p className="queue-message">{message}</p>}
    </section>
  );
}

function AssistantBottomDock() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');

  const run = async (path, success) => {
    try {
      await apiPost(path, {}, 'PATCH');
      setMessage(success);
      window.dispatchEvent(new Event('smile-records-queue-change'));
      setTimeout(() => setMessage(''), 1400);
    } catch (error) {
      setMessage(error.message);
      setTimeout(() => setMessage(''), 1800);
    }
  };

  return (
    <div className="assistant-bottom-dock">
      {message && <span className="dock-toast">{message}</span>}
      <button
        type="button"
        onClick={() => {
          navigate('/assistant/intake');
          setTimeout(() => window.dispatchEvent(new Event('smile-records-show-appointments')), 0);
        }}
      >
        <Home size={18} />
        <span>Home</span>
      </button>
      <button
        type="button"
        onClick={() => {
          navigate('/assistant/intake');
          setTimeout(() => window.dispatchEvent(new Event('smile-records-open-intake')), 0);
        }}
      >
        <UserRoundPlus size={18} />
        <span>New</span>
      </button>
    </div>
  );
}

function CompactPatientRows({ loading, error, cases, onRefresh }) {
  const runCaseAction = async (id, action) => {
    await apiPost(`/cases/${id}/${action}`, {}, 'PATCH');
    onRefresh();
  };

  if (loading) return <p className="muted">Loading patients...</p>;
  if (error) return <p className="error-text">Backend unavailable: {error.message}</p>;
  if (!cases.length) return <p className="muted">No active patients in queue.</p>;

  return (
    <section className="compact-patient-panel">
      <header>
        <strong>Patient Queue</strong>
        <span>one-line clinical handoff</span>
      </header>
      <div className="compact-patient-list">
        {cases
          .slice()
          .sort((a, b) => a.queueNumber - b.queueNumber)
          .map((item) => (
            <div className="patient-row" key={item.id}>
              <div className="row-number">{item.queueNumber}</div>
              <div className="row-main">
                <strong>{item.patient.name}</strong>
                <span>{item.patient.mobile}</span>
              </div>
              <div className="row-detail">
                <strong>{item.patient.chiefComplaint || '-'}</strong>
                <span>T{item.patient.toothNumber || '-'} · {item.patient.medicalFlags?.join('/') || 'No flags'}</span>
              </div>
              <Status value={formatStatus(item.visitStatus || item.status)} />
              <div className="row-actions">
                <button title="Send patient to doctor" onClick={() => runCaseAction(item.id, 'send-to-doctor')}><Send size={14} /></button>
                <button title="Skip patient" onClick={() => runCaseAction(item.id, 'skip')}><SkipForward size={14} /></button>
                <button title="Send earlier" onClick={() => runCaseAction(item.id, 'send-earlier')}><ChevronRight size={14} /></button>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

function AppointmentCalendar({ compact, selectedDate, statusFilter = 'all', role = 'assistant' }) {
  const [refresh, setRefresh] = useState(0);
  const { data, loading } = useApi('/appointments', refresh);
  const [appointments, setAppointments] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (data?.appointments) setAppointments(data.appointments);
  }, [data]);

  const moveAppointment = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex) return;
    setAppointments((current) => {
      const next = current.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const executeAppointmentAction = async (item, action) => {
    const result = await apiPost(`/appointments/${item.id}/${action}`, { actor: role === 'doctor' ? 'Doctor' : 'Assistant' }, 'PATCH');
    setAppointments((current) => current.map((record) => (
      record.id === item.id ? { ...record, status: result.appointment.status } : record
    )));
    setMessage(`No. ${item.queueNumber} updated to ${formatStatus(result.appointment.status)}.`);
    window.dispatchEvent(new Event('smile-records-appointments-change'));
    setRefresh((value) => value + 1);
  };

  const updateAppointment = async (event, item, action, confirmMessage) => {
    event.stopPropagation();
    if (confirmMessage) {
      setConfirmAction({ item, action, message: confirmMessage });
      return;
    }
    await executeAppointmentAction(item, action);
  };

  const visibleAppointments = appointments.filter((item) => statusFilter === 'all' || item.status === statusFilter);

  return (
    <section className={compact ? 'appointment-card compact' : 'appointment-card'}>
      <div className="appointment-list">
        {loading && <p className="muted">Loading appointments...</p>}
        {message && <p className="queue-message">{message}</p>}
        {visibleAppointments.map((item, index) => (
          <div
            className={dragIndex === index ? 'appointment-row dragging' : 'appointment-row'}
            draggable
            key={item.id}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => moveAppointment(dragIndex, index)}
            onDragEnd={() => setDragIndex(null)}
            onClick={() => {
              if (role === 'doctor' && item.caseId) navigate(`/doctor/case/${item.caseId}`);
            }}
          >
            <div className="appointment-number">{index + 1}</div>
            <time>{item.time}</time>
            <div className="appointment-main">
              <div className="appointment-line primary-line">
                <strong className="appointment-name">{item.patientName}</strong>
              </div>
              <div className="appointment-line secondary-line">
                <span>{item.type}</span>
              </div>
            </div>
            <div className="appointment-send-cell">
              <Status value={formatStatus(item.status)} />
              <AppointmentAction item={item} role={role} onAction={updateAppointment} />
            </div>
          </div>
        ))}
      </div>
      {confirmAction && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <strong>Confirm status change</strong>
            <p>{confirmAction.message}</p>
            <div>
              <button type="button" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  await executeAppointmentAction(confirmAction.item, confirmAction.action);
                  setConfirmAction(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AppointmentAction({ item, role, onAction }) {
  if (role === 'doctor') {
    if (item.status === 'doctor_queue' || item.status === 'waiting') {
      return (
        <button className="send-appointment-button" type="button" onClick={(event) => onAction(event, item, 'doctor-done', 'Mark this consultation as Doctor Done?')} draggable={false}>
          Done
        </button>
      );
    }
    if (item.status === 'doctor_done' || item.status === 'complete') {
      return (
        <button className="send-appointment-button muted-action" type="button" onClick={(event) => onAction(event, item, 'recall-to-waiting', 'Move this appointment back to Waiting Queue?')} draggable={false}>
          Not Done
        </button>
      );
    }
  }

  if (item.status === 'doctor_queue') {
    return (
      <button className="send-appointment-button muted-action" type="button" onClick={(event) => onAction(event, item, 'recall-to-waiting', 'Recall this patient from Doctor Queue back to Waiting Queue?')} draggable={false}>
        Recall
      </button>
    );
  }

  if (item.status === 'doctor_done') {
    return (
      <button className="send-appointment-button complete-action" type="button" onClick={(event) => onAction(event, item, 'complete', 'Mark this appointment as Complete?')} draggable={false}>
        Complete
      </button>
    );
  }

  if (item.status === 'complete') {
    return (
      <button className="send-appointment-button muted-action" type="button" onClick={(event) => onAction(event, item, 'recall-to-waiting', 'Move completed appointment back to Waiting Queue?')} draggable={false}>
        Reopen
      </button>
    );
  }

  return (
    <button className="send-appointment-button" type="button" onClick={(event) => onAction(event, item, 'send-to-doctor')} draggable={false}>
      <Send size={10} />
      Send
    </button>
  );
}

function AdminShell() {
  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/cases', label: 'Cases', icon: ClipboardList },
    { to: '/admin/patients', label: 'Patients', icon: Users },
    { to: '/admin/approvals', label: 'Authorization', icon: UserCheck },
    { to: '/admin/roles', label: 'Roles', icon: ShieldCheck },
    { to: '/admin/medicines', label: 'Medicines', icon: Pill },
    { to: '/admin/tests', label: 'X-rays & Tests', icon: FileSearch },
    { to: '/admin/templates', label: 'Prescription Forms', icon: NotebookTabs },
    { to: '/admin/analytics', label: 'Dashboard Data', icon: Gauge },
    { to: '/admin/audit', label: 'Audit Logs', icon: FileSearch },
    { to: '/admin/settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <NavLink to="/admin" className="brand">
          <span className="brand-mark">SR</span>
          <span><strong>SmileRecords</strong><small>Admin web panel</small></span>
        </NavLink>
        <nav>{navItems.map((item) => <NavItem key={item.to} item={item} />)}</nav>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Management and backend data</p><h1>Admin Panel</h1></div>
          <div className="user-chip"><span>AD</span><div><strong>Clinic Admin</strong><small>Super Admin</small></div></div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

function AdminDashboard() {
  const { data, loading } = useApi('/dashboard');
  const metrics = data?.metrics || [];
  return (
    <Page title="Dashboard" eyebrow="Clinic management only">
      <div className="metric-grid">
        {(loading ? Array.from({ length: 8 }) : metrics).map((metric, index) => (
          <article className="metric-card" key={metric?.label || index}>
            <span>{metric?.label || 'Loading'}</span>
            <strong>{metric?.value ?? '-'}</strong>
            <small>{metric?.hint || 'Syncing'}</small>
          </article>
        ))}
      </div>
      <div className="two-column">
        <Panel title="Doctor Queue" icon={Stethoscope}><DataList endpoint="/cases?queue=doctor" /></Panel>
        <Panel title="Assistant Closure Queue" icon={ReceiptIndianRupee}><DataList endpoint="/cases?queue=assistant-closure" /></Panel>
      </div>
    </Page>
  );
}

function AdminListing({ title, endpoint, icon: Icon }) {
  return (
    <Page title={title} eyebrow="Admin web module">
      <Panel title={title} icon={Icon}><DataList endpoint={endpoint} /></Panel>
    </Page>
  );
}

function TestMasterAdmin() {
  const [refresh, setRefresh] = useState(0);
  const { data, loading } = useApi('/tests', refresh);

  const addTest = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    await apiPost('/tests', payload);
    event.currentTarget.reset();
    setRefresh((value) => value + 1);
  };

  const deleteTest = async (id) => {
    await fetch(`${API_URL}/tests/${id}`, { method: 'DELETE' });
    setRefresh((value) => value + 1);
  };

  return (
    <Page title="X-rays & Tests Master" eyebrow="Admin web module">
      <Panel title="Add X-ray / Test" icon={FileSearch}>
        <form className="admin-inline-form" onSubmit={addTest}>
          <Input name="name" label="Name" required />
          <Input name="type" label="Type" placeholder="X-ray / Lab / Imaging" />
          <Input name="description" label="Description" wide />
          <button className="primary-button" type="submit"><Plus size={16} />Add</button>
        </form>
      </Panel>
      <Panel title="Master List" icon={FileSearch}>
        <div className="data-list">
          {loading && <p className="muted">Loading tests...</p>}
          {(data?.tests || []).map((test) => (
            <div className="data-row admin-master-row" key={test.id}>
              <strong>{test.name}</strong>
              <span>{test.type} - {test.description}</span>
              <button type="button" onClick={() => deleteTest(test.id)}><Trash2 size={15} />Delete</button>
            </div>
          ))}
        </div>
      </Panel>
    </Page>
  );
}

function TestSelector({ selectedTests, setSelectedTests }) {
  const { data } = useApi('/tests');
  const addTest = (event) => {
    const test = (data?.tests || []).find((item) => item.id === event.target.value);
    if (test && !selectedTests.some((item) => item.id === test.id)) {
      setSelectedTests([...selectedTests, test]);
    }
    event.target.value = '';
  };

  return (
    <div className="clinical-picker">
      <label className="field">
        <span>X-rays / tests requested</span>
        <select defaultValue="" onChange={addTest}>
          <option value="" disabled>Select from master</option>
          {(data?.tests || []).map((test) => <option key={test.id} value={test.id}>{test.name}</option>)}
        </select>
      </label>
      <SelectionBox items={selectedTests} onRemove={(id) => setSelectedTests(selectedTests.filter((item) => item.id !== id))} empty="Selected X-rays/tests will appear here." />
    </div>
  );
}

function MedicineSelector({ prescriptionItems, setPrescriptionItems }) {
  const { data } = useApi('/medicines');
  const [query, setQuery] = useState('');
  const medicines = (data?.medicines || []).filter((medicine) => {
    const text = `${medicine.name} ${medicine.generic} ${medicine.description}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  const addMedicine = (medicine) => {
    if (!prescriptionItems.some((item) => item.id === medicine.id)) {
      setPrescriptionItems([...prescriptionItems, medicine]);
    }
    setQuery('');
  };

  return (
    <div className="clinical-picker">
      <label className="field">
        <span>Search medicines</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search medicine master" />
      </label>
      {query && (
        <div className="medicine-results">
          {medicines.map((medicine) => (
            <button type="button" key={medicine.id} onClick={() => addMedicine(medicine)}>
              <strong>{medicine.name}</strong>
              <span>{medicine.description}</span>
            </button>
          ))}
        </div>
      )}
      <SelectionBox items={prescriptionItems} onRemove={(id) => setPrescriptionItems(prescriptionItems.filter((item) => item.id !== id))} empty="Selected medicines will build prescription below." />
    </div>
  );
}

function SelectionBox({ items, onRemove, empty }) {
  return (
    <div className="selection-box">
      {!items.length && <p>{empty}</p>}
      {items.map((item) => (
        <span key={item.id}>
          {item.name}
          <button type="button" onClick={() => onRemove(item.id)}>x</button>
        </span>
      ))}
    </div>
  );
}

function PrescriptionPreview({ item, selectedTests, prescriptionItems }) {
  return (
    <div className="prescription-preview">
      <strong>Prescription Preview</strong>
      <p>{item.patient.name} - {item.patient.mobile}</p>
      <ul>
        {prescriptionItems.map((medicine) => <li key={medicine.id}>{medicine.name}: {medicine.description}</li>)}
      </ul>
      {!!selectedTests.length && <p><b>Suggested X-rays/tests:</b> {selectedTests.map((test) => test.name).join(', ')}</p>}
    </div>
  );
}

function printPrescription(item) {
  const tests = item.doctor?.testsRequested || [];
  const medicines = item.doctor?.prescriptionItems?.length
    ? item.doctor.prescriptionItems.map((medicine) => `<li>${medicine.name}: ${medicine.description || ''}</li>`).join('')
    : `<li>${item.doctor?.prescription || 'Prescription not yet added'}</li>`;
  const testText = tests.length ? tests.join(', ') : 'No X-ray/test suggested';
  const html = `
    <html>
      <head>
        <title>SmileRecords Prescription</title>
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; padding: 28px; color: #111827; }
          h1 { color: #0f6cbd; margin-bottom: 4px; }
          .meta { color: #667085; margin-bottom: 22px; }
          section { border-top: 1px solid #dce8f2; padding-top: 14px; margin-top: 14px; }
          li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <h1>SmileRecords</h1>
        <div class="meta">Prescription</div>
        <section>
          <strong>Patient</strong>
          <p>${item.patient.name} - ${item.patient.mobile || ''}</p>
        </section>
        <section>
          <strong>Diagnosis</strong>
          <p>${item.doctor?.diagnosis || '-'}</p>
        </section>
        <section>
          <strong>Medicines</strong>
          <ul>${medicines}</ul>
        </section>
        <section>
          <strong>X-rays / Tests Suggested</strong>
          <p>${testText}</p>
        </section>
        <section>
          <strong>Next Visit</strong>
          <p>${item.doctor?.nextVisitDate || '-'}</p>
        </section>
      </body>
    </html>
  `;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function Analytics() {
  const { data } = useApi('/analytics');
  return (
    <Page title="Dashboard Data" eyebrow="Backend analytics">
      <div className="chart-grid">
        {(data?.charts || []).map((chart) => (
          <article className="chart-card" key={chart.title}>
            <h3>{chart.title}</h3>
            <div className="bar-chart">
              {chart.points.map((point) => <span key={point.label} style={{ height: `${point.value}%` }} title={`${point.label}: ${point.value}`} />)}
            </div>
            <div className="chart-labels">{chart.points.map((point) => <small key={point.label}>{point.label}</small>)}</div>
          </article>
        ))}
      </div>
    </Page>
  );
}

function AdminSettings() {
  return (
    <Page title="Admin Settings" eyebrow="Roles, offline policy, privacy controls">
      <div className="settings-grid">
        <Section title="Offline Data Policy">
          <Check label="Allow assistant mobile offline patient drafts" checked />
          <Check label="Sync drafts only after network returns" checked />
          <Check label="Block offline doctor clinical submission" checked />
        </Section>
        <Section title="Authorization">
          <Check label="Admin approval required before access" checked />
          <Check label="Assistant can edit patient basic details" checked />
          <Check label="Doctor owns clinical analysis and prescription" checked />
          <Check label="Assistant can view prescription after doctor submission" checked />
        </Section>
      </div>
    </Page>
  );
}

function QueueList({ loading, error, cases, toPrefix, empty }) {
  if (loading) return <p className="muted">Loading queue...</p>;
  if (error) return <p className="error-text">Backend unavailable: {error.message}</p>;
  if (!cases.length) return <p className="muted">{empty}</p>;

  return (
    <div className="case-list">
      {cases.map((item) => (
        <NavLink className="case-card" to={`${toPrefix}/${item.id}`} key={item.id}>
          <div>
            <strong>{item.patient.name}</strong>
            <span>{item.patient.mobile} - {item.patient.city || 'No city'}</span>
          </div>
          <div className="case-meta">
            <Status value={formatStatus(item.status)} />
            <small>{item.id}</small>
          </div>
          <p>{item.patient.chiefComplaint || item.doctor?.diagnosis || 'No complaint added'}</p>
        </NavLink>
      ))}
    </div>
  );
}

function QueueInsight({ title, value, helper }) {
  return (
    <div className="queue-insight">
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
      <p>{helper}</p>
    </div>
  );
}

function CaseSummary({ item, compact }) {
  return (
    <div className="summary-card">
      <h3>Case Summary</h3>
      <dl>
        <div><dt>Complaint</dt><dd>{item.patient.chiefComplaint || '-'}</dd></div>
        <div><dt>Pain / Tooth</dt><dd>{item.patient.painLevel || '-'} / {item.patient.toothNumber || '-'}</dd></div>
        <div><dt>Medical flags</dt><dd>{item.patient.medicalFlags?.join(', ') || 'None'}</dd></div>
        {!compact && <div><dt>Prescription</dt><dd>{item.doctor?.prescription || 'Not yet added'}</dd></div>}
        {!compact && <div><dt>Tests</dt><dd>{item.doctor?.testsRequested?.join(', ') || 'Not requested'}</dd></div>}
        {!compact && <div><dt>Next visit</dt><dd>{item.doctor?.nextVisitDate || '-'}</dd></div>}
      </dl>
    </div>
  );
}

function DoctorOutputPanel({ item }) {
  const doctor = item.doctor || {};
  return (
    <div className="doctor-output-panel">
      <header>
        <strong>Doctor Suggestions</strong>
        <Status value={formatStatus(item.visitStatus || item.status)} />
      </header>
      <div className="doctor-output-grid">
        <div><span>Diagnosis</span><strong>{doctor.diagnosis || '-'}</strong></div>
        <div><span>Treatment</span><strong>{doctor.treatmentPlan || '-'}</strong></div>
        <div><span>X-rays / Tests</span><strong>{doctor.testsRequested?.join(', ') || '-'}</strong></div>
        <div><span>Next Visit</span><strong>{doctor.nextVisitDate || '-'}</strong></div>
      </div>
      <div className="doctor-prescription-box">
        <span>Prescription</span>
        {doctor.prescriptionItems?.length ? (
          <ul>{doctor.prescriptionItems.map((medicine) => <li key={medicine.id}>{medicine.name}: {medicine.description}</li>)}</ul>
        ) : (
          <p>{doctor.prescription || 'No prescription added yet.'}</p>
        )}
      </div>
    </div>
  );
}

function MobilePage({ title, subtitle, action, children }) {
  return (
    <section className="mobile-page">
      <div className="mobile-title">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DatePickerControl({ value, onChange }) {
  const date = new Date(`${value}T00:00:00`);
  const label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const dayLabel = date.toLocaleDateString('en-IN', { weekday: 'short' });
  return (
    <label className="date-selector inline-date-picker" aria-label="Select appointment date">
      <span>
        <strong>{isToday(value) ? 'Today' : dayLabel}</strong>
        <small>{label}</small>
      </span>
      <CalendarDays size={17} />
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MobileSection({ title, children }) {
  return <section className="mobile-section"><h3>{title}</h3>{children}</section>;
}

function Page({ title, eyebrow, children }) {
  return (
    <section className="page">
      <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div></div>
      {children}
    </section>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <article className="panel">
      <header><Icon size={18} /><h3>{title}</h3></header>
      {children}
    </article>
  );
}

function DataList({ endpoint }) {
  const { data, loading, error } = useApi(endpoint);
  const items = useMemo(() => {
    if (!data) return [];
    return data.cases || data.patients || data.users || data.roles || data.medicines || data.templates || data.audit || data.reminders || data.prescriptions || data.items || [];
  }, [data]);

  if (loading) return <p className="muted">Loading records...</p>;
  if (error) return <p className="error-text">Backend unavailable: {error.message}</p>;
  if (!items.length) return <p className="muted">No records found.</p>;

  return (
    <div className="data-list">
      {items.map((item, index) => (
        <div className="data-row" key={item.id || index}>
          <strong>{item.patient?.name || item.name || item.title || item.action || item.role || item.id}</strong>
          <span>{item.description || item.email || item.entity || item.status || item.mobile || item.generic || item.permissions?.join(', ') || item.patient?.mobile}</span>
        </div>
      ))}
    </div>
  );
}

function SearchBox() {
  return (
    <div className="filter-bar">
      <Search size={18} />
      <input placeholder="Search by name, mobile, city, or case ID" />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <fieldset className="section">
      <legend>{title}</legend>
      <div className="section-grid">{children}</div>
    </fieldset>
  );
}

function Input({ label, wide, value, name, required, placeholder, onBlur }) {
  const mobileProps = name === 'mobile'
    ? {
        pattern: '^[6-9][0-9]{9}$',
        title: 'Enter a valid 10 digit Indian mobile number starting with 6, 7, 8, or 9',
        inputMode: 'numeric',
        maxLength: 10
      }
    : {};
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}{required && <b className="required-star">*</b>}</span>
      <input name={name} defaultValue={value || ''} required={required} placeholder={placeholder || ''} onBlur={onBlur} {...mobileProps} />
    </label>
  );
}

function TimeSlotSelect({ label, name, bookedTimes, required }) {
  const slots = useMemo(() => buildTimeSlots('09:00', '18:00', 15), []);
  return (
    <label className="field">
      <span>{label}{required && <b className="required-star">*</b>}</span>
      <select name={name} required={required} defaultValue="">
        <option value="" disabled>Select time</option>
        {slots.map((slot) => {
          const booked = bookedTimes.has(slot);
          return (
            <option key={slot} value={slot} disabled={booked}>
              {slot}{booked ? ' - Booked' : ''}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function Check({ label, checked, name, required }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} defaultChecked={checked} required={required} />
      <span>{label}</span>
    </label>
  );
}

function Status({ value }) {
  return <span className={`status ${String(value).toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;
}

function NavItem({ item }) {
  return <NavLink to={item.to} end={item.to === '/admin'} className="nav-item"><item.icon size={18} /><span>{item.label}</span></NavLink>;
}

function formToPatient(form) {
  const data = Object.fromEntries(new FormData(form));
  return {
    appointmentTime: data.appointmentTime || 'Walk-in',
    patient: {
      name: data.name || 'Unnamed Patient',
      mobile: data.mobile || '',
      age: data.age || '',
      gender: data.gender || '',
      city: data.city || '',
      address: data.address || '',
      chiefComplaint: data.chiefComplaint || '',
      painLevel: data.painLevel || '',
      toothNumber: data.toothNumber || '',
      medicalFlags: splitList(data.medicalFlags),
      guardian: data.guardian || '',
      consent: Boolean(data.consent)
    }
  };
}

function formToBasic(form) {
  const data = Object.fromEntries(new FormData(form));
  return {
    patient: {
      name: data.name,
      mobile: data.mobile,
      age: data.age,
      gender: data.gender,
      city: data.city,
      address: data.address
    }
  };
}

function splitList(value = '') {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function buildTimeSlots(start, end, intervalMinutes) {
  const toMinutes = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const toTime = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const slots = [];
  for (let minute = toMinutes(start); minute <= toMinutes(end); minute += intervalMinutes) {
    slots.push(toTime(minute));
  }
  return slots;
}

function isToday(value) {
  return value === new Date().toISOString().slice(0, 10);
}

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveDraft(payload) {
  const drafts = readDrafts();
  drafts.push({ ...payload, offlineId: `offline-${Date.now()}` });
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
}

function formatStatus(status) {
  return String(status || '').split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

createRoot(document.getElementById('root')).render(<App />);
