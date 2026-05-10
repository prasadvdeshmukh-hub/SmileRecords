import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Bell,
  CalendarDays,
  CalendarCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Database,
  FilePlus2,
  FileSearch,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
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
  WifiOff,
  X
} from 'lucide-react';
import './styles.css';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const DRAFT_KEY = 'smileRecordsAssistantDrafts';
const SESSION_KEY = 'smileRecordsCurrentUser';
const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const TREATMENT_STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed', 'Follow-up Required', 'Referred'];
const DOCTOR_TEXT_LIMIT = 300;
const DOSE_PATTERNS = ['1 - X - X', 'X - 1 - X', 'X - X - 1', '1 - 1 - X', '1 - X - 1', 'X - 1 - 1', '1 - 1 - 1'];

const PROFILE_COPY = {
  assistant: { name: 'Assistant', home: '/assistant/intake', greeting: 'Ready for intake and dispatch' },
  doctor: { name: 'Doctor', home: '/doctor/queue', greeting: 'Your clinical queue is live' },
  admin: { name: 'Admin', home: '/admin', greeting: 'Management dashboard is ready' }
};

function isSubscriptionUsable(user) {
  if (user?.role !== 'Doctor') return true;
  const subscription = user?.subscription;
  if (!subscription) return false;
  const now = Date.now();
  const paidUntil = Date.parse(subscription.paidUntil || '');
  const trialEndsAt = Date.parse(subscription.trialEndsAt || '');
  return (Number.isFinite(paidUntil) && paidUntil >= now) || (Number.isFinite(trialEndsAt) && trialEndsAt >= now);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function displayUserName(user, fallback = 'User') {
  const name = String(user?.name || '').trim();
  if (name) return name;
  const emailName = String(user?.email || '').split('@')[0].trim();
  return emailName || fallback;
}

function userInitials(user) {
  return displayUserName(user, 'User')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function storeCurrentUser(user) {
  if (!user) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event('smile-records-user-change'));
}

function useSyncedCurrentUser() {
  const [user, setUser] = useState(getStoredUser());

  useEffect(() => {
    let active = true;
    const syncFromStorage = () => setUser(getStoredUser());
    const refreshFromServer = async () => {
      const stored = getStoredUser();
      if (!stored?.email) {
        if (active) setUser(stored);
        return;
      }
      try {
        const response = await fetch(apiUrl(`/users/me?email=${encodeURIComponent(stored.email)}`), { headers: apiHeaders() });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const payload = await response.json();
        if (active && payload.user) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(payload.user));
          setUser(payload.user);
        }
      } catch {
        if (active) setUser(stored);
      }
    };

    window.addEventListener('smile-records-user-change', syncFromStorage);
    window.addEventListener('smile-records-refresh', refreshFromServer);
    refreshFromServer();
    return () => {
      active = false;
      window.removeEventListener('smile-records-user-change', syncFromStorage);
      window.removeEventListener('smile-records-refresh', refreshFromServer);
    };
  }, []);

  return [user, setUser];
}

function roleHome(role = '') {
  if (role === 'Doctor') return '/doctor/queue';
  if (role === 'Assistant') return '/assistant/intake';
  if (role === 'Super Admin') return '/admin';
  return '/pending';
}

function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function broadcastClinicRefresh() {
  window.dispatchEvent(new Event('smile-records-refresh'));
  window.dispatchEvent(new Event('smile-records-appointments-change'));
  window.dispatchEvent(new Event('smile-records-queue-change'));
  window.dispatchEvent(new Event('smile-records-fees-change'));
}

function focusPageTop(behavior = 'auto') {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior });
    document.querySelector('.mobile-content')?.scrollTo?.({ top: 0, left: 0, behavior });
    document.querySelector('.mobile-page')?.scrollIntoView?.({ block: 'start', behavior });
  });
}

function apiHeaders(extra = {}) {
  const user = getStoredUser();
  return {
    ...(user?.email ? { 'X-User-Email': user.email } : {}),
    ...extra
  };
}

function useApi(path, refreshKey = 0) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: null });
    fetch(apiUrl(path), { headers: apiHeaders() })
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
  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
  } catch {
    const error = new Error('Network unavailable. Check that the backend API is running.');
    error.isNetworkError = true;
    throw error;
  }
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
  const data = await response.json();
  if (data?.user) {
    const stored = getStoredUser();
    if (stored?.email && data.user.email && stored.email.toLowerCase() === data.user.email.toLowerCase()) {
      storeCurrentUser(data.user);
    }
  }
  if (typeof window !== 'undefined') {
    window.setTimeout(() => focusPageTop('smooth'), 0);
  }
  return data;
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load Razorpay Checkout. Check network connection.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout. Check network connection.'));
    document.body.appendChild(script);
  });
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/subscription" element={<RequireSession><SubscriptionGate /></RequireSession>} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/assistant" element={<RequireAuth allowedRoles={['Assistant']}><MobileShell role="assistant" /></RequireAuth>}>
          <Route index element={<Navigate to="/assistant/intake" replace />} />
          <Route path="intake" element={<AssistantIntake />} />
          <Route path="patients" element={<AssistantPatients />} />
          <Route path="doctor-done" element={<AssistantDoctorDoneQueue />} />
          <Route path="queue" element={<AssistantClosureQueue />} />
          <Route path="fees" element={<AssistantFeesQueue />} />
          <Route path="reconciliation" element={<AssistantFeesReconciliation />} />
          <Route path="dashboard" element={<MobileAnalytics role="assistant" />} />
          <Route path="analytics" element={<MobileAnalytics role="assistant" />} />
          <Route path="case/:caseId" element={<AssistantCase />} />
        </Route>

        <Route path="/doctor" element={<RequireAuth allowedRoles={['Doctor']}><MobileShell role="doctor" /></RequireAuth>}>
          <Route index element={<Navigate to="/doctor/queue" replace />} />
          <Route path="queue" element={<DoctorQueue />} />
          <Route path="fees" element={<DoctorFeesQueue />} />
          <Route path="assistants" element={<DoctorAssistantMapping />} />
          <Route path="reconciliation" element={<DoctorFeesReconciliation />} />
          <Route path="dashboard" element={<MobileAnalytics role="doctor" />} />
          <Route path="analytics" element={<MobileAnalytics role="doctor" />} />
          <Route path="case/:caseId" element={<DoctorCase />} />
        </Route>

        <Route path="/admin" element={<RequireAuth allowedRoles={['Super Admin']}><AdminShell /></RequireAuth>}>
          <Route index element={<AdminDashboard />} />
          <Route path="patients" element={<AdminPatients />} />
          <Route path="patients/:patientId" element={<AdminPatientDetails />} />
          <Route path="cases" element={<AdminListing title="All Cases" endpoint="/cases" icon={ClipboardList} />} />
          <Route path="approvals" element={<AdminApprovals />} />
          <Route path="hospitals" element={<HospitalMasterAdmin />} />
          <Route path="doctor-assistant-mappings" element={<DoctorAssistantMappingAdmin />} />
          <Route path="roles" element={<AdminListing title="Role Creation" endpoint="/roles" icon={ShieldCheck} />} />
          <Route path="medicines" element={<MedicineMasterAdmin />} />
          <Route path="tests" element={<TestMasterAdmin />} />
          <Route path="templates" element={<AdminListing title="Prescription Forms" endpoint="/templates" icon={NotebookTabs} />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="subscriptions" element={<SubscriptionAdminDashboard />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    focusPageTop();
  }, [location.pathname, location.search]);
  return null;
}

function RequireAuth({ allowedRoles, children }) {
  const user = getStoredUser();
  if (!user || user.status !== 'Active') return <Navigate to="/login" replace />;
  if (!isSubscriptionUsable(user)) return <Navigate to="/subscription" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

function RequireSession({ children }) {
  const user = getStoredUser();
  if (!user || user.status !== 'Active') return <Navigate to="/login" replace />;
  return children;
}

function Login() {
  const [mode, setMode] = useState('choice');
  const [message, setMessage] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const { data: hospitalData } = useApi('/hospitals');
  const navigate = useNavigate();

  async function handleGoogleLogin() {
    setMessage('');
    if (!loginEmail.trim()) {
      setMessage('Enter Login ID before Google login.');
      return;
    }
    try {
      const result = await apiPost('/auth/login', { email: loginEmail, provider: 'Google' });
      storeCurrentUser(result.user);
      navigate(isSubscriptionUsable(result.user) ? roleHome(result.user.role) : '/subscription');
    } catch (error) {
      setMessage(error.message);
      if (error.status === 404 || error.status === 403) setMode('request');
    }
  }

  async function handleAccessRequest(event) {
    event.preventDefault();
    setMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await apiPost('/access-requests', data);
      navigate('/pending');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="auth-page login-page">
      <div className="auth-panel login-panel">
        <div className="login-logo-shell">
          <img src="/smile-records-login.png" alt="Smile Records" className="login-logo" />
        </div>

        {mode === 'choice' && (
          <>
            <div className="login-copy">
              <p className="eyebrow">Clinic access</p>
              <h1>SmileRecords Login</h1>
              <p>Enter Login ID, then continue with Google. Access opens only after Admin approval.</p>
            </div>

            {message && <div className="notice warning-notice">{message}</div>}

            <label className="login-id-field">
              <span>Login ID</span>
              <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" placeholder="you@clinic.example" />
            </label>
            <div className="login-choice-grid">
              <button type="button" className="google-login-button" onClick={handleGoogleLogin}>
                <span className="google-mark" aria-hidden="true">G</span>
                Login with Google
              </button>
              <button type="button" className="secondary-button login-submit" onClick={() => { setMessage(''); setMode('request'); }}>
                <UserCheck size={17} />
                Request for Access
              </button>
            </div>
          </>
        )}

        {mode === 'request' && (
          <div className="login-role-step">
            <div className="login-copy">
              <p className="eyebrow">Google access request</p>
              <h1>Request admin approval</h1>
              <p>Continue with Google and select the role you need. Admin will approve and assign access.</p>
            </div>
            {message && <div className="notice warning-notice">{message}</div>}
            <form className="login-form" onSubmit={handleAccessRequest}>
              <label>
                <span>User Name<b className="required-star">*</b></span>
                <input name="name" placeholder="Your name" required />
              </label>
              <label>
                <span>Google email id<b className="required-star">*</b></span>
                <input name="email" type="email" placeholder="you@clinic.example" defaultValue={loginEmail} required />
              </label>
              <label>
                <span>Required role<b className="required-star">*</b></span>
                <select name="requestedRole" required defaultValue="">
                  <option value="" disabled>Select access role</option>
                  <option value="Assistant">Assistant</option>
                  <option value="Doctor">Doctor</option>
                </select>
              </label>
              <label>
                <span>Hospital<b className="required-star">*</b></span>
                <select name="hospitalId" required defaultValue="">
                  <option value="" disabled>Select hospital</option>
                  {(hospitalData?.hospitals || []).filter((hospital) => hospital.status !== 'Inactive').map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>{hospital.name}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="google-login-button">
                <span className="google-mark" aria-hidden="true">G</span>
                Request approval with Google
              </button>
            </form>
            <button type="button" className="secondary-button login-back" onClick={() => { setMessage(''); setMode('choice'); }}>
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

function SubscriptionGate() {
  const storedUser = getStoredUser();
  const [user, setUser] = useState(storedUser);
  const [message, setMessage] = useState('');
  const [paying, setPaying] = useState(false);
  const { data, loading, error } = useApi(`/subscriptions/status?email=${encodeURIComponent(storedUser?.email || '')}`, user?.subscription?.lastPaymentAt || '');
  const navigate = useNavigate();
  const subscription = data?.subscription || user?.subscription || {};
  const config = data?.config || {};
  const isUsable = isSubscriptionUsable({ ...user, subscription });

  useEffect(() => {
    if (user?.role && user.role !== 'Doctor') navigate(roleHome(user.role), { replace: true });
  }, [user?.role]);

  useEffect(() => {
    if (data?.user) {
      storeCurrentUser(data.user);
      setUser(data.user);
    }
  }, [data?.user?.subscription?.status, data?.user?.subscription?.paidUntil]);

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate('/login');
  };

  const paySubscription = async () => {
    setMessage('');
    setPaying(true);
    try {
      const orderPayload = await apiPost('/subscriptions/order', { email: user.email });
      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: orderPayload.keyId,
        amount: orderPayload.order.amount,
        currency: orderPayload.order.currency,
        name: 'SmileRecords',
        description: 'Monthly subscription - Rs. 999 in advance',
        order_id: orderPayload.order.id,
        prefill: { name: user.name, email: user.email },
        theme: { color: '#0f6cbd' },
        handler: async (response) => {
          const verified = await apiPost('/subscriptions/verify', { ...response, email: user.email });
          storeCurrentUser(verified.user);
          setUser(verified.user);
          setMessage('Subscription payment verified. Access is active.');
          navigate(roleHome(verified.user.role));
        },
        modal: {
          ondismiss: () => setMessage('Payment was not completed. Subscription access remains locked after free trial expiry.')
        }
      });
      checkout.open();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="auth-page subscription-auth-page">
      <div className="auth-panel subscription-panel">
        <div className="login-logo-shell subscription-logo-shell">
          <img src="/smile-records-login.png" alt="Smile Records" className="login-logo" />
        </div>
        <div className="login-copy">
          <p className="eyebrow">Doctor subscription access</p>
          <h1>SmileRecords Doctor Monthly Plan</h1>
          <p>Subscription is only for Doctor users. First month is free, then Rs. 999 paid in advance before doctor access continues.</p>
        </div>
        {message && <div className="notice warning-notice">{message}</div>}
        {error && <div className="notice warning-notice">Unable to load subscription: {error.message}</div>}
        <div className="subscription-status-card">
          <div><span>User</span><strong>{displayUserName(user)}</strong></div>
          <div><span>Role</span><strong>{user?.role || '-'}</strong></div>
          <div><span>Status</span><Status value={subscription.status || (loading ? 'Checking' : 'Expired')} /></div>
          <div><span>Trial ends</span><strong>{formatDateOnly(subscription.trialEndsAt)}</strong></div>
          <div><span>Paid until</span><strong>{formatDateOnly(subscription.paidUntil)}</strong></div>
          <div><span>Monthly fee</span><strong>{formatCurrency(config.amount || 999)}</strong></div>
        </div>
        {isUsable ? (
          <button className="primary-button" type="button" onClick={() => navigate(roleHome(user.role))}>
            <CheckCircle2 size={18} />Continue to app
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={paySubscription} disabled={paying}>
            <CreditCard size={18} />{paying ? 'Opening Razorpay...' : 'Pay Rs. 999 and activate'}
          </button>
        )}
        {!config.configured && <p className="muted compact-note">Razorpay keys are not configured on this server yet. Add keys on Render before live payments.</p>}
        <button className="secondary-button" type="button" onClick={logout}><LogOut size={17} />Logout</button>
      </div>
    </div>
  );
}

function MobileShell({ role }) {
  const isDoctor = role === 'doctor';
  const [currentUser] = useSyncedCurrentUser();
  const queuePath = isDoctor
    ? `/fees-summary?doctorEmail=${encodeURIComponent(currentUser?.email || '')}`
    : `/fees-summary?assistantEmail=${encodeURIComponent(currentUser?.email || '')}`;
  const [refresh, setRefresh] = useState(0);
  const { data } = useApi(queuePath, refresh);
  const { data: notificationData } = useApi(`/notifications?email=${encodeURIComponent(currentUser?.email || '')}`, refresh);
  const feesPendingCount = data?.readyCases?.length ?? 0;
  const unreadNotifications = (notificationData?.notifications || []).filter((item) => item.status !== 'Read');
  const notificationCount = unreadNotifications.length;
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const notificationRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const notifications = notificationData?.notifications || [];
  useEffect(() => {
    const refreshShell = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-refresh', refreshShell);
    window.addEventListener('smile-records-queue-change', refreshShell);
    window.addEventListener('smile-records-fees-change', refreshShell);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshShell);
      window.removeEventListener('smile-records-queue-change', refreshShell);
      window.removeEventListener('smile-records-fees-change', refreshShell);
    };
  }, []);
  useEffect(() => {
    const closeFloatingPanels = (event) => {
      const target = event.target;
      if (
        menuOpen &&
        !menuRef.current?.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
      if (
        notificationOpen &&
        !notificationRef.current?.contains(target) &&
        !notificationButtonRef.current?.contains(target)
      ) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeFloatingPanels);
    return () => document.removeEventListener('pointerdown', closeFloatingPanels);
  }, [menuOpen, notificationOpen]);
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate('/login');
  };
  const notificationTarget = (item) => {
    if (item.type === 'fees-reconciliation') return isDoctor ? '/doctor/reconciliation' : '/assistant/reconciliation';
    if (item.type === 'case' && item.entityId) return isDoctor ? `/doctor/case/${item.entityId}` : `/assistant/case/${item.entityId}`;
    return PROFILE_COPY[role].home;
  };
  const openNotifications = async () => {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (nextOpen && unreadNotifications.length) {
      try {
        await apiPost('/notifications/read-all', { email: currentUser?.email }, 'PATCH');
        setRefresh((value) => value + 1);
      } catch {
        // Keep the panel usable even if read-state sync fails.
      }
    }
  };
  const openNotification = async (item) => {
    try {
      await apiPost(`/notifications/${item.id}/read`, { email: currentUser?.email }, 'PATCH');
    } catch {
      // Navigation should still work if read-state sync fails.
    }
    setNotificationOpen(false);
    setRefresh((value) => value + 1);
    navigate(notificationTarget(item));
    focusPageTop();
  };
  const menuItems = isDoctor
    ? [
        { to: '/doctor/dashboard', label: 'Dashboard', icon: Gauge },
        { to: '/doctor/fees', label: 'Fees', icon: ReceiptIndianRupee, badge: feesPendingCount },
        { to: '/doctor/assistants', label: 'Assistant Mapping', icon: Users },
        { to: '/doctor/reconciliation', label: 'Fees Reconciliation', icon: ReceiptIndianRupee }
      ]
    : [
        { to: '/assistant/dashboard', label: 'Dashboard', icon: Gauge },
        { to: '/assistant/intake', label: 'Appointments', icon: FilePlus2 },
        { to: '/assistant/fees', label: 'Fees', icon: ReceiptIndianRupee, badge: feesPendingCount },
        { to: '/assistant/reconciliation', label: 'Fees Reconciliation', icon: CheckCircle2 }
      ];
  const bottomTabs = isDoctor
    ? [
        { to: '/doctor/fees', label: 'Fees', icon: ReceiptIndianRupee, badge: feesPendingCount },
        { to: '/doctor/dashboard', label: 'Dashboard', icon: Gauge }
      ]
    : [];

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <div className="mobile-brand-line">
          <button
            className="mobile-logo-button"
            type="button"
            onClick={() => {
              navigate(PROFILE_COPY[role].home);
              focusPageTop();
            }}
            aria-label="Go to home"
          >
            <img src="/smile-records-header.png" alt="Smile Records" className="mobile-header-logo" />
          </button>
        </div>
        <div className="mobile-header-actions">
          <button ref={notificationButtonRef} className="icon-button notification-button" type="button" aria-label="Notifications" onClick={openNotifications}>
            <Bell size={18} />
            {notificationCount > 0 && <span className="notification-count">{notificationCount}</span>}
          </button>
          <button className="icon-button" type="button" aria-label="Logout" onClick={logout}>
            <LogOut size={18} />
          </button>
          <button ref={menuButtonRef} className="icon-button menu-trigger" type="button" aria-label="Open menu" onClick={() => setMenuOpen((value) => !value)}>
            <Menu size={18} />
          </button>
        </div>
        {menuOpen && <MobileProfileMenu ref={menuRef} role={role} tabs={menuItems} onClose={() => setMenuOpen(false)} onLogout={logout} />}
        {notificationOpen && (
          <div className="mobile-notification-panel" ref={notificationRef}>
            <header>
              <strong>Notifications</strong>
              <button type="button" aria-label="Close notifications" onClick={() => setNotificationOpen(false)}><X size={15} /></button>
            </header>
            {notifications.length ? notifications.map((item) => (
              <button className={item.status === 'Read' ? 'read' : ''} type="button" key={item.id} onClick={() => openNotification(item)}>
                <span>{item.title}</span>
                <small>{item.message}</small>
              </button>
            )) : <p>No notifications.</p>}
          </div>
        )}
      </header>
      <main className="mobile-content">
        <ProfileWelcome role={role} />
        <Outlet />
      </main>
      {isDoctor ? (
        <DoctorBottomDock tabs={bottomTabs} />
      ) : (
        <AssistantBottomDock feesPendingCount={feesPendingCount} />
      )}
    </div>
  );
}

const MobileProfileMenu = React.forwardRef(function MobileProfileMenu({ role, tabs, onClose, onLogout }, ref) {
  const navigate = useNavigate();
  const home = PROFILE_COPY[role].home;
  const links = [{ to: home, label: 'Home', icon: Home }, ...tabs.filter((tab) => tab.to !== home)];
  return (
    <div className="mobile-menu-panel" ref={ref}>
      {links.map((item) => (
        <button
          className="mobile-menu-link"
          key={item.to}
          type="button"
          onClick={() => {
            navigate(item.to);
            onClose();
            focusPageTop();
          }}
        >
          <item.icon size={17} />
          <span>{item.label}</span>
          {item.badge > 0 && <span className="menu-link-badge">{item.badge}</span>}
        </button>
      ))}
      <button className="mobile-menu-link danger" type="button" onClick={onLogout}>
        <LogOut size={17} />
        <span>Logout</span>
      </button>
    </div>
  );
});

function ProfileWelcome({ role }) {
  const copy = PROFILE_COPY[role];
  const [currentUser, setCurrentUser] = useSyncedCurrentUser();
  return (
    <section className="profile-welcome">
      <div>
        <strong>{getGreeting()}, {displayUserName(currentUser, copy.name)}</strong>
        <span>{copy.greeting}</span>
      </div>
      <ProfilePhotoButton user={currentUser} onUserChange={setCurrentUser} />
    </section>
  );
}

function ProfilePhotoButton({ user, onUserChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const updateStoredUser = (nextUser) => {
    storeCurrentUser(nextUser);
    onUserChange?.(nextUser);
    window.dispatchEvent(new Event('smile-records-refresh'));
  };

  const savePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setMessage('Upload PNG, JPG, or WEBP image only.');
      return;
    }
    if (file.size > 600 * 1024) {
      setMessage('Image should be below 600 KB.');
      return;
    }
    setSaving(true);
    setMessage('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await apiPost('/users/profile-photo', { email: user.email, profilePhoto: reader.result }, 'PATCH');
        updateStoredUser(result.user);
        setMessage('Profile photo updated.');
      } catch (error) {
        setMessage(error.message);
      } finally {
        setSaving(false);
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      setSaving(false);
      setMessage('Unable to read selected image.');
    };
    reader.readAsDataURL(file);
  };

  const deletePhoto = async () => {
    setSaving(true);
    setMessage('');
    try {
      const result = await apiPost('/users/profile-photo', { email: user.email, action: 'delete' }, 'PATCH');
      updateStoredUser(result.user);
      setMessage('Profile photo removed.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={compact ? 'profile-photo-control compact' : 'profile-photo-control'}>
      <button className="profile-photo-button" type="button" onClick={() => setOpen((value) => !value)} aria-label="Profile photo">
        {user?.profilePhoto ? <img src={user.profilePhoto} alt="" /> : <UserRound size={compact ? 18 : 20} />}
      </button>
      {open && (
        <div className="profile-photo-popover">
          <div className="profile-photo-preview">
            {user?.profilePhoto ? <img src={user.profilePhoto} alt="Profile" /> : <span>{userInitials(user)}</span>}
          </div>
          <strong>{displayUserName(user)}</strong>
          <small>{user?.role || 'User'}</small>
          {message && <p>{message}</p>}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={savePhoto} hidden />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={saving}>
            <Camera size={15} />{user?.profilePhoto ? 'Update photo' : 'Add photo'}
          </button>
          {user?.profilePhoto && (
            <button className="danger" type="button" onClick={deletePhoto} disabled={saving}>
              <Trash2 size={15} />Delete photo
            </button>
          )}
        </div>
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
  const currentUser = getStoredUser();
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState(readDrafts);
  const [refresh, setRefresh] = useState(0);
  const [mode, setMode] = useState('appointments');
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const { data, loading, error } = useApi('/cases', refresh);
  const { data: doctorOptionData } = useApi(`/assistant-doctor-options?assistantEmail=${encodeURIComponent(currentUser?.email || '')}`);
  const doctorOptions = doctorOptionData?.doctors || [];
  const effectiveDoctorId = doctorOptions.length === 1 ? doctorOptions[0].id : selectedDoctorId;
  const appointmentPath = `/appointments?date=${encodeURIComponent(selectedDate)}${effectiveDoctorId ? `&doctorId=${encodeURIComponent(effectiveDoctorId)}` : ''}`;
  const { data: appointmentData } = useApi(appointmentPath, refresh);
  const mustSelectDoctor = doctorOptions.length > 1 && !selectedDoctorId;
  const selectedDoctor = doctorOptions.find((doctor) => doctor.id === effectiveDoctorId);
  const activeHospitalId = selectedDoctor?.hospitalId || doctorOptionData?.hospital?.id || currentUser?.hospitalId || '';
  const navigate = useNavigate();
  const bookedTimes = useMemo(() => new Set((appointmentData?.appointments || [])
    .filter((item) => !isCancelledAppointment(item))
    .map((item) => item.time)), [appointmentData]);
  const [returningPatient, setReturningPatient] = useState(null);
  const [lookupPatients, setLookupPatients] = useState([]);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [mobileDecision, setMobileDecision] = useState('');
  const [patientDraft, setPatientDraft] = useState(emptyPatientDraft());
  const intakeFormRef = useRef(null);

  useEffect(() => {
    if (!selectedDoctorId && doctorOptions.length) {
      setSelectedDoctorId(doctorOptions[0].id);
    }
  }, [doctorOptions.length, selectedDoctorId]);

  useEffect(() => {
    const refreshQueue = () => setRefresh((value) => value + 1);
    const openIntake = () => {
      setMode('new');
      focusPageTop();
    };
    const showAppointments = () => {
      setMode('appointments');
      focusPageTop();
    };
    window.addEventListener('smile-records-refresh', refreshQueue);
    window.addEventListener('smile-records-queue-change', refreshQueue);
    window.addEventListener('smile-records-appointments-change', refreshQueue);
    window.addEventListener('smile-records-open-intake', openIntake);
    window.addEventListener('smile-records-show-appointments', showAppointments);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshQueue);
      window.removeEventListener('smile-records-queue-change', refreshQueue);
      window.removeEventListener('smile-records-appointments-change', refreshQueue);
      window.removeEventListener('smile-records-open-intake', openIntake);
      window.removeEventListener('smile-records-show-appointments', showAppointments);
    };
  }, []);

  useEffect(() => {
    focusPageTop('smooth');
  }, [mode]);

  const submitPatient = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formToPatient(form);
    if (lookupPatients.length && !mobileDecision) {
      setLookupOpen(true);
      setMessage('Select an existing patient or choose Create New before submitting.');
      return;
    }
    if (effectiveDoctorId) payload.doctorId = effectiveDoctorId;
    if (activeHospitalId) payload.hospitalId = activeHospitalId;
    if (returningPatient && mobileDecision === 'use-existing') payload.matchedPatientId = returningPatient.id;
    if (returningPatient && mobileDecision === 'new-record') payload.allowDuplicateMobile = true;
    let result;
    try {
      result = await apiPost('/cases', payload);
    } catch (error) {
      if (error.status) {
        setMessage(error.message);
      } else {
        saveDraft(payload);
        setDrafts(readDrafts());
        setMessage(`${error.message || 'Network unavailable.'} Saved offline draft on this device.`);
      }
      return;
    }
    setMessage('');
    form.reset();
    setReturningPatient(null);
    setLookupPatients([]);
    setLookupOpen(false);
    setMobileDecision('');
    setPatientDraft(emptyPatientDraft());
    setMode('appointments');
    broadcastClinicRefresh();
    setRefresh((value) => value + 1);
  };

  const saveOffline = (event) => {
    const form = event.currentTarget.closest('form');
    const payload = formToPatient(form);
    if (effectiveDoctorId) payload.doctorId = effectiveDoctorId;
    if (activeHospitalId) payload.hospitalId = activeHospitalId;
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
    setMobileDecision('');
    if (mobile.length < 10 || !activeHospitalId) {
      setReturningPatient(null);
      setLookupPatients([]);
      setLookupOpen(false);
      return;
    }
    try {
      const response = await fetch(apiUrl(`/patients/lookup?mobile=${encodeURIComponent(mobile)}&hospitalId=${encodeURIComponent(activeHospitalId)}`), { headers: apiHeaders() });
      const payload = await response.json();
      const matches = payload.patients || (payload.patient ? [payload.patient] : []);
      setLookupPatients(matches);
      setReturningPatient(null);
      setLookupOpen(matches.length > 0);
    } catch {
      setReturningPatient(null);
      setLookupPatients([]);
      setLookupOpen(false);
      setPatientDraft((current) => ({ ...current, mobile }));
    }
  };

  const updatePatientDraft = (name) => (event) => {
    const value = event.target.value;
    setPatientDraft((current) => ({ ...current, [name]: value }));
    if (name === 'mobile') {
      setMobileDecision('');
      setReturningPatient(null);
      setLookupPatients([]);
      setLookupOpen(false);
    }
  };

  const handleMobileBlur = async (event) => {
    const mobile = event.target.value.trim();
    setPatientDraft((current) => ({ ...current, mobile }));
    await lookupPatient(event);
  };

  const useExistingPatient = async (patient) => {
    try {
      const response = await fetch(apiUrl(`/patients/${patient.id}`), { headers: apiHeaders() });
      const payload = await response.json();
      const fullPatient = { ...patient, ...(payload.patient || {}) };
      setReturningPatient(fullPatient);
      setMobileDecision('use-existing');
      setLookupOpen(false);
      setPatientDraft(patientToDraft(fullPatient));
      setMessage(`Using existing patient ${fullPatient.name}. Previous history will stay linked to this case.`);
    } catch {
      setReturningPatient(patient);
      setMobileDecision('use-existing');
      setLookupOpen(false);
      setPatientDraft(patientToDraft(patient));
      setMessage(`Using existing patient ${patient.name}. Previous history will stay linked to this case.`);
    }
  };

  const createNewPatientForMobile = () => {
    setReturningPatient(lookupPatients[0] || null);
    setMobileDecision('new-record');
    setPatientDraft((current) => ({ ...emptyPatientDraft(), mobile: current.mobile }));
    setLookupOpen(false);
    setMessage('Create new patient record for this mobile number.');
  };

  return (
    <MobilePage
      title={mode === 'new' ? 'New Appointment' : <span className="assistant-appointments-title">Appointments</span>}
      subtitle=""
      action={mode === 'appointments'
        ? <DatePickerControl value={selectedDate} onChange={setSelectedDate} />
        : <button className="page-close-button" type="button" onClick={() => setMode('appointments')}>Close</button>}
    >
      {message && <div className="notice">{message}</div>}
      {mode === 'new' ? (
        <form className="new-patient-sheet new-appointment-fit" onSubmit={submitPatient} ref={intakeFormRef}>
          {doctorOptions.length > 0 && (
            <div className="doctor-select-panel">
              <strong>Select Doctor</strong>
              {doctorOptions.length === 1 ? (
                <>
                  <input type="hidden" name="doctorId" value={doctorOptions[0].id} />
                  <p>{doctorOptions[0].name}</p>
                </>
              ) : (
                <label className="field">
                  <span>Doctor<b className="required-star">*</b></span>
                  <select name="doctorId" value={selectedDoctorId} onChange={(event) => setSelectedDoctorId(event.target.value)} required>
                    <option value="" disabled>Select doctor before patient details</option>
                    {doctorOptions.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          {mustSelectDoctor ? (
            <div className="notice warning-notice">Select Doctor before entering patient details.</div>
          ) : (
            <>
          <div className="sheet-header">
            <strong>Patient Details</strong>
          </div>
          <Input name="mobile" label="Mobile" controlledValue={patientDraft.mobile} required onBlur={handleMobileBlur} onChange={updatePatientDraft('mobile')} />
          <Input name="name" label="Name" controlledValue={patientDraft.name} onChange={updatePatientDraft('name')} required />
          {lookupPatients.length > 0 && mobileDecision && (
            <div className="returning-patient-note duplicate-check">
              <strong>{mobileDecision === 'use-existing' ? 'Existing patient selected' : 'New patient record selected'}</strong>
              <span>
                {mobileDecision === 'use-existing'
                  ? `${returningPatient?.name || 'Patient'} history will be linked day-wise.`
                  : 'Fresh patient details will be saved with the same mobile number.'}
              </span>
              <div className="dedupe-actions">
                <button type="button" onClick={() => setLookupOpen(true)}>Review Matches</button>
                <button type="button" onClick={createNewPatientForMobile}>Create New</button>
              </div>
            </div>
          )}
          <Input name="age" label="Age" controlledValue={patientDraft.age} onChange={updatePatientDraft('age')} required />
          <SelectInput name="gender" label="Gender" controlledValue={patientDraft.gender} onChange={updatePatientDraft('gender')} options={GENDER_OPTIONS} required />
          <Input name="address" label="Address" controlledValue={patientDraft.address} onChange={updatePatientDraft('address')} required />
          <Input name="chiefComplaint" label="Complaint" controlledValue={patientDraft.chiefComplaint} onChange={updatePatientDraft('chiefComplaint')} required />
          <Input name="toothNumber" label="Tooth" controlledValue={patientDraft.toothNumber} onChange={updatePatientDraft('toothNumber')} />
          <Input name="medicalFlags" label="Flags" controlledValue={patientDraft.medicalFlags} onChange={updatePatientDraft('medicalFlags')} placeholder="BP, allergy" />
          <TimeSlotSelect name="appointmentTime" label="Time" bookedTimes={bookedTimes} required />
          <input type="hidden" name="hospitalId" value={activeHospitalId} />
          <input type="hidden" name="appointmentDate" value={selectedDate} />
          <input type="hidden" name="assistantId" value={currentUser?.id || ''} />
          <input type="hidden" name="assistantName" value={displayUserName(currentUser, 'Assistant')} />
          <input type="hidden" name="consent" value="on" />
          <div className="sheet-actions">
            <button className="primary-button" type="submit"><Send size={16} />Submit</button>
            <button className="secondary-button" type="button" onClick={() => setMode('appointments')}>Close</button>
          </div>
          {lookupOpen && (
            <PatientLookupModal
              patients={lookupPatients}
              onUseExisting={(patient) => useExistingPatient(patient)}
              onCreateNew={createNewPatientForMobile}
              onClose={() => setLookupOpen(false)}
            />
          )}
            </>
          )}
        </form>
      ) : (
        <>
          <DoctorRadioSelector doctors={doctorOptions} selectedDoctorId={effectiveDoctorId} onChange={setSelectedDoctorId} />
          <TodayStatusDashboard selectedDate={selectedDate} activeStatus={statusFilter} onStatusChange={setStatusFilter} doctorId={effectiveDoctorId} />
          <AppointmentCalendar compact selectedDate={selectedDate} statusFilter={statusFilter} role="assistant" doctorId={effectiveDoctorId} />
        </>
      )}
    </MobilePage>
  );
}

function DoctorRadioSelector({ doctors = [], selectedDoctorId, onChange }) {
  if (!doctors.length) {
    return <div className="notice warning-notice">No mapped doctors found for this assistant.</div>;
  }
  return (
    <section className="doctor-radio-panel" aria-label="Mapped doctor selection">
      <strong>Mapped Doctors</strong>
      <div>
        {doctors.map((doctor) => (
          <label className={selectedDoctorId === doctor.id ? 'active' : ''} key={doctor.id}>
            <input
              type="radio"
              name="mappedDoctor"
              checked={selectedDoctorId === doctor.id}
              onChange={() => onChange(doctor.id)}
            />
            <span>{doctor.name}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function PatientLookupModal({ patients, onUseExisting, onCreateNew, onClose }) {
  return (
    <div className="patient-lookup-overlay" role="dialog" aria-modal="true">
      <div className="patient-lookup-modal">
        <header>
          <div>
            <strong>Existing patient found</strong>
            <span>{patients.length} record(s) mapped to this mobile number</span>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <div className="patient-match-list">
          {patients.map((patient) => (
            <article className="patient-match-card" key={patient.id}>
              <div className="patient-match-main">
                <div>
                  <strong>{patient.name}</strong>
                  <span>{patient.mobile} | {patient.age || '-'} | {patient.gender || '-'}</span>
                  <small>{patient.address || patient.city || 'No address saved'}</small>
                </div>
                <button type="button" onClick={(event) => onUseExisting(patient, event)}>Use Existing</button>
              </div>
              <div className="patient-match-details">
                <div><span>Last visit</span><strong>{patient.lastVisitDate || 'Not available'}</strong></div>
                <div><span>Status</span><strong>{patient.treatmentStatus || 'Not available'}</strong></div>
                <div><span>Tooth</span><strong>{patient.toothNumber || '-'}</strong></div>
                <div><span>Flags</span><strong>{patient.medicalFlags?.join(', ') || 'None'}</strong></div>
              </div>
              <PatientHistoryDays historyDays={patient.historyDays || []} compact />
            </article>
          ))}
        </div>
        <button className="secondary-button patient-create-new" type="button" onClick={onCreateNew}>
          <UserRoundPlus size={17} />Create New Patient With Same Mobile
        </button>
      </div>
    </div>
  );
}

function PatientHistoryDays({ historyDays = [], compact = false }) {
  if (!historyDays.length) return <p className="muted history-empty">No previous history available.</p>;
  return (
    <div className={compact ? 'patient-history-days compact' : 'patient-history-days'}>
      {historyDays.map((day) => (
        <section className="patient-history-day" key={day.date}>
          <time>{day.date}</time>
          <div>
            {(day.items || []).map((entry, index) => (
              <article className="patient-history-entry" key={`${day.date}-${entry.title}-${index}`}>
                <strong>{entry.title}</strong>
                {entry.note && <span>{entry.note}</span>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TodayStatusDashboard({ selectedDate, activeStatus, onStatusChange, label = 'Today Status', scopeStatus = '', doctorId = '', doctorEmail = '' }) {
  const [refresh, setRefresh] = useState(0);
  const appointmentPath = `/appointments?date=${encodeURIComponent(selectedDate)}${doctorId ? `&doctorId=${encodeURIComponent(doctorId)}` : ''}${doctorEmail ? `&doctorEmail=${encodeURIComponent(doctorEmail)}&scope=mapped` : ''}`;
  const { data, loading } = useApi(appointmentPath, refresh);
  const appointments = data?.appointments || [];
  const scopedAppointments = scopeStatus ? appointments.filter((item) => item.status === scopeStatus) : appointments;

  useEffect(() => {
    const refreshAppointments = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-refresh', refreshAppointments);
    window.addEventListener('smile-records-appointments-change', refreshAppointments);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshAppointments);
      window.removeEventListener('smile-records-appointments-change', refreshAppointments);
    };
  }, []);
  const counts = scopedAppointments.reduce((acc, item) => {
    const key = item.status === 'waiting' ? 'scheduled' : item.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const tiles = [
    { label: 'All', status: 'all', value: scopedAppointments.length },
    { label: 'Scheduled', status: 'scheduled', value: counts.scheduled || 0 },
    { label: "DR's Que", status: 'doctor_queue', value: counts.doctor_queue || 0 },
    { label: 'Fees Collection', status: 'doctor_done', value: counts.doctor_done || 0 },
    { label: 'Closed', status: 'complete', value: counts.complete || 0 },
    { label: 'Cancelled', status: 'cancelled', value: counts.cancelled || 0 }
  ];
  const liveLabelParts = label.endsWith(' - Live') ? label.split(' - Live') : null;

  return (
    <section className="today-dashboard">
      <header>
        <strong>
          {liveLabelParts ? (
            <>
              {liveLabelParts[0]} - <span className="live-header-text">Live</span>
            </>
          ) : label}
        </strong>
        <span>{loading ? 'Syncing' : `${scopedAppointments.length} appointments`}</span>
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

function AssistantFeesQueue() {
  const currentUser = getStoredUser();
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [refresh, setRefresh] = useState(0);
  const { data: doctorOptionData } = useApi(`/assistant-doctor-options?assistantEmail=${encodeURIComponent(currentUser?.email || '')}`);
  const doctorOptions = doctorOptionData?.doctors || [];
  const effectiveDoctorId = doctorOptions.length === 1 ? doctorOptions[0].id : selectedDoctorId;
  const feesPath = `/fees-summary?assistantEmail=${encodeURIComponent(currentUser?.email || '')}&date=${encodeURIComponent(selectedDate)}${effectiveDoctorId ? `&doctorId=${encodeURIComponent(effectiveDoctorId)}` : ''}`;
  const { data, loading, error } = useApi(feesPath, refresh);

  useEffect(() => {
    if (!selectedDoctorId && doctorOptions.length) setSelectedDoctorId(doctorOptions[0].id);
  }, [doctorOptions.length, selectedDoctorId]);

  useEffect(() => {
    const refreshFees = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-refresh', refreshFees);
    window.addEventListener('smile-records-fees-change', refreshFees);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshFees);
      window.removeEventListener('smile-records-fees-change', refreshFees);
    };
  }, []);

  const paidCases = (data?.cases || []).filter((item) => (
    paymentFilter === 'all' || item.closure?.paymentMode === paymentFilter
  ));

  return (
    <MobilePage title="Fees Collection" action={<DatePickerControl value={selectedDate} onChange={setSelectedDate} />}>
      <DoctorRadioSelector doctors={doctorOptions} selectedDoctorId={effectiveDoctorId} onChange={setSelectedDoctorId} />
      <FeesDashboard data={data} active={paymentFilter} onChange={setPaymentFilter} />
      <MobileSection title={`Fees Pending (${data?.readyCases?.length || 0})`}>
        <FeesWorkflowList loading={loading} error={error} cases={data?.readyCases || []} mode="ready" />
      </MobileSection>
      <MobileSection title={`Fees Collected (${paidCases.length})`}>
        <FeesWorkflowList loading={loading} error={error} cases={paidCases} mode="paid" />
      </MobileSection>
    </MobilePage>
  );
}

function DoctorFeesQueue() {
  const [currentUser] = useSyncedCurrentUser();
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [refresh, setRefresh] = useState(0);
  const feesPath = `/fees-summary?doctorEmail=${encodeURIComponent(currentUser?.email || '')}&date=${encodeURIComponent(selectedDate)}`;
  const { data, loading, error } = useApi(feesPath, refresh);

  useEffect(() => {
    const refreshFees = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-refresh', refreshFees);
    window.addEventListener('smile-records-fees-change', refreshFees);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshFees);
      window.removeEventListener('smile-records-fees-change', refreshFees);
    };
  }, []);

  const paidCases = (data?.cases || []).filter((item) => (
    paymentFilter === 'all' || item.closure?.paymentMode === paymentFilter
  ));

  return (
    <MobilePage title="Fees Collection" action={<DatePickerControl value={selectedDate} onChange={setSelectedDate} />}>
      <FeesDashboard data={data} active={paymentFilter} onChange={setPaymentFilter} />
      <MobileSection title={`Fees Pending (${data?.readyCases?.length || 0})`}>
        <FeesWorkflowList loading={loading} error={error} cases={data?.readyCases || []} mode="ready" toPrefix="/doctor/case" />
      </MobileSection>
      <MobileSection title={`Fees Collected (${paidCases.length})`}>
        <FeesWorkflowList loading={loading} error={error} cases={paidCases} mode="paid" toPrefix="/doctor/case" />
      </MobileSection>
    </MobilePage>
  );
}

function FeesDashboard({ data, active, onChange }) {
  const summary = data?.summary || {};
  const tiles = [
    { key: 'all', label: 'Total', amount: summary.totalAmount || 0, count: summary.totalCount || 0 },
    { key: 'Cash', label: 'Cash', amount: summary.cashAmount || 0, count: summary.cashCount || 0 },
    { key: 'UPI', label: 'UPI', amount: summary.upiAmount || 0, count: summary.upiCount || 0 }
  ];
  return (
    <section className="fees-dashboard">
      {tiles.map((tile) => (
        <button className={active === tile.key ? 'active' : ''} key={tile.key} type="button" onClick={() => onChange(tile.key)}>
          <strong>{formatCurrency(tile.amount)}</strong>
          <span>{tile.label} | {tile.count}</span>
        </button>
      ))}
    </section>
  );
}

function DoctorWiseFees({ rows }) {
  if (!rows.length) return null;
  return (
    <section className="mobile-section doctor-wise-fees">
      <h3>Doctor Wise Collection</h3>
      {rows.map((row) => (
        <div className="doctor-wise-row" key={row.doctorId || row.doctorName}>
          <strong>{row.doctorName}</strong>
          <span>Cash {formatCurrency(row.cashAmount)} | UPI {formatCurrency(row.upiAmount)}</span>
          <b>{formatCurrency(row.totalAmount)}</b>
        </div>
      ))}
    </section>
  );
}

function FeesWorkflowList({ loading, error, cases, mode = 'ready', toPrefix = '/assistant/case' }) {
  const [message, setMessage] = useState('');
  if (loading) return <p className="muted">Loading fees queue...</p>;
  if (error) return <p className="error-text">Unable to load fees queue: {error.message}</p>;
  if (!cases.length) return <p className="muted">{mode === 'paid' ? 'No fees collected for selected filter.' : 'No pending fees collection cases.'}</p>;

  return (
    <div className="fees-workflow-list">
      {message && <p className="queue-message">{message}</p>}
      {cases.map((item, index) => (
        <NavLink
          className="fees-queue-row"
          key={item.id}
          to={`${toPrefix}/${item.id}`}
          state={{ from: 'fees' }}
          onClick={(event) => {
            if (mode === 'paid') {
              event.preventDefault();
              setMessage('Fees already collected. Completed fee records cannot be edited.');
            }
          }}
        >
          <div className="appointment-number">{index + 1}</div>
          <div className="appointment-main">
            <strong className="appointment-name">{item.patient.name}</strong>
            <span>{item.patient.mobile}</span>
            {mode === 'paid' && <small className="fees-payment-line">{item.closure?.paymentMode || 'Payment'} - {formatCurrency(item.closure?.feesCollected)}</small>}
          </div>
          <div className="appointment-send-cell">
            <Status value={mode === 'ready' ? 'Fees Pending' : 'Fees Collected'} />
            <span className="send-appointment-button">
              {mode === 'ready' ? 'Open' : 'Paid'}
            </span>
          </div>
        </NavLink>
      ))}
    </div>
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

function DoctorAssistantMapping() {
  const currentUser = getStoredUser();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingMapping, setPendingMapping] = useState(null);
  const { data, loading, error } = useApi(`/doctor-assistant-mappings?doctorEmail=${encodeURIComponent(currentUser?.email || '')}`, refresh);

  useEffect(() => {
    if (data?.mappedAssistantIds) setSelectedIds(data.mappedAssistantIds);
  }, [data?.mapping?.updatedAt]);

  const toggleAssistant = (assistantId) => {
    setSelectedIds((current) => (
      current.includes(assistantId)
        ? current.filter((id) => id !== assistantId)
        : [...current, assistantId]
    ));
  };

  const saveMapping = async (confirmed = false) => {
    const previousIds = data?.mappedAssistantIds || [];
    const added = selectedIds.filter((id) => !previousIds.includes(id));
    const removed = previousIds.filter((id) => !selectedIds.includes(id));
    if (!confirmed && (added.length || removed.length)) {
      setPendingMapping({ added, removed });
      return;
    }
    setPendingMapping(null);
    try {
      await apiPost('/doctor-assistant-mappings', {
        doctorEmail: currentUser?.email,
        assistantIds: selectedIds
      });
      const parts = [];
      if (added.length) parts.push(`${added.length} assistant(s) mapped`);
      if (removed.length) parts.push(`${removed.length} assistant(s) unmapped`);
      setMessage(parts.length ? `${parts.join(' and ')} successfully.` : 'Assistant mapping saved.');
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <MobilePage
      title="Assistant Mapping"
      subtitle="Select assistants from your mapped hospital only."
      action={<button className="page-close-button" type="button" onClick={() => navigate('/doctor/queue')}>Close</button>}
    >
      {message && <div className="notice">{message}</div>}
      {loading && <p className="muted">Loading hospital assistants...</p>}
      {error && <p className="error-text">Unable to load assistant mapping: {error.message}</p>}
      {data && (
        <>
          <div className="mapping-hospital-pill">
            <span>Hospital</span>
            <strong>{data.hospital?.name || 'Not mapped'}</strong>
            <small>{data.assistants?.length || 0} active assistant(s) available</small>
          </div>
          <section className="mobile-section">
            <h3>Mapped Assistants</h3>
            <div className="mapping-list">
              {!data.assistants?.length && <p className="muted">No active assistants are mapped to this hospital.</p>}
              {(data.assistants || []).map((assistant) => (
                <label className="mapping-row" key={assistant.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(assistant.id)}
                    onChange={() => toggleAssistant(assistant.id)}
                  />
                  <span>
                    <strong>{assistant.name}</strong>
                    <small>{assistant.email} | {assistant.hospitalName}</small>
                  </span>
                </label>
              ))}
            </div>
            <button className="primary-button" type="button" onClick={() => saveMapping(false)}>
              <Save size={17} />Save Mapping
            </button>
          </section>
          {pendingMapping && (
            <div className="confirm-overlay" role="dialog" aria-modal="true">
              <div className="confirm-card">
                <strong>Confirm assistant mapping</strong>
                <p>
                  {pendingMapping.removed.length
                    ? 'You are unmapping an assistant. Open patient work must be completed or cancelled before the system allows unmapping.'
                    : 'Confirm assistant mapping changes for this doctor.'}
                </p>
                <div>
                  <button type="button" onClick={() => setPendingMapping(null)}>Cancel</button>
                  <button type="button" onClick={() => saveMapping(true)}>Confirm</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </MobilePage>
  );
}

function AssistantFeesReconciliation() {
  const currentUser = getStoredUser();
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const { data: doctorOptionData } = useApi(`/assistant-doctor-options?assistantEmail=${encodeURIComponent(currentUser?.email || '')}`);
  const doctorOptions = doctorOptionData?.doctors || [];
  const effectiveDoctorId = doctorOptions.length === 1 ? doctorOptions[0].id : selectedDoctorId;
  const feesPath = `/fees-summary?assistantEmail=${encodeURIComponent(currentUser?.email || '')}&date=${encodeURIComponent(selectedDate)}${effectiveDoctorId ? `&doctorId=${encodeURIComponent(effectiveDoctorId)}` : ''}`;
  const { data: feesData } = useApi(feesPath, refresh);
  const { data: reconData } = useApi(`/fees-reconciliations?assistantEmail=${encodeURIComponent(currentUser?.email || '')}${effectiveDoctorId ? `&doctorId=${encodeURIComponent(effectiveDoctorId)}` : ''}`, refresh);

  useEffect(() => {
    if (!selectedDoctorId && doctorOptions.length) setSelectedDoctorId(doctorOptions[0].id);
  }, [doctorOptions.length, selectedDoctorId]);

  const submitRecon = async () => {
    setMessage('');
    try {
      await apiPost('/fees-reconciliations', {
        assistantEmail: currentUser?.email,
        doctorId: effectiveDoctorId,
        date: selectedDate
      });
      setMessage('Fees reconciliation submitted to Doctor for approval.');
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <MobilePage title="Fees Reconciliation" subtitle="Submit day-end Cash and UPI totals to Doctor." action={<DatePickerControl value={selectedDate} onChange={setSelectedDate} />}>
      {message && <div className="notice">{message}</div>}
      <DoctorRadioSelector doctors={doctorOptions} selectedDoctorId={effectiveDoctorId} onChange={setSelectedDoctorId} />
      <FeesDashboard data={feesData} active="all" onChange={() => {}} />
      <button className="primary-button fees-open-button" type="button" onClick={submitRecon} disabled={!effectiveDoctorId || !(feesData?.summary?.totalCount)}>
        <Send size={17} />Submit Reconciliation to Doctor
      </button>
      <ReconciliationList reconciliations={reconData?.reconciliations || []} />
    </MobilePage>
  );
}

function DoctorFeesReconciliation() {
  const currentUser = getStoredUser();
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const { data, loading, error } = useApi(`/fees-reconciliations?doctorEmail=${encodeURIComponent(currentUser?.email || '')}`, refresh);

  const approveRecon = async (item) => {
    setMessage('');
    try {
      await apiPost(`/fees-reconciliations/${item.id}/approve`, { actor: currentUser?.name || 'Doctor' }, 'PATCH');
      setMessage('Fees reconciliation closed.');
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <MobilePage title="Fees Reconciliation" subtitle="Review open submissions and confirm receipt.">
      {message && <div className="notice">{message}</div>}
      {loading && <p className="muted">Loading reconciliations...</p>}
      {error && <p className="error-text">Unable to load reconciliations: {error.message}</p>}
      <ReconciliationList reconciliations={data?.reconciliations || []} onApprove={approveRecon} />
    </MobilePage>
  );
}

function ReconciliationList({ reconciliations = [], onApprove }) {
  if (!reconciliations.length) return <p className="muted">No fees reconciliation records found.</p>;
  return (
    <section className="reconciliation-list">
      {reconciliations.map((item) => (
        <article className="reconciliation-card" key={item.id}>
          <header>
            <div>
              <strong>{item.doctorName}</strong>
              <span>{item.date} | {item.assistantName}</span>
            </div>
            <Status value={item.status} />
          </header>
          <div className="fees-detail-grid">
            <div><span>Cash</span><strong>{formatCurrency(item.cashAmount)} ({item.cashCount})</strong></div>
            <div><span>UPI</span><strong>{formatCurrency(item.upiAmount)} ({item.upiCount})</strong></div>
            <div><span>Total</span><strong>{formatCurrency(item.totalAmount)}</strong></div>
            <div><span>Submitted</span><strong>{formatDateTime(item.submittedAt)}</strong></div>
          </div>
          {onApprove && item.status === 'Open' && (
            <button className="primary-button fees-open-button" type="button" onClick={() => onApprove(item)}>
              <CheckCircle2 size={17} />Confirm Fees Received
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

function AssistantCase() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromFees = location.state?.from === 'fees';
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const [completionNotice, setCompletionNotice] = useState('');
  const { data, loading } = useApi(`/cases/${caseId}`, refresh);
  const item = data?.case;
  const assistantEditLocked = item ? isDoctorFinalized(item) : false;
  const assistantCanCollectFees = item ? canAssistantCollectFees(item) : false;
  const assistantCanMarkComplete = item ? canAssistantMarkComplete(item) : false;
  const visitAlreadyComplete = item ? item.status === 'completed' || item.visitStatus === 'visit_complete' : false;
  const visitCancelled = item ? item.status === 'cancelled' || String(item.visitStatus || '').includes('cancelled') : false;
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [confirmFeesComplete, setConfirmFeesComplete] = useState(null);
  const [confirmCancelVisit, setConfirmCancelVisit] = useState(false);

  const updateBasic = async (event) => {
    event.preventDefault();
    if (assistantEditLocked) {
      setMessage('Doctor has completed this case. Assistant cannot edit it now; only Doctor can edit after confirmation.');
      return;
    }
    const payload = formToBasic(event.currentTarget);
    await apiPost(`/cases/${caseId}/basic`, payload, 'PATCH');
    setMessage('Patient basic details updated.');
    broadcastClinicRefresh();
    setRefresh((value) => value + 1);
  };

  const closeAssistantWork = async (event) => {
    event.preventDefault();
    if (assistantCanMarkComplete) {
      setConfirmFeesComplete({ alreadySaved: true });
      return;
    }
    if (!assistantCanCollectFees) {
      setMessage('Doctor has not completed analysis yet. Assistant can cancel the visit or wait for doctor completion.');
      return;
    }
    if (visitAlreadyComplete) {
      setMessage('Visit is already marked complete.');
      return;
    }
    const formData = new FormData(event.currentTarget);
    const receiptFile = formData.get('receiptCapture');
    if (formData.get('paymentMode') === 'UPI' && (!receiptFile || !receiptFile.name)) {
      setMessage('UPI payment requires receipt screenshot capture before the case can be completed.');
      return;
    }
    const payload = Object.fromEntries(formData);
    payload.receiptCapture = receiptFile?.name || '';
    setConfirmFeesComplete(payload);
  };

  const saveFeesAndComplete = async () => {
    if (!confirmFeesComplete) return;
    if (!confirmFeesComplete.alreadySaved) {
      await apiPost(`/cases/${caseId}/assistant-close`, confirmFeesComplete, 'PATCH');
    }
    await apiPost(`/cases/${caseId}/visit-complete`, { actor: 'Assistant' }, 'PATCH');
    setConfirmFeesComplete(null);
    setMessage('');
    setCompletionNotice('Fees saved and visit marked complete successfully.');
    broadcastClinicRefresh();
    setRefresh((value) => value + 1);
    if (cameFromFees) {
      window.setTimeout(() => navigate('/assistant/fees'), 1200);
    }
  };

  const cancelVisit = async () => {
    await apiPost(`/cases/${caseId}/cancel-visit`, { actor: 'Assistant' }, 'PATCH');
    setConfirmCancelVisit(false);
    setMessage('Visit cancelled.');
    broadcastClinicRefresh();
    setRefresh((value) => value + 1);
  };

  if (loading || !item) return <MobilePage title="Case"><p className="muted">Loading case...</p></MobilePage>;

  return (
    <MobilePage
      title={item.patient.name}
      subtitle={`${item.id} - ${formatStatus(item.status)}`}
      action={<button className="page-close-button" type="button" onClick={() => navigate(-1)}>Close</button>}
    >
      {message && <div className="notice">{message}</div>}
      {completionNotice && <div className="notice completion-notice"><CheckCircle2 size={18} />{completionNotice}</div>}
      {assistantEditLocked && (
        <div className="notice warning-notice">
          Doctor analysis is complete. Patient detail editing is locked for Assistant.
        </div>
      )}
      {!visitAlreadyComplete && !visitCancelled && !assistantCanCollectFees && !assistantCanMarkComplete && (
        <div className="notice warning-notice">
          Doctor analysis is pending. Assistant can cancel this visit, but cannot mark it complete.
        </div>
      )}
      <MobileSection title="Assistant Basic Details">
        <form className="mobile-form assistant-basic-compact" onSubmit={updateBasic}>
          <Input name="name" label="Patient name" value={item.patient.name} disabled={assistantEditLocked} />
          <Input name="mobile" label="Mobile" value={item.patient.mobile} disabled={assistantEditLocked} />
          <div className="inline-fields">
            <Input name="age" label="Age" value={item.patient.age} disabled={assistantEditLocked} />
            <SelectInput name="gender" label="Gender" value={item.patient.gender} options={GENDER_OPTIONS} disabled={assistantEditLocked} />
          </div>
          <Input name="city" label="City" value={item.patient.city} disabled={assistantEditLocked} />
          <Input name="address" label="Address" value={item.patient.address} wide disabled={assistantEditLocked} />
          <button className="secondary-button" type="submit" disabled={assistantEditLocked}><Save size={17} />Update Details</button>
        </form>
      </MobileSection>
      <CaseSummary item={item} hideHistory />
      <DoctorOutputPanel item={item} />
      <button className="secondary-button print-button" type="button" onClick={() => printPrescription(item)}>
        <Printer size={17} />
        Print Prescription
      </button>
      {(assistantCanCollectFees || assistantCanMarkComplete || visitAlreadyComplete) && (
      <MobileSection title="Fees Collection">
        <form className="mobile-form" onSubmit={closeAssistantWork}>
          <div className="inline-fields">
            <Input name="feesCollected" label="Fees collected" placeholder="1500" required disabled={!assistantCanCollectFees || visitAlreadyComplete} />
            <label className="field">
              <span>Payment mode<b className="required-star">*</b></span>
              <select name="paymentMode" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} required disabled={!assistantCanCollectFees || visitAlreadyComplete}>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
              </select>
            </label>
          </div>
          {paymentMode === 'UPI' && (
            <label className="field wide receipt-capture-field">
              <span>UPI receipt screenshot capture<b className="required-star">*</b></span>
              <input name="receiptCapture" type="file" accept="image/*" capture="environment" disabled={!assistantCanCollectFees || visitAlreadyComplete} />
              <small>Open mobile camera and capture the payment receipt screenshot to enable completion.</small>
            </label>
          )}
          <Input name="assistantNotes" label="Assistant notes" disabled={!assistantCanCollectFees || visitAlreadyComplete} />
          <div className="notice warning-notice fees-submit-warning">
            Once submitted, the visit will be marked completed and cannot be edited by Assistant.
          </div>
          <button className="primary-button" type="submit" disabled={!(assistantCanCollectFees || assistantCanMarkComplete) || visitAlreadyComplete}>
            <CheckCircle2 size={17} />Save and Mark Visit Complete
          </button>
        </form>
      </MobileSection>
      )}
      {visitAlreadyComplete ? (
        <div className="notice">Visit is complete. No further assistant action is required.</div>
      ) : visitCancelled ? (
        <div className="notice warning-notice">Visit is cancelled.</div>
      ) : !assistantCanCollectFees && !assistantCanMarkComplete && (
        <button className="cancel-visit-button" type="button" onClick={() => setConfirmCancelVisit(true)}>
          <Trash2 size={18} />
          Cancel Visit
        </button>
      )}
      {confirmFeesComplete && (
        <div className="confirm-overlay fixed-confirm" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <strong>Complete visit?</strong>
            <p>Once submitted, this visit will be marked as completed and Assistant cannot edit it again.</p>
            <div>
              <button type="button" onClick={() => setConfirmFeesComplete(null)}>Cancel</button>
              <button type="button" onClick={saveFeesAndComplete}>Confirm Submit</button>
            </div>
          </div>
        </div>
      )}
      {confirmCancelVisit && (
        <div className="confirm-overlay fixed-confirm" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <strong>Cancel visit?</strong>
            <p>Are you sure you want to cancel this scheduled appointment? The appointment time slot will be released.</p>
            <div>
              <button type="button" onClick={() => setConfirmCancelVisit(false)}>No</button>
              <button type="button" onClick={cancelVisit}>Yes, Cancel Visit</button>
            </div>
          </div>
        </div>
      )}
    </MobilePage>
  );
}

function DoctorQueue() {
  const currentUser = getStoredUser();
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [tab, setTab] = useState('my');
  const dashboardStatus = tab === 'my' ? 'doctor_queue' : 'all';
  const doctorId = tab === 'my' ? currentUser?.id : '';
  const mappedScope = tab === 'overall' ? currentUser?.email : '';
  const pageTitle = tab === 'my' ? 'My Queue' : 'Overall Queue';
  return (
    <MobilePage title={<span className="doctor-queue-title">{pageTitle}</span>} action={<DatePickerControl value={selectedDate} onChange={setSelectedDate} />}>
      <div className="doctor-tabs">
        <button className={tab === 'my' ? 'active' : ''} type="button" onClick={() => setTab('my')}>My Queue</button>
        <button className={tab === 'overall' ? 'active' : ''} type="button" onClick={() => setTab('overall')}>Overall Queue</button>
      </div>
      <TodayStatusDashboard
        selectedDate={selectedDate}
        activeStatus={dashboardStatus}
        onStatusChange={() => {}}
        label={tab === 'my' ? 'My Queue - Live' : 'Overall Queue - Live'}
        scopeStatus={tab === 'my' ? 'doctor_queue' : ''}
        doctorId={doctorId}
        doctorEmail={mappedScope}
      />
      <AppointmentCalendar compact role="doctor" statusFilter={tab === 'my' ? 'doctor_queue' : 'all'} selectedDate={selectedDate} doctorId={doctorId} doctorEmail={mappedScope} />
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
  const [message, setMessage] = useState('');
  const [confirmDoctorEdit, setConfirmDoctorEdit] = useState(null);
  const [confirmDoctorCancel, setConfirmDoctorCancel] = useState(false);
  const [confirmDoctorSubmit, setConfirmDoctorSubmit] = useState(null);

  useEffect(() => {
    if (item?.doctor?.prescriptionItems?.length) {
      setPrescriptionItems(item.doctor.prescriptionItems);
    }
  }, [item?.id]);

  const saveDoctorCase = async (payload) => {
    payload.testsRequested = selectedTests.map((test) => test.name);
    payload.prescriptionItems = prescriptionItems;
    try {
      await apiPost(`/cases/${caseId}/doctor-submit`, payload, 'PATCH');
      setConfirmDoctorSubmit(null);
      broadcastClinicRefresh();
      navigate('/doctor/queue');
    } catch (error) {
      setMessage(error.message);
      setConfirmDoctorEdit(null);
    }
  };

  const submitDoctor = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    if (isDoctorFinalized(item)) {
      setConfirmDoctorEdit(payload);
      return;
    }
    setConfirmDoctorSubmit(payload);
  };

  const cancelDoctorCase = async () => {
    try {
      await apiPost(`/cases/${caseId}/doctor-cancel`, { actor: 'Doctor' }, 'PATCH');
      broadcastClinicRefresh();
      navigate('/doctor/queue');
    } catch (error) {
      setMessage(error.message);
      setConfirmDoctorCancel(false);
    }
  };

  if (loading || !item) return <MobilePage title="Case"><p className="muted">Loading case...</p></MobilePage>;

  return (
    <MobilePage title={item.patient.name} subtitle={`${item.patient.mobile} - ${item.patient.city}`}>
      {message && <div className="notice warning-notice">{message}</div>}
      <CaseSummary item={item} compact />
      <form className="mobile-form" onSubmit={submitDoctor}>
        <MobileSection title="Analysis">
          <TextAreaInput name="diagnosis" label="Diagnosis / analysis" value={item.doctor?.diagnosis} required maxLength={DOCTOR_TEXT_LIMIT} />
          <TextAreaInput name="treatmentPlan" label="Treatment plan" value={item.doctor?.treatmentPlan} required maxLength={DOCTOR_TEXT_LIMIT} />
          <SelectInput name="treatmentStatus" label="Treatment status" value={item.doctor?.treatmentStatus || 'In Progress'} options={TREATMENT_STATUS_OPTIONS} required wide />
          <TextAreaInput name="doctorNotes" label="Doctor notes" value={item.doctor?.doctorNotes} maxLength={DOCTOR_TEXT_LIMIT} />
        </MobileSection>
        <MobileSection title="Tests and Prescription">
          <TestSelector selectedTests={selectedTests} setSelectedTests={setSelectedTests} />
          <MedicineSelector prescriptionItems={prescriptionItems} setPrescriptionItems={setPrescriptionItems} />
          <TextAreaInput name="prescriptionForm" label="Prescription form" value={item.doctor?.prescriptionForm} placeholder="RCT Pain Management" maxLength={DOCTOR_TEXT_LIMIT} />
          <PrescriptionPreview item={item} selectedTests={selectedTests} prescriptionItems={prescriptionItems} />
          <DateInput name="nextVisitDate" label="Next visit date" value={item.doctor?.nextVisitDate} />
        </MobileSection>
        <div className="sticky-actions">
          <button className="secondary-button" type="button" onClick={() => printPrescription({ ...item, doctor: { ...item.doctor, testsRequested: selectedTests.map((test) => test.name), prescriptionItems } })}><Printer size={18} />Print</button>
          <button className="primary-button" type="submit"><CheckCircle2 size={18} />Submit Case</button>
          <button className="secondary-button danger-action" type="button" onClick={() => setConfirmDoctorCancel(true)}><Trash2 size={18} />Cancel Case</button>
        </div>
      </form>
      {confirmDoctorSubmit && (
        <div className="confirm-overlay fixed-confirm" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <strong>Submit case?</strong>
            <p>Once submitted, this case will move to Fees Collection for Assistant billing.</p>
            <div>
              <button type="button" onClick={() => setConfirmDoctorSubmit(null)}>Cancel</button>
              <button type="button" onClick={() => saveDoctorCase(confirmDoctorSubmit)}>Confirm Submit</button>
            </div>
          </div>
        </div>
      )}
      {confirmDoctorEdit && (
        <div className="confirm-overlay fixed-confirm" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <strong>Confirm doctor edit</strong>
            <p>This case is already marked Doctor Done or Complete. Do you want to update the doctor analysis and prescription?</p>
            <div>
              <button type="button" onClick={() => setConfirmDoctorEdit(null)}>Cancel</button>
              <button type="button" onClick={() => saveDoctorCase(confirmDoctorEdit)}>Confirm Edit</button>
            </div>
          </div>
        </div>
      )}
      {confirmDoctorCancel && (
        <div className="confirm-overlay fixed-confirm" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <strong>Cancel case?</strong>
            <p>Are you sure you want to cancel this case? It will be removed from active consultation and cannot be completed by Assistant.</p>
            <div>
              <button type="button" onClick={() => setConfirmDoctorCancel(false)}>No</button>
              <button type="button" onClick={cancelDoctorCase}>Yes, Cancel Case</button>
            </div>
          </div>
        </div>
      )}
    </MobilePage>
  );
}

function MobileAnalytics({ role }) {
  if (role === 'doctor') return <DoctorDashboard />;

  const [refresh, setRefresh] = useState(0);
  const { data: dashboard } = useApi('/dashboard', refresh);
  const { data: analytics } = useApi('/analytics', refresh);
  useEffect(() => {
    const refreshDashboard = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-refresh', refreshDashboard);
    window.addEventListener('smile-records-queue-change', refreshDashboard);
    window.addEventListener('smile-records-fees-change', refreshDashboard);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshDashboard);
      window.removeEventListener('smile-records-queue-change', refreshDashboard);
      window.removeEventListener('smile-records-fees-change', refreshDashboard);
    };
  }, []);
  const metricValue = (label) => dashboard?.metrics?.find((item) => item.label === label)?.value || 0;
  const assistantCards = [
    { label: 'Patients', value: metricValue('Total Patients') },
    { label: 'Ready Billing', value: metricValue('Assistant Work') },
    { label: 'Completed', value: metricValue('Completed Cases') },
    { label: 'Approvals', value: metricValue('Pending Approvals') }
  ];
  const doctorCards = [
    { label: 'Doctor Queue', value: metricValue('Doctor Queue') },
    { label: 'Now Serving', value: metricValue('Now Serving') },
    { label: 'Completed', value: metricValue('Completed Cases') },
    { label: 'Audit Events', value: metricValue('Audit Events') }
  ];
  return (
    <MobilePage title="Dashboard">
      <section className="mobile-section">
        <h3>Assistant Dashboard</h3>
        <div className="mobile-analytics-grid">
          {assistantCards.map((card) => (
            <article className="mobile-analytics-card" key={card.label}>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="mobile-section">
        <h3>Doctor Dashboard</h3>
        <div className="mobile-analytics-grid">
          {doctorCards.map((card) => (
            <article className="mobile-analytics-card" key={card.label}>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="mobile-section">
        <h3>Case Flow</h3>
        <div className="mobile-bars">
          {(analytics?.charts?.[0]?.data || []).map((item) => (
            <div className="mobile-bar-row" key={item.label}>
              <span>{item.label}</span>
              <div><i style={{ width: `${Math.max(8, item.value * 18)}%` }} /></div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="mobile-section">
        <h3>Quick Actions</h3>
        <div className="quick-action-grid">
          <NavLink to={role === 'doctor' ? '/doctor/queue' : '/assistant/intake'} className="secondary-button">
            <ClipboardList size={17} />Open Home
          </NavLink>
          {role === 'assistant' && (
            <NavLink to="/assistant/fees" className="secondary-button">
              <ReceiptIndianRupee size={17} />Fees Collection
            </NavLink>
          )}
        </div>
      </section>
    </MobilePage>
  );
}

function DoctorDashboard() {
  const [currentUser] = useSyncedCurrentUser();
  const [refresh, setRefresh] = useState(0);
  const [fromDate, setFromDate] = useState(todayDate());
  const [toDate, setToDate] = useState(todayDate());
  const rangeError = validateDashboardRange(fromDate, toDate);
  const dashboardPath = `/doctor-dashboard?doctorEmail=${encodeURIComponent(currentUser?.email || '')}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
  const { data, loading, error } = useApi(dashboardPath, refresh);

  useEffect(() => {
    const refreshDashboard = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-refresh', refreshDashboard);
    window.addEventListener('smile-records-queue-change', refreshDashboard);
    window.addEventListener('smile-records-fees-change', refreshDashboard);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshDashboard);
      window.removeEventListener('smile-records-queue-change', refreshDashboard);
      window.removeEventListener('smile-records-fees-change', refreshDashboard);
    };
  }, []);

  const metrics = data?.metrics || {};
  const amountCollected = metrics.amountCollected || {};
  const cards = [
    { label: 'Patient Served', value: metrics.patientServed || 0, tone: 'served' },
    { label: 'Open Cases', value: metrics.openCases || 0, tone: 'open' },
    { label: 'Cancel Cases', value: metrics.cancelledCases || 0, tone: 'cancel' },
    { label: 'Cash Collected', value: formatCurrency(amountCollected.cashAmount), tone: 'cash' },
    { label: 'UPI Collected', value: formatCurrency(amountCollected.upiAmount), tone: 'upi' }
  ];

  return (
    <MobilePage title="Dashboard">
      <section className="doctor-dashboard-range mobile-section">
        <header>
          <div>
            <strong>Doctor Dashboard</strong>
            <span>Select date range up to 366 days</span>
          </div>
          <CalendarDays size={20} />
        </header>
        <div className="dashboard-date-range">
          <label>
            <span>From</span>
            <input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
        </div>
        {rangeError && <p className="error-text compact-note">{rangeError}</p>}
      </section>

      <section className="mobile-section">
        <div className="doctor-dashboard-grid">
          {cards.map((card) => (
            <article className={`doctor-dashboard-card ${card.tone}`} key={card.label}>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="mobile-section">
        <h3>Daily Summary</h3>
        {loading && <p className="muted">Loading doctor dashboard...</p>}
        {(error || rangeError) && <p className="error-text">{rangeError || `Unable to load dashboard: ${error.message}`}</p>}
        {!loading && !error && !rangeError && (
          <div className="doctor-daily-list">
            {(data?.daily || []).filter((day) => (
              day.patientServed || day.openCases || day.cancelledCases || day.cashAmount || day.upiAmount
            )).map((day) => (
              <article className="doctor-daily-row" key={day.date}>
                <div>
                  <strong>{formatDateOnly(day.date)}</strong>
                  <span>{day.openCases} open | {day.patientServed} served | {day.cancelledCases} cancelled</span>
                </div>
                <b>{formatCurrency(day.cashAmount)} Cash</b>
                <b>{formatCurrency(day.upiAmount)} UPI</b>
              </article>
            ))}
            {!(data?.daily || []).some((day) => day.patientServed || day.openCases || day.cancelledCases || day.cashAmount || day.upiAmount) && (
              <p className="muted">No doctor activity found for selected date range.</p>
            )}
          </div>
        )}
      </section>
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
      broadcastClinicRefresh();
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

function AssistantBottomDock({ feesPendingCount = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState(location.pathname.includes('/assistant/fees') ? 'fees' : 'home');

  useEffect(() => {
    if (location.pathname.includes('/assistant/fees')) setActiveTab('fees');
    else if (!location.pathname.includes('/assistant/intake')) setActiveTab('');
  }, [location.pathname]);

  useEffect(() => {
    const setNew = () => setActiveTab('new');
    const setHome = () => setActiveTab('home');
    window.addEventListener('smile-records-open-intake', setNew);
    window.addEventListener('smile-records-show-appointments', setHome);
    return () => {
      window.removeEventListener('smile-records-open-intake', setNew);
      window.removeEventListener('smile-records-show-appointments', setHome);
    };
  }, []);

  const run = async (path, success) => {
    try {
      await apiPost(path, {}, 'PATCH');
      setMessage(success);
      broadcastClinicRefresh();
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
        className={activeTab === 'home' ? 'active' : ''}
        type="button"
        onClick={() => {
          setActiveTab('home');
          navigate('/assistant/intake');
          focusPageTop();
          setTimeout(() => window.dispatchEvent(new Event('smile-records-show-appointments')), 0);
        }}
      >
        <Home size={18} />
        <span>Home</span>
      </button>
      <button className={activeTab === 'fees' ? 'active' : ''} type="button" onClick={() => { setActiveTab('fees'); navigate('/assistant/fees'); focusPageTop(); }}>
        <ReceiptIndianRupee size={18} />
        {feesPendingCount > 0 && <span className="dock-tab-badge">{feesPendingCount}</span>}
        <span>Fees</span>
      </button>
      <button
        className={activeTab === 'new' ? 'active' : ''}
        type="button"
        onClick={() => {
          setActiveTab('new');
          navigate('/assistant/intake');
          focusPageTop();
          setTimeout(() => window.dispatchEvent(new Event('smile-records-open-intake')), 0);
        }}
      >
        <UserRoundPlus size={18} />
        <span>New</span>
      </button>
    </div>
  );
}

function DoctorBottomDock({ tabs = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="assistant-bottom-dock doctor-bottom-dock">
      <button className={location.pathname === '/doctor/queue' ? 'active' : ''} type="button" onClick={() => { navigate('/doctor/queue'); focusPageTop(); }}>
        <Home size={18} />
        <span>Home</span>
      </button>
      {tabs.map((tab) => (
        <button className={location.pathname === tab.to ? 'active' : ''} type="button" key={tab.to} onClick={() => { navigate(tab.to); focusPageTop(); }}>
          <tab.icon size={18} />
          {tab.badge > 0 && <span className="dock-tab-badge">{tab.badge}</span>}
          <span>{tab.label}</span>
        </button>
      ))}
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

function AppointmentCalendar({ compact, selectedDate, statusFilter = 'all', role = 'assistant', doctorId = '', doctorEmail = '' }) {
  const [refresh, setRefresh] = useState(0);
  const appointmentPath = `/appointments?date=${encodeURIComponent(selectedDate)}${doctorId ? `&doctorId=${encodeURIComponent(doctorId)}` : ''}${doctorEmail ? `&doctorEmail=${encodeURIComponent(doctorEmail)}&scope=mapped` : ''}`;
  const { data, loading } = useApi(appointmentPath, refresh);
  const [appointments, setAppointments] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (data?.appointments) setAppointments(data.appointments);
  }, [data]);

  useEffect(() => {
    const refreshAppointments = () => setRefresh((value) => value + 1);
    window.addEventListener('smile-records-refresh', refreshAppointments);
    window.addEventListener('smile-records-appointments-change', refreshAppointments);
    return () => {
      window.removeEventListener('smile-records-refresh', refreshAppointments);
      window.removeEventListener('smile-records-appointments-change', refreshAppointments);
    };
  }, []);

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
    if (action === 'locked-edit') {
      setMessage('Closed case cannot be edited.');
      return;
    }
    if (action === 'edit') {
      if (!item.caseId) {
        setMessage('This appointment is not linked with a patient case yet.');
        return;
      }
      navigate(role === 'doctor' ? `/doctor/case/${item.caseId}` : `/assistant/case/${item.caseId}`);
      return;
    }
    await apiPost(`/appointments/${item.id}/${action}`, { actor: role === 'doctor' ? 'Doctor' : 'Assistant' }, 'PATCH');
    setMessage('');
    broadcastClinicRefresh();
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

  const visibleAppointments = appointments.filter((item) => {
    const statusMatches = statusFilter === 'all' || item.status === statusFilter;
    const doctorMatches = !doctorId || item.doctorId === doctorId;
    return statusMatches && doctorMatches;
  });
  const feesPendingAppointments = visibleAppointments.filter((item) => isFeesPendingAppointment(item));
  const openAppointments = visibleAppointments.filter((item) => isOpenAppointment(item) && !isFeesPendingAppointment(item));
  const closedAppointments = visibleAppointments.filter((item) => isClosedAppointment(item));
  const cancelledAppointments = visibleAppointments.filter((item) => isCancelledAppointment(item));
  const editAppointment = (item) => {
    if (role === 'doctor') {
      if (item.caseId && !isCancelledAppointment(item)) navigate(`/doctor/case/${item.caseId}`);
      else setMessage('This appointment is not linked with a patient case yet.');
      return;
    }
    if (isClosedAppointment(item) || isCancelledAppointment(item)) {
      setMessage('Closed or cancelled case cannot be edited.');
      return;
    }
    if (isDoctorLockedAppointment(item)) {
      setMessage('Doctor has completed this case. Assistant cannot edit it now; only Doctor can edit after confirmation.');
      return;
    }
    setConfirmAction({ item, action: 'edit', message: `Are you sure you want to edit ${item.patientName}'s details?` });
  };

  const renderRows = (rows, sectionName, offset = 0) => (
    <div className="appointment-section">
      <header>
        <strong>{sectionName}</strong>
        <span>{rows.length}</span>
      </header>
      {rows.length ? rows.map((item, index) => (
        <AppointmentRow
          key={item.id}
          item={item}
          index={index + offset}
          role={role}
          dragIndex={dragIndex}
          setDragIndex={setDragIndex}
          moveAppointment={moveAppointment}
          editAppointment={editAppointment}
          updateAppointment={updateAppointment}
          navigate={navigate}
        />
      )) : <p className="muted">No {sectionName.toLowerCase()}.</p>}
    </div>
  );

  return (
    <section className={compact ? 'appointment-card compact' : 'appointment-card'}>
      <div className="appointment-list">
        {loading && <p className="muted">Loading appointments...</p>}
        {message && <p className="queue-message">{message}</p>}
        {renderRows(openAppointments, role === 'assistant' ? 'Scheduled' : 'Open Cases')}
        {renderRows(feesPendingAppointments, 'Fees Collection', openAppointments.length)}
        {renderRows(closedAppointments, 'Closed Cases', openAppointments.length + feesPendingAppointments.length)}
        {renderRows(cancelledAppointments, 'Cancelled Cases', openAppointments.length + feesPendingAppointments.length + closedAppointments.length)}
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

function AppointmentRow({ item, index, role, dragIndex, setDragIndex, moveAppointment, editAppointment, updateAppointment, navigate }) {
  const locked = isClosedAppointment(item) || isCancelledAppointment(item);
  const statusText = appointmentStatusLabel(item);
  const showStatus = !(role === 'doctor' && item.status === 'doctor_queue');
  return (
    <div
      className={`${dragIndex === index ? 'appointment-row dragging' : 'appointment-row'}${locked ? ' locked-row' : ''}`}
      draggable={!locked}
      onDragStart={() => !locked && setDragIndex(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => !locked && moveAppointment(dragIndex, index)}
      onDragEnd={() => setDragIndex(null)}
      onDoubleClick={() => editAppointment(item)}
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
        {showStatus && <Status value={statusText} />}
        <AppointmentAction item={item} role={role} onAction={updateAppointment} />
      </div>
    </div>
  );
}

function AppointmentAction({ item, role, onAction }) {
  if (isClosedAppointment(item) || isCancelledAppointment(item)) {
    return null;
  }
  if (role === 'doctor') {
    if (item.status === 'doctor_queue' || item.status === 'waiting') {
      return (
        <div className="appointment-action-stack doctor-open-actions">
          <button
            className="send-appointment-button icon-action muted-action"
            type="button"
            title="Send back to Assistant queue"
            aria-label="Send back to Assistant queue"
            onClick={(event) => onAction(event, item, 'recall-to-waiting', 'Send this case back to Assistant queue?')}
            draggable={false}
          >
            <Send size={13} />
          </button>
          <button className="send-appointment-button" type="button" onClick={(event) => onAction(event, item, 'edit')} draggable={false}>
            Open
          </button>
        </div>
      );
    }
    if (item.status === 'doctor_done' || item.status === 'complete') {
      return null;
    }
  }

  if (item.status === 'doctor_queue') {
    return (
      <div className="appointment-action-stack">
        <button className="send-appointment-button muted-action" type="button" onClick={(event) => onAction(event, item, 'recall-to-waiting', 'Recall this patient from Doctor Queue back to Waiting Queue?')} draggable={false}>
          Recall
        </button>
      </div>
    );
  }

  if (item.status === 'doctor_done') {
    return (
      <div className="appointment-action-stack">
        <button className="send-appointment-button muted-action" type="button" onClick={(event) => onAction(event, item, 'edit')} draggable={false}>
          Fees
        </button>
      </div>
    );
  }

  if (item.status === 'complete') {
    return (
      <div className="appointment-action-stack">
        <button className="send-appointment-button muted-action" type="button" onClick={(event) => onAction(event, item, 'recall-to-waiting', 'Move completed appointment back to Waiting Queue?')} draggable={false}>
          Reopen
        </button>
      </div>
    );
  }

  return (
    <div className="appointment-action-stack">
      <button className="send-appointment-button" type="button" onClick={(event) => onAction(event, item, 'send-to-doctor')} draggable={false}>
        <Send size={10} />
        Send
      </button>
    </div>
  );
}

function AdminShell() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useSyncedCurrentUser();
  const { data } = useApi('/users');
  const pendingCount = (data?.users || []).filter((user) => user.status === 'Pending').length;
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate('/login');
  };
  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/cases', label: 'Cases', icon: ClipboardList },
    { to: '/admin/patients', label: 'Patients', icon: Users },
    { to: '/admin/approvals', label: 'Authorization', icon: UserCheck },
    { to: '/admin/hospitals', label: 'Hospitals', icon: Database },
    { to: '/admin/doctor-assistant-mappings', label: 'Doctor Assistant Mapping', icon: Users },
    { to: '/admin/roles', label: 'Roles', icon: ShieldCheck },
    { to: '/admin/medicines', label: 'Medicines', icon: Pill },
    { to: '/admin/tests', label: 'X-rays & Tests', icon: FileSearch },
    { to: '/admin/templates', label: 'Prescription Forms', icon: NotebookTabs },
    { to: '/admin/analytics', label: 'Dashboard Data', icon: Gauge },
    { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
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
          <div>
            <p className="eyebrow">{getGreeting()}, {displayUserName(currentUser, 'Admin')}</p>
            <h1>Admin Panel</h1>
          </div>
          <div className="top-actions">
            <NavLink className="secondary-button compact-action" to="/admin/analytics"><Gauge size={17} />Dashboard</NavLink>
            <NavLink className="secondary-button compact-action notification-button" to="/admin/approvals">
              <Bell size={17} />
              Requests
              {pendingCount > 0 && <span className="notification-count">{pendingCount}</span>}
            </NavLink>
            <button className="secondary-button compact-action" type="button" onClick={logout}><LogOut size={17} />Logout</button>
            <ProfilePhotoButton user={currentUser} onUserChange={setCurrentUser} compact />
            <div className="user-chip">
              <span>{currentUser?.profilePhoto ? <img src={currentUser.profilePhoto} alt="" /> : userInitials(currentUser)}</span>
              <div><strong>{displayUserName(currentUser, 'Clinic Admin')}</strong><small>{currentUser?.role || 'Super Admin'}</small></div>
            </div>
          </div>
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

function AdminApprovals() {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const [approvedFilter, setApprovedFilter] = useState('all');
  const { data, loading, error } = useApi('/users', refresh);
  const pending = (data?.users || []).filter((user) => user.status === 'Pending');
  const approved = (data?.users || []).filter((user) => user.status === 'Active');
  const approvedVisible = approved.filter((user) => {
    if (approvedFilter === 'doctors') return user.role === 'Doctor';
    if (approvedFilter === 'assistants') return user.role === 'Assistant';
    return true;
  });

  const approve = async (event, id) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    await apiPost(`/users/${id}/approve`, { ...payload, actor: 'Admin' }, 'PATCH');
    setMessage('User approved and role assigned.');
    setRefresh((value) => value + 1);
  };

  const reject = async (id) => {
    await apiPost(`/users/${id}/reject`, { actor: 'Admin' }, 'PATCH');
    setMessage('Access request rejected.');
    setRefresh((value) => value + 1);
  };

  return (
    <Page title="User Authorization" eyebrow="Admin approval queue">
      {message && <div className="notice">{message}</div>}
      <Panel title={`Login Requests (${pending.length})`} icon={UserCheck}>
        {loading && <p className="muted">Loading requests...</p>}
        {error && <p className="error-text">Unable to load requests: {error.message}</p>}
        {!loading && !pending.length && <p className="muted">No pending login requests.</p>}
        <div className="approval-list">
          {pending.map((user) => (
            <article className="approval-card" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                <small>Requested role: {user.requestedRole || 'Not selected'}</small>
                <small>Hospital: {user.hospitalName || 'Not selected'}</small>
              </div>
              <form className="approval-actions" onSubmit={(event) => approve(event, user.id)}>
                <select name="role" defaultValue={user.requestedRole || ''} required>
                  <option value="" disabled>Assign role</option>
                  <option value="Assistant">Assistant</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Viewer">Viewer</option>
                </select>
                <button className="primary-button" type="submit"><UserCheck size={16} />Approve</button>
                <button className="secondary-button" type="button" onClick={() => reject(user.id)}>Reject</button>
              </form>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title={`Approved Users (${approved.length})`} icon={Users}>
        <div className="segmented-toolbar">
          <button className={approvedFilter === 'all' ? 'active' : ''} type="button" onClick={() => setApprovedFilter('all')}>View All Records</button>
          <button className={approvedFilter === 'doctors' ? 'active' : ''} type="button" onClick={() => setApprovedFilter('doctors')}>Approved Doctors</button>
          <button className={approvedFilter === 'assistants' ? 'active' : ''} type="button" onClick={() => setApprovedFilter('assistants')}>Approved Assistants</button>
        </div>
        {loading && <p className="muted">Loading approved users...</p>}
        {!loading && !approvedVisible.length && <p className="muted">No approved users found.</p>}
        <div className="approval-list">
          {approvedVisible.map((user) => (
            <article className="approval-card approved-user-card" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                <small>Role: {user.role} | {user.hospitalName || 'No hospital'}</small>
              </div>
              <Status value="Active" />
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="All Users" icon={Users}><DataList endpoint="/users" /></Panel>
    </Page>
  );
}

function AdminPatients() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { data, loading, error } = useApi('/patients');
  const patients = data?.patients || [];
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePatients = patients.filter((patient) => {
    if (!normalizedQuery) return true;
    return [
      patient.name,
      patient.mobile,
      patient.id,
      patient.address,
      patient.city,
      patient.chiefComplaint
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  });
  return (
    <Page title="Patients" eyebrow="Admin web module">
      <Panel title={`Patient Records (${visiblePatients.length}/${patients.length})`} icon={Users}>
        <div className="admin-search-bar">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient by name, mobile number, code, address or complaint" />
        </div>
        {loading && <p className="muted">Loading patient records...</p>}
        {error && <p className="error-text">Backend unavailable: {error.message}</p>}
        {!loading && !visiblePatients.length && <p className="muted">No patient records found.</p>}
        <div className="data-list">
          {visiblePatients.map((patient) => (
            <button className="data-row patient-admin-row" type="button" key={patient.id} onClick={() => navigate(`/admin/patients/${patient.id}`)}>
              <strong>{patient.name}</strong>
              <span>{patient.mobile || '-'} | Age {patient.age || '-'} | {patient.gender || '-'} | {patient.address || patient.city || 'No address'}</span>
              <small>{patient.chiefComplaint || patient.treatmentStatus || 'No clinical summary'} | Code: {patient.id}</small>
            </button>
          ))}
        </div>
      </Panel>
    </Page>
  );
}

function AdminPatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useApi(`/patients/${patientId}`);
  const patient = data?.patient;
  return (
    <Page title={patient?.name || 'Patient Details'} eyebrow="Admin patient record">
      <div className="page-heading-action">
        <button className="secondary-button compact-action" type="button" onClick={() => navigate('/admin/patients')}>Close</button>
      </div>
      {loading && <p className="muted">Loading patient details...</p>}
      {error && <p className="error-text">Backend unavailable: {error.message}</p>}
      {patient && (
        <div className="two-column">
          <Panel title="Basic Details" icon={Users}>
            <div className="admin-detail-grid">
              <div><span>Mobile</span><strong>{patient.mobile || '-'}</strong></div>
              <div><span>Age / Gender</span><strong>{patient.age || '-'} / {patient.gender || '-'}</strong></div>
              <div><span>Address</span><strong>{patient.address || patient.city || '-'}</strong></div>
              <div><span>Treatment Status</span><strong>{patient.treatmentStatus || '-'}</strong></div>
              <div><span>Complaint</span><strong>{patient.chiefComplaint || '-'}</strong></div>
              <div><span>Tooth</span><strong>{patient.toothNumber || '-'}</strong></div>
              <div><span>Medical Flags</span><strong>{Array.isArray(patient.medicalFlags) ? patient.medicalFlags.join(', ') : patient.medicalFlags || '-'}</strong></div>
              <div><span>Last Visit</span><strong>{patient.lastVisitDate || '-'}</strong></div>
            </div>
          </Panel>
          <Panel title="Visit History" icon={ClipboardList}>
            <PatientHistoryDays historyDays={patient.historyDays || []} />
          </Panel>
        </div>
      )}
    </Page>
  );
}

function DoctorAssistantMappingAdmin() {
  const [query, setQuery] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useApi('/doctor-assistant-mappings-master', refresh);
  const doctors = data?.doctors || [];
  const assistants = data?.assistants || [];
  const mappings = data?.mappings || [];
  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId);
  const allowedAssistants = selectedDoctor
    ? assistants.filter((assistant) => assistant.hospitalId === selectedDoctor.hospitalId)
    : assistants;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleMappings = mappings.filter((mapping) => {
    if (!normalizedQuery) return true;
    return [
      mapping.doctorName,
      mapping.doctorEmail,
      mapping.hospitalName,
      ...(mapping.assistants || []).flatMap((assistant) => [assistant.name, assistant.email])
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  });

  useEffect(() => {
    if (selectedDoctor && assistantId) {
      const assistant = assistants.find((item) => item.id === assistantId);
      if (assistant && assistant.hospitalId !== selectedDoctor.hospitalId) setAssistantId('');
    }
  }, [selectedDoctor?.id, assistantId, assistants]);

  const saveMapping = async (event) => {
    event.preventDefault();
    setMessage('');
    if (!doctorId || !assistantId) {
      setMessage('Select Doctor and Assistant mapping.');
      return;
    }
    const existing = mappings.find((mapping) => mapping.doctorId === doctorId);
    const assistantIds = [...new Set([...(existing?.assistantIds || []), assistantId])];
    try {
      await apiPost('/doctor-assistant-mappings', { doctorId, assistantIds, actor: 'Admin' });
      setMessage('Doctor Assistant mapping saved.');
      setDoctorId('');
      setAssistantId('');
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <Page title="Doctor Assistant Mapping" eyebrow="Admin master">
      {message && <div className="notice">{message}</div>}
      <Panel title="Add Mapping" icon={Users}>
        <form className="admin-inline-form mapping-admin-form" onSubmit={saveMapping}>
          <label className="field">
            <span>Doctor<b className="required-star">*</b></span>
            <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
              <option value="" disabled>Select doctor</option>
              {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} - {doctor.hospitalName}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Assistant<b className="required-star">*</b></span>
            <select value={assistantId} onChange={(event) => setAssistantId(event.target.value)} required disabled={!doctorId}>
              <option value="" disabled>{doctorId ? 'Select assistant' : 'Select doctor first'}</option>
              {allowedAssistants.map((assistant) => <option key={assistant.id} value={assistant.id}>{assistant.name} - {assistant.hospitalName}</option>)}
            </select>
          </label>
          <button className="primary-button" type="submit"><Save size={16} />Save Mapping</button>
        </form>
      </Panel>
      <Panel title={`Mappings (${visibleMappings.length}/${mappings.length})`} icon={Users}>
        <div className="admin-search-bar">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by doctor, assistant, email or hospital" />
        </div>
        {loading && <p className="muted">Loading mappings...</p>}
        {error && <p className="error-text">Unable to load mappings: {error.message}</p>}
        {!loading && !visibleMappings.length && <p className="muted">No mapping records found.</p>}
        <div className="data-list">
          {visibleMappings.map((mapping) => (
            <div className="data-row mapping-admin-row" key={mapping.id}>
              <strong>{mapping.doctorName}</strong>
              <span>{mapping.doctorEmail} | {mapping.hospitalName}</span>
              <small>
                Assistants: {mapping.assistants?.length
                  ? mapping.assistants.map((assistant) => `${assistant.name} (${assistant.email})`).join(', ')
                  : 'No assistants mapped'}
              </small>
            </div>
          ))}
        </div>
      </Panel>
    </Page>
  );
}

function HospitalMasterAdmin() {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const { data, loading, error } = useApi('/hospitals', refresh);

  const addHospital = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await apiPost('/hospitals', { ...payload, actor: 'Admin' });
      event.currentTarget.reset();
      setMessage(`Hospital added to master with code ${result.hospital.code}.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteHospital = async (id) => {
    const response = await fetch(apiUrl(`/hospitals/${id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: 'Admin' })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.error || 'Unable to delete hospital.');
      return;
    }
    setMessage('Hospital deleted.');
    setPendingDelete(null);
    setRefresh((value) => value + 1);
  };

  return (
    <Page title="Hospital Master" eyebrow="Admin web module">
      {message && <div className="notice">{message}</div>}
      <Panel title="Add Hospital" icon={Database}>
        <form className="admin-inline-form" onSubmit={addHospital}>
          <Input name="name" label="Hospital name" required />
          <Input name="code" label="Code" placeholder="Auto generated if blank" />
          <Input name="city" label="City" />
          <SelectInput name="status" label="Status" value="Active" options={['Active', 'Inactive']} />
          <Input name="description" label="Description" wide />
          <button className="primary-button" type="submit"><Plus size={16} />Add</button>
        </form>
      </Panel>
      <Panel title="Hospital List" icon={Database}>
        <div className="data-list">
          {loading && <p className="muted">Loading hospitals...</p>}
          {error && <p className="error-text">Unable to load hospitals: {error.message}</p>}
          {(data?.hospitals || []).map((hospital) => (
            <div className="data-row admin-master-row" key={hospital.id}>
              <strong>{hospital.name}</strong>
              <span>{[hospital.code, hospital.city, hospital.status].filter(Boolean).join(' | ')}</span>
              <button type="button" onClick={() => setPendingDelete(hospital)}><Trash2 size={15} />Delete</button>
            </div>
          ))}
        </div>
      </Panel>
      {pendingDelete && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <strong>Delete hospital?</strong>
            <p>Are you sure you want to delete {pendingDelete.name}? Hospitals assigned to users cannot be deleted.</p>
            <div>
              <button type="button" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button type="button" onClick={() => deleteHospital(pendingDelete.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
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
    await fetch(apiUrl(`/tests/${id}`), { method: 'DELETE' });
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

function MedicineMasterAdmin() {
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const { data, loading, error } = useApi('/medicines', refresh);
  const medicines = data?.medicines || [];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleMedicines = medicines.filter((medicine) => {
    if (!normalizedQuery) return true;
    return [medicine.name, medicine.generic, medicine.description, medicine.id]
      .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  });

  const addMedicine = async (event) => {
    event.preventDefault();
    setMessage('');
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await apiPost('/medicines', payload);
      event.currentTarget.reset();
      setMessage('Medicine added.');
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const uploadMedicines = async (event) => {
    event.preventDefault();
    setMessage('');
    const formData = new FormData(event.currentTarget);
    if (!formData.get('file')?.name) {
      setMessage('Select an Excel file to upload.');
      return;
    }
    try {
      const response = await fetch(apiUrl('/medicines/bulk-upload'), {
        method: 'POST',
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Bulk upload failed');
      event.currentTarget.reset();
      setMessage(`Bulk upload complete. ${payload.created} created, ${payload.updated} updated.`);
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteMedicine = async (id) => {
    await fetch(apiUrl(`/medicines/${id}`), { method: 'DELETE' });
    setRefresh((value) => value + 1);
  };

  return (
    <Page title="Medicine Master" eyebrow="Admin web module">
      {message && <div className="notice">{message}</div>}
      <Panel title="Bulk Excel Actions" icon={Pill}>
        <div className="bulk-action-row">
          <a className="secondary-button compact-action" href={apiUrl('/medicines/template.xlsx')} download>
            <FileText size={16} />Download Sample Template
          </a>
          <a className="secondary-button compact-action" href={apiUrl('/medicines/export.xlsx')} download>
            <FileText size={16} />Download All Medicines
          </a>
        </div>
        <form className="admin-inline-form bulk-upload-form" onSubmit={uploadMedicines}>
          <label className="field wide">
            <span>Upload Excel medicine template</span>
            <input name="file" type="file" accept=".xlsx,.xls" />
          </label>
          <button className="primary-button" type="submit"><Upload size={16} />Upload Medicines</button>
        </form>
      </Panel>
      <Panel title="Add Medicine" icon={Pill}>
        <form className="admin-inline-form" onSubmit={addMedicine}>
          <Input name="name" label="Medicine name" required />
          <Input name="generic" label="Generic" />
          <Input name="description" label="Description / dosage" wide />
          <button className="primary-button" type="submit"><Plus size={16} />Add</button>
        </form>
      </Panel>
      <Panel title={`Medicine Records (${visibleMedicines.length}/${medicines.length})`} icon={Pill}>
        <div className="admin-search-bar">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search medicine by name, generic, dosage or code" />
        </div>
        {loading && <p className="muted">Loading medicines...</p>}
        {error && <p className="error-text">Unable to load medicines: {error.message}</p>}
        {!loading && !visibleMedicines.length && <p className="muted">No medicines found.</p>}
        <div className="data-list">
          {visibleMedicines.map((medicine) => (
            <div className="data-row admin-master-row medicine-admin-row" key={medicine.id}>
              <div>
                <strong>{medicine.name}</strong>
                <span>{medicine.generic || 'No generic'} | {medicine.description || 'No dosage details'}</span>
                <small>Code: {medicine.id}</small>
              </div>
              <button type="button" onClick={() => deleteMedicine(medicine.id)}><Trash2 size={15} />Delete</button>
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
    const text = [
      medicine.name,
      medicine.generic,
      medicine.description,
      medicine.category,
      medicine.condition,
      medicine.commonUse,
      medicine.safetyNotes
    ].join(' ').toLowerCase();
    return text.includes(query.toLowerCase()) && medicine.status !== 'Inactive';
  });

  const addMedicine = (medicine) => {
    if (!prescriptionItems.some((item) => item.id === medicine.id)) {
      const nextMedicine = {
        ...medicine,
        selectedStrength: firstMasterOption(medicine.strength || medicine.description),
        selectedDosageForm: firstMasterOption(medicine.dosageForm),
        selectedUse: firstMasterOption(medicine.commonUse || medicine.condition),
        dosePattern: medicine.dosePattern || '1 - 1 - 1',
        doseSuggestion: ''
      };
      nextMedicine.doseSuggestion = medicine.doseSuggestion || buildMedicineSuggestion(nextMedicine);
      setPrescriptionItems([...prescriptionItems, nextMedicine]);
    }
    setQuery('');
  };

  const updateMedicineDose = (id, updates) => {
    setPrescriptionItems(prescriptionItems.map((item) => (
      item.id === id ? { ...item, ...updates } : item
    )));
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
              <span>{medicine.generic}</span>
              <small>{[medicine.category, medicine.description].filter(Boolean).join(' | ')}</small>
            </button>
          ))}
        </div>
      )}
      <SelectionBox
        items={prescriptionItems}
        onRemove={(id) => setPrescriptionItems(prescriptionItems.filter((item) => item.id !== id))}
        onDoseChange={updateMedicineDose}
        empty="Selected medicines will build prescription below."
      />
    </div>
  );
}

function SelectionBox({ items, onRemove, onDoseChange, empty }) {
  const updateMedicine = (item, updates) => {
    const next = { ...item, ...updates };
    onDoseChange(item.id, { ...updates, doseSuggestion: buildMedicineSuggestion(next) });
  };
  return (
    <div className="selection-box">
      {!items.length && <p>{empty}</p>}
      {items.map((item) => (
        <div className="selected-medicine-dose" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <button type="button" onClick={() => onRemove(item.id)}>x</button>
          </div>
          {onDoseChange && (
            <div className="dose-controls">
              <label>
                <span>Strength</span>
                <select value={item.selectedStrength || firstMasterOption(item.strength || item.description)} onChange={(event) => updateMedicine(item, { selectedStrength: event.target.value })}>
                  {masterOptions(item.strength || item.description).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Form</span>
                <select value={item.selectedDosageForm || firstMasterOption(item.dosageForm)} onChange={(event) => updateMedicine(item, { selectedDosageForm: event.target.value })}>
                  {masterOptions(item.dosageForm).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Use</span>
                <select value={item.selectedUse || firstMasterOption(item.commonUse || item.condition)} onChange={(event) => updateMedicine(item, { selectedUse: event.target.value })}>
                  {masterOptions(item.commonUse || item.condition).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="dose-suggestion-control">
                <span>Suggestion</span>
                <input value={item.doseSuggestion || buildMedicineSuggestion(item)} onChange={(event) => onDoseChange(item.id, { doseSuggestion: event.target.value })} placeholder="Auto suggestion" maxLength={160} />
              </label>
              <label className="dose-time-control">
                <span>Dose time</span>
                <select value={item.dosePattern || '1 - 1 - 1'} onChange={(event) => onDoseChange(item.id, { dosePattern: event.target.value })}>
                  {DOSE_PATTERNS.map((pattern) => <option key={pattern} value={pattern}>{pattern}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PrescriptionPreview({ item, selectedTests, prescriptionItems }) {
  return (
    <div className="prescription-preview">
      <strong>Prescription Preview</strong>
      <p>{item.patient.name} - {item.patient.mobile}</p>
      <div className="prescription-preview-list">
        {prescriptionItems.map((medicine) => (
          <div className="prescription-preview-row" key={medicine.id}>
            <span>{formatMedicineDoseText(medicine)}</span>
            <b>{medicine.dosePattern || '1 - 1 - 1'}</b>
          </div>
        ))}
      </div>
      {!!selectedTests.length && <p><b>Suggested X-rays/tests:</b> {selectedTests.map((test) => test.name).join(', ')}</p>}
    </div>
  );
}

function printPrescription(item) {
  const tests = item.doctor?.testsRequested || [];
  const medicines = item.doctor?.prescriptionItems?.length
    ? item.doctor.prescriptionItems.map((medicine) => `
        <div class="medicine-row">
          <span>${formatMedicineDoseText(medicine)}</span>
          <b>${medicine.dosePattern || '1 - 1 - 1'}</b>
        </div>
      `).join('')
    : `<div class="medicine-row"><span>${item.doctor?.prescription || 'Prescription not yet added'}</span><b>-</b></div>`;
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
          .medicine-list { display: grid; gap: 8px; margin-top: 10px; }
          .medicine-row { align-items: start; display: grid; gap: 14px; grid-template-columns: 1fr 120px; }
          .medicine-row b { text-align: right; }
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
          <div class="medicine-list">${medicines}</div>
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

function SubscriptionAdminDashboard() {
  const { data, loading, error } = useApi('/subscriptions/overview');
  const metrics = [
    { label: 'Amount Collected', value: formatCurrency(data?.totalCollected), hint: 'Verified Razorpay payments' },
    { label: 'Projected Monthly', value: formatCurrency(data?.projectedMonthly), hint: `${data?.billableUsers || 0} doctor users` },
    { label: 'Active Doctor Subs', value: data?.activeSubscriptions || 0, hint: 'Paid in advance' },
    { label: 'Trial Doctors', value: data?.trialUsers || 0, hint: 'First month free' },
    { label: 'Expired Doctors', value: data?.expiredUsers || 0, hint: 'Payment required' },
    { label: 'Active Doctors On App', value: data?.activeOnApp || 0, hint: 'Logged in last 7 days' },
    { label: 'Doctors Not Using App', value: data?.notUsingApp || 0, hint: 'No login in last 7 days' },
    { label: 'Monthly Price', value: formatCurrency(data?.config?.amount || 999), hint: 'Advance payment' }
  ];

  return (
    <Page title="Doctor Subscriptions" eyebrow="Razorpay billing">
      {error && <div className="notice warning-notice">Unable to load subscriptions: {error.message}</div>}
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
        <Panel title="Doctor Subscription Status" icon={Users}>
          <div className="data-list">
            {(data?.users || []).map((user) => (
              <div className="data-row subscription-admin-row" key={user.id}>
                <strong>{user.name}</strong>
                <span>{user.email} | {user.role} | {user.hospitalName || 'No hospital'}</span>
                <small>Last login: {formatDateTime(user.lastLoginAt)} | Paid until: {formatDateOnly(user.subscription?.paidUntil)} | Trial ends: {formatDateOnly(user.subscription?.trialEndsAt)}</small>
                <Status value={user.subscription?.status || 'Expired'} />
              </div>
            ))}
            {!loading && !(data?.users || []).length && <p className="muted">No approved doctors found.</p>}
          </div>
        </Panel>
        <Panel title="Recent Razorpay Payments" icon={CreditCard}>
          <div className="data-list">
            {(data?.payments || []).map((payment) => (
              <div className="data-row" key={payment.id}>
                <strong>{payment.userName || payment.email}</strong>
                <span>{formatCurrency(payment.amount)} | {payment.razorpayPaymentId || payment.razorpayOrderId}</span>
                <small>{formatDateTime(payment.paidAt)} | {payment.provider}</small>
              </div>
            ))}
            {!loading && !(data?.payments || []).length && <p className="muted">No verified subscription payments yet.</p>}
          </div>
        </Panel>
      </div>
    </Page>
  );
}

function AuditLogs() {
  const { data, loading, error } = useApi('/audit');
  const audit = data?.audit || [];
  const schema = data?.schema;
  return (
    <Page title="Audit Logs" eyebrow="Compliance activity review">
      <Panel title="Audit Coverage" icon={FileSearch}>
        <div className="audit-schema-grid">
          {(schema?.requiredFields || []).map((field) => <span key={field}>{field}</span>)}
        </div>
        <p className="muted">{schema?.purpose || 'Activity trail for clinical and admin actions.'}</p>
      </Panel>
      <Panel title="Recent Events" icon={Activity}>
        {loading && <p className="muted">Loading audit logs...</p>}
        {error && <p className="error-text">Unable to load audit logs: {error.message}</p>}
        {!loading && !audit.length && <p className="muted">No audit events found.</p>}
        <div className="audit-log-list">
          {audit.map((item) => (
            <article className="audit-log-card" key={item.id}>
              <header>
                <div>
                  <strong>{item.action}</strong>
                  <span>{item.description}</span>
                </div>
                <Status value={item.outcome || 'Success'} />
              </header>
              <div className="audit-detail-grid">
                <div><span>Time</span><strong>{formatDateTime(item.timestamp)}</strong></div>
                <div><span>Actor</span><strong>{item.actor}</strong></div>
                <div><span>Role</span><strong>{item.actorRole}</strong></div>
                <div><span>Module</span><strong>{item.module}</strong></div>
                <div><span>Entity</span><strong>{item.entityType}: {item.entityId}</strong></div>
                <div><span>Outcome</span><strong>{item.outcome || 'Success'}</strong></div>
                <div><span>Source IP</span><strong>{item.sourceIp || '-'}</strong></div>
                <div><span>Method / Path</span><strong>{[item.method, item.path].filter(Boolean).join(' ') || '-'}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </Panel>
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
            <Status value={caseStatusLabel(item)} />
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

function CaseSummary({ item, compact, hideHistory = false }) {
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
      {!compact && !hideHistory && <PatientHistoryDays historyDays={item.patient?.historyDays || groupTimelineByDate(item.patient?.timeline || [])} />}
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
          <ul>{doctor.prescriptionItems.map((medicine) => <li key={medicine.id}>{formatMedicineDoseLine(medicine)}</li>)}</ul>
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
  const inputRef = useRef(null);
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };
  return (
    <button className="date-selector inline-date-picker" type="button" aria-label="Select appointment date" onClick={openPicker}>
      <span>
        <strong>{isToday(value) ? 'Today' : dayLabel}</strong>
        <small>{label}</small>
      </span>
      <CalendarDays size={17} />
      <input ref={inputRef} type="date" value={value} onChange={(event) => onChange(event.target.value)} onClick={(event) => event.stopPropagation()} />
    </button>
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

function Input({ label, wide, value, controlledValue, name, required, placeholder, onBlur, onChange, disabled }) {
  const mobileProps = name === 'mobile'
    ? {
        pattern: '^[6-9][0-9]{9}$',
        title: 'Enter a valid 10 digit Indian mobile number starting with 6, 7, 8, or 9',
        inputMode: 'numeric',
        maxLength: 10
      }
    : {};
  const controlProps = controlledValue !== undefined
    ? { value: controlledValue, onChange: onChange || (() => {}) }
    : { defaultValue: value || '', onChange };
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}{required && <b className="required-star">*</b>}</span>
      <input name={name} required={required} placeholder={placeholder || ''} onBlur={onBlur} disabled={disabled} {...mobileProps} {...controlProps} />
    </label>
  );
}

function SelectInput({ label, wide, value, controlledValue, name, required, options, disabled, onChange }) {
  const controlProps = controlledValue !== undefined
    ? { value: controlledValue, onChange: onChange || (() => {}) }
    : { defaultValue: value || '', onChange };
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}{required && <b className="required-star">*</b>}</span>
      <select name={name} required={required} disabled={disabled} {...controlProps}>
        <option value="" disabled>Select {label.toLowerCase()}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextAreaInput({ label, wide = true, value, name, required, placeholder, maxLength = 300, disabled }) {
  const autoGrow = (event) => {
    event.currentTarget.style.height = 'auto';
    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
  };

  return (
    <label className={wide ? 'field wide textarea-field' : 'field textarea-field'}>
      <span><span className="field-label-main">{label}{required && <b className="required-star">*</b>}</span><small>{maxLength} max</small></span>
      <textarea
        name={name}
        defaultValue={value || ''}
        required={required}
        placeholder={placeholder || ''}
        maxLength={maxLength}
        disabled={disabled}
        rows={2}
        onInput={autoGrow}
      />
    </label>
  );
}

function DateInput({ label, wide = true, value, name, required, disabled }) {
  return (
    <label className={wide ? 'field wide' : 'field'}>
      <span>{label}{required && <b className="required-star">*</b>}</span>
      <input name={name} type="date" defaultValue={value || ''} required={required} disabled={disabled} />
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
    appointmentDate: data.appointmentDate || todayDate(),
    doctorId: data.doctorId || '',
    hospitalId: data.hospitalId || '',
    assistantId: data.assistantId || '',
    assistantName: data.assistantName || '',
    matchedPatientId: data.matchedPatientId || '',
    allowDuplicateMobile: data.allowDuplicateMobile === 'true',
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

function isDoctorFinalized(item) {
  return ['assistant_closure', 'completed'].includes(item.status) || ['doctor_done', 'assistant_work_done', 'visit_complete'].includes(item.visitStatus);
}

function canAssistantCollectFees(item) {
  return item.status === 'assistant_closure' && item.visitStatus === 'doctor_done';
}

function canAssistantMarkComplete(item) {
  return item.status === 'assistant_closure' && item.visitStatus === 'assistant_work_done';
}

function canAssistantCloseVisit(item) {
  return ['assistant_closure', 'completed'].includes(item.status) || ['doctor_done', 'assistant_work_done', 'visit_complete'].includes(item.visitStatus);
}

function isDoctorLockedAppointment(item) {
  return ['doctor_done', 'complete', 'completed', 'cancelled'].includes(item.status);
}

function isClosedAppointment(item) {
  return ['complete', 'completed'].includes(item?.status) || item?.visitStatus === 'visit_complete';
}

function isCancelledAppointment(item) {
  return item?.status === 'cancelled' || String(item?.visitStatus || '').includes('cancelled');
}

function isOpenAppointment(item) {
  return !isClosedAppointment(item) && !isCancelledAppointment(item);
}

function isFeesPendingAppointment(item) {
  return item?.status === 'doctor_done' || item?.visitStatus === 'doctor_done';
}

function appointmentStatusLabel(item) {
  if (isCancelledAppointment(item)) return 'Cancelled';
  if (isClosedAppointment(item)) return 'Closed';
  if (isFeesPendingAppointment(item)) return 'Fees Pending';
  if (['waiting', 'scheduled'].includes(item?.status)) return 'Scheduled';
  return formatStatus(item.status);
}

function caseStatusLabel(item) {
  if (item.status === 'cancelled') return 'Cancelled';
  if (item.status === 'completed' || item.visitStatus === 'visit_complete') return 'Closed';
  if (item.status === 'doctor_queue') return "Open - DR's Que";
  if (item.status === 'assistant_closure' && item.visitStatus === 'doctor_done') return 'Open - Fees Pending';
  if (item.status === 'assistant_closure') return 'Fees Collected';
  if (item.status === 'assistant_intake') return 'Open - Scheduled';
  return formatStatus(item.status);
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

function formatList(items = []) {
  if (!Array.isArray(items)) return '';
  return items.map((item) => (typeof item === 'string' ? item : formatMedicineDoseLine(item))).filter(Boolean).join(', ');
}

function formatPrescriptionLine(doctor = {}) {
  if (doctor.prescription) return doctor.prescription;
  return formatList(doctor.prescriptionItems);
}

function formatMedicineDoseLine(medicine = {}) {
  const dose = medicine.dosePattern ? ` | ${medicine.dosePattern}` : '';
  return `${formatMedicineDoseText(medicine)}${dose}`;
}

function formatMedicineDoseText(medicine = {}) {
  const masterDetails = [
    medicine.selectedStrength,
    medicine.selectedDosageForm,
    medicine.selectedUse
  ].filter((value) => value && value !== '-').join(' - ');
  const suggestion = medicine.doseSuggestion || buildMedicineSuggestion(medicine) || medicine.description || medicine.generic || '';
  const suggestionText = suggestion === masterDetails ? '' : suggestion;
  return `${medicine.name || 'Medicine'}${masterDetails ? ` - ${masterDetails}` : ''}${suggestionText ? `: ${suggestionText}` : ''}`;
}

function buildMedicineSuggestion(medicine = {}) {
  return [
    medicine.selectedStrength,
    medicine.selectedDosageForm,
    medicine.selectedUse
  ].filter((value) => value && value !== '-').join(' - ') || medicine.description || medicine.generic || '';
}

function masterOptions(value = '') {
  const options = String(value || '')
    .split(/\s*(?:\/|\||,)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  return options.length ? [...new Set(options)] : ['-'];
}

function firstMasterOption(value = '') {
  return masterOptions(value)[0] || '-';
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDateOnly(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

function formatCurrency(value) {
  const amount = Number(String(value || 0).replace(/[^\d.]/g, '')) || 0;
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

function validateDashboardRange(fromDate, toDate) {
  if (!fromDate || !toDate) return 'Select both From and To dates.';
  const from = Date.parse(`${fromDate}T00:00:00`);
  const to = Date.parse(`${toDate}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'Select a valid date range.';
  if (from > to) return 'From date cannot be after To date.';
  const days = Math.floor((to - from) / 86400000) + 1;
  if (days > 366) return 'Date range cannot be more than 366 days.';
  return '';
}

function emptyPatientDraft() {
  return {
    mobile: '',
    name: '',
    age: '',
    gender: '',
    address: '',
    chiefComplaint: '',
    toothNumber: '',
    medicalFlags: ''
  };
}

function patientToDraft(patient = {}) {
  return {
    mobile: patient.mobile || '',
    name: patient.name || '',
    age: patient.age || '',
    gender: patient.gender || '',
    address: patient.address || patient.city || '',
    chiefComplaint: patient.chiefComplaint || '',
    toothNumber: patient.toothNumber || '',
    medicalFlags: Array.isArray(patient.medicalFlags)
      ? patient.medicalFlags.join(', ')
      : (Array.isArray(patient.flags) ? patient.flags.join(', ') : (patient.medicalFlags || patient.flags || ''))
  };
}

function applyPatientToForm(form, patient) {
  if (!form || !patient) return;
  const setValue = (name, value) => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field && value !== undefined && value !== null) {
      field.value = Array.isArray(value) ? value.join(', ') : value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  setValue('name', patient.name);
  setValue('mobile', patient.mobile);
  setValue('age', patient.age);
  setValue('gender', patient.gender);
  setValue('address', patient.address);
  setValue('chiefComplaint', patient.chiefComplaint);
  setValue('toothNumber', patient.toothNumber);
  setValue('medicalFlags', patient.medicalFlags || []);
}

function groupTimelineByDate(timeline = []) {
  const grouped = new Map();
  for (const entry of timeline) {
    const date = entry.date || todayDate();
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push({ title: entry.title || 'Timeline', note: entry.note || '' });
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({ date, items }));
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
  if (status === 'doctor_queue') return "DR's Que";
  if (status === 'doctor_done') return 'Fees Collection';
  if (status === 'assistant_closure') return 'Fees Pending';
  return String(status || '').split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

createRoot(document.getElementById('root')).render(<App />);
