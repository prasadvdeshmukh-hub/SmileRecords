import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import multer from 'multer';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Razorpay from 'razorpay';
import XLSX from 'xlsx';
import { seed } from './seed.js';

const app = express();
const port = process.env.PORT || 4000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.SMILE_RECORDS_DATA_FILE || join(__dirname, 'data', 'smile-records.local.json');
const IS_DEPLOYED_RUNTIME = process.env.RENDER || process.env.NODE_ENV === 'production';
const STORAGE_MODE = process.env.SMILE_RECORDS_STORAGE || '';
const SUBSCRIPTION_AMOUNT = Number(process.env.SUBSCRIPTION_MONTHLY_AMOUNT || 999);
const SUBSCRIPTION_CURRENCY = 'INR';
const SUBSCRIPTION_TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || 30);
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;
const storage = createStorage();
let db = await loadDb();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(requireActiveSubscriptionForAppApi);
app.use(persistSuccessfulMutations);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'SmileRecords',
    version: '0.3.0',
    storage: storage.mode,
    dataFile: storage.mode === 'json-file' ? DATA_FILE : undefined,
    firestoreDocument: storage.mode === 'firestore' ? storage.documentPath : undefined
  });
});

app.post('/api/admin/reset-data', (req, res) => {
  if (!isDataResetAllowed(req)) {
    return res.status(403).json({
      error: 'Data reset is disabled. Use an isolated local test database, or provide the explicit reset confirmation token for an intentional one-time reset.'
    });
  }
  db = prepareDb(seed);
  log('ADMIN_RESET_DATA', req.body.actor || 'Admin', 'SmileRecords');
  res.json({ ok: true, message: 'SmileRecords data reset to seed values' });
});

app.get('/api/admin/export', (req, res) => {
  res.json({ exportedAt: new Date().toISOString(), data: db });
});

app.get('/api/dashboard', (req, res) => {
  const subscriptionOverview = buildSubscriptionOverview();
  res.json({
    metrics: [
      { label: 'Doctor Queue', value: countCases('doctor_queue'), hint: 'Waiting for analysis' },
      { label: 'Assistant Work', value: countCases('assistant_closure'), hint: 'Fees collection' },
      { label: 'Completed Cases', value: countCases('completed'), hint: 'Closed today' },
      { label: 'Now Serving', value: db.queue.nowServing, hint: 'Current token' },
      { label: 'Total Patients', value: db.patients.length, hint: 'Clinic records' },
      { label: 'Pending Approvals', value: db.users.filter((item) => item.status === 'Pending').length, hint: 'Admin action' },
      { label: 'Active Roles', value: db.roles.length, hint: 'RBAC enabled' },
      { label: 'Subscription Collected', value: formatMoney(subscriptionOverview.totalCollected), hint: 'Verified Razorpay payments' },
      { label: 'Monthly Projection', value: formatMoney(subscriptionOverview.projectedMonthly), hint: `${subscriptionOverview.billableUsers} approved users` },
      { label: 'Audit Events', value: db.audit.length, hint: 'Sensitive actions' }
    ]
  });
});

app.get('/api/doctor-dashboard', (req, res) => {
  const from = normalizeDate(req.query.from) || today();
  const to = normalizeDate(req.query.to) || from;
  const range = validateDateRange(from, to);
  if (range.error) return res.status(400).json({ error: range.error });

  const doctor = findDoctor(req.query.doctorId, req.query.doctorEmail);
  if (req.query.doctorEmail && !doctor) return res.status(404).json({ error: 'Doctor not found' });

  const scopedCases = doctor ? db.cases.filter((item) => isCaseOwnedByDoctor(item, doctor)) : db.cases;
  const activeCases = scopedCases.filter((item) => isInDateRange(caseDashboardDate(item), from, to));
  const servedCases = scopedCases.filter((item) => (
    isCompletedCase(item) && isInDateRange(caseCompletionDate(item), from, to)
  ));
  const openCases = activeCases.filter((item) => !isCompletedCase(item) && !isCancelledCase(item));
  const cancelledCases = scopedCases.filter((item) => (
    isCancelledCase(item) && isInDateRange(caseDashboardDate(item), from, to)
  ));
  const paidCases = scopedCases.filter((item) => (
    item.closure?.closedAt
    && item.closure?.feesCollected
    && isInDateRange(item.closure.closedAt.slice(0, 10), from, to)
  ));

  res.json({
    from,
    to,
    maxDays: 366,
    metrics: {
      patientServed: servedCases.length,
      openCases: openCases.length,
      cancelledCases: cancelledCases.length,
      amountCollected: buildFeesSummary(paidCases)
    },
    daily: buildDoctorDashboardDays(scopedCases, from, to)
  });
});

app.get('/api/cases', (req, res) => {
  let cases = db.cases;
  if (req.query.queue === 'doctor') cases = cases.filter((item) => item.status === 'doctor_queue' && item.visitStatus !== 'cancelled');
  if (req.query.queue === 'assistant-closure') cases = cases.filter((item) => canAssistantCollectFees(item));
  if (req.query.queue === 'assistant-intake') cases = cases.filter((item) => item.status === 'assistant_intake');
  if (req.query.queue === 'closed') cases = cases.filter((item) => item.status === 'completed' || item.visitStatus === 'visit_complete');
  if (req.query.queue === 'cancelled') cases = cases.filter((item) => item.status === 'cancelled' || String(item.visitStatus || '').includes('cancelled'));
  if (req.query.doctorId) cases = cases.filter((item) => item.assignedDoctorId === req.query.doctorId);
  if (req.query.doctorEmail && req.query.scope === 'mapped') {
    const doctor = findDoctor('', req.query.doctorEmail);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    cases = cases.filter((item) => isCaseVisibleToDoctor(item, doctor));
  }
  if (req.query.date) cases = cases.filter((item) => caseActivityDate(item) === req.query.date);
  res.json({ cases: cases.map(enrichCase) });
});

app.post('/api/auth/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) {
    log('LOGIN_DENIED_INVALID_GOOGLE_EMAIL', email || 'Invalid email', email, { req, outcome: 'Denied', module: 'Google Login', description: 'Invalid Google email login attempt' });
    return res.status(400).json({ error: 'Invalid login details' });
  }
  const user = db.users.find((item) => normalizeEmail(item.email) === email);
  if (!user) {
    log('LOGIN_DENIED_UNKNOWN_USER', email || 'Unknown', email, { req, outcome: 'Denied', module: 'Login', description: 'Login denied because user is not registered' });
    return res.status(404).json({ error: 'No approved access found. Please submit an access request.' });
  }
  if (user.status !== 'Active') {
    const isRejected = user.status === 'Rejected';
    log(isRejected ? 'LOGIN_DENIED_REJECTED_ACCESS' : 'LOGIN_DENIED_PENDING_APPROVAL', user.name || email, user.id, { req, outcome: 'Denied', module: 'Login', actorRole: user.role, description: `Login denied because access status is ${user.status}` });
    return res.status(403).json({ error: isRejected ? 'Access request was rejected by admin. Please contact admin or submit a new request.' : 'Access request is pending admin approval.' });
  }
  user.lastLoginAt = new Date().toISOString();
  user.loginCount = Number(user.loginCount || 0) + 1;
  ensureUserSubscription(user);
  log('LOGIN_SUCCESS', user.name || email, user.id, { req, module: 'Login', actorRole: user.role, entityType: 'User', entityId: user.id });
  res.json({ user: withHospital(user) });
});

app.post('/api/access-requests', (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid login details' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'User Name is required' });
  const requestedRole = ['Assistant', 'Doctor'].includes(req.body.requestedRole) ? req.body.requestedRole : '';
  if (!requestedRole) return res.status(400).json({ error: 'Select Assistant or Doctor access role' });
  const hospital = db.hospitals.find((item) => item.id === req.body.hospitalId && item.status !== 'Inactive');
  if (!hospital) return res.status(400).json({ error: 'Select valid hospital' });
  const existing = db.users.find((item) => normalizeEmail(item.email) === email);
  if (existing?.status === 'Active') return res.status(409).json({ error: 'This user is already approved. Please sign in.' });
  const payload = {
    name,
    email,
    role: 'Pending',
    requestedRole,
    hospitalId: hospital.id,
    status: 'Pending',
    description: `Requested ${requestedRole} access for ${hospital.name}`
  };
  const user = existing || createUser(payload);
  Object.assign(user, payload, { id: user.id });
  if (!existing) db.users.unshift(user);
  log('ACCESS_REQUEST_SUBMITTED', user.name, user.id, { req, module: 'Login Request', actorRole: requestedRole, entityType: 'User', entityId: user.id, description: `Access requested for ${requestedRole} at ${hospital.name}` });
  res.status(existing ? 200 : 201).json({ user });
});

app.get('/api/subscriptions/config', (req, res) => {
  res.json({
    keyId: RAZORPAY_KEY_ID,
    configured: Boolean(razorpay),
    amount: SUBSCRIPTION_AMOUNT,
    amountPaise: SUBSCRIPTION_AMOUNT * 100,
    currency: SUBSCRIPTION_CURRENCY,
    trialDays: SUBSCRIPTION_TRIAL_DAYS
  });
});

app.get('/api/subscriptions/status', (req, res) => {
  const user = findUserByEmail(req.query.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  ensureUserSubscription(user);
  res.json({ user: withHospital(user), subscription: subscriptionStatus(user), config: publicSubscriptionConfig() });
});

app.get('/api/subscriptions/overview', (req, res) => {
  res.json(buildSubscriptionOverview());
});

app.post('/api/subscriptions/order', async (req, res) => {
  const user = findUserByEmail(req.body.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status !== 'Active') return res.status(403).json({ error: 'Admin approval is required before subscription payment.' });
  if (!isSubscriptionBillable(user)) return res.status(400).json({ error: 'Monthly subscription is only required for Doctor users.' });
  ensureUserSubscription(user);
  if (!razorpay) {
    return res.status(503).json({ error: 'Razorpay payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on Render.' });
  }

  const receipt = `smile_${user.id}_${Date.now()}`.slice(0, 40);
  const order = await razorpay.orders.create({
    amount: SUBSCRIPTION_AMOUNT * 100,
    currency: SUBSCRIPTION_CURRENCY,
    receipt,
    notes: {
      app: 'SmileRecords',
      userId: user.id,
      email: normalizeEmail(user.email),
      plan: 'Monthly'
    }
  });
  const pendingPayment = {
    id: nextId('SUBPAY', (db.subscriptionPayments || []).length + 1),
    userId: user.id,
    userName: user.name,
    email: normalizeEmail(user.email),
    amount: SUBSCRIPTION_AMOUNT,
    amountPaise: SUBSCRIPTION_AMOUNT * 100,
    currency: SUBSCRIPTION_CURRENCY,
    razorpayOrderId: order.id,
    razorpayPaymentId: '',
    status: 'Created',
    provider: 'Razorpay',
    createdAt: new Date().toISOString(),
    paidAt: ''
  };
  db.subscriptionPayments.unshift(pendingPayment);
  log('SUBSCRIPTION_ORDER_CREATED', user.name, pendingPayment.id, { req, module: 'Subscription', actorRole: user.role, entityType: 'SubscriptionPayment', entityId: pendingPayment.id });
  res.status(201).json({
    order,
    payment: pendingPayment,
    keyId: RAZORPAY_KEY_ID,
    user: withHospital(user),
    config: publicSubscriptionConfig()
  });
});

app.post('/api/subscriptions/verify', (req, res) => {
  const user = findUserByEmail(req.body.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!isSubscriptionBillable(user)) return res.status(400).json({ error: 'Monthly subscription is only required for Doctor users.' });
  ensureUserSubscription(user);
  if (!RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Razorpay secret is not configured on server.' });
  const orderId = String(req.body.razorpay_order_id || '').trim();
  const paymentId = String(req.body.razorpay_payment_id || '').trim();
  const signature = String(req.body.razorpay_signature || '').trim();
  if (!orderId || !paymentId || !signature) return res.status(400).json({ error: 'Incomplete Razorpay payment response.' });

  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  if (expected !== signature) {
    log('SUBSCRIPTION_PAYMENT_VERIFICATION_FAILED', user.name, user.id, { req, module: 'Subscription', actorRole: user.role, outcome: 'Denied', entityType: 'User', entityId: user.id });
    return res.status(400).json({ error: 'Payment verification failed. Please retry or contact admin.' });
  }

  const payment = (db.subscriptionPayments || []).find((item) => item.razorpayOrderId === orderId) || {
    id: nextId('SUBPAY', (db.subscriptionPayments || []).length + 1),
    userId: user.id,
    userName: user.name,
    email: normalizeEmail(user.email),
    amount: SUBSCRIPTION_AMOUNT,
    amountPaise: SUBSCRIPTION_AMOUNT * 100,
    currency: SUBSCRIPTION_CURRENCY,
    provider: 'Razorpay',
    createdAt: new Date().toISOString()
  };
  if (!db.subscriptionPayments.includes(payment)) db.subscriptionPayments.unshift(payment);
  Object.assign(payment, {
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    status: 'Paid',
    paidAt: new Date().toISOString()
  });
  activatePaidSubscription(user, payment);
  log('SUBSCRIPTION_PAYMENT_VERIFIED', user.name, payment.id, { req, module: 'Subscription', actorRole: user.role, entityType: 'SubscriptionPayment', entityId: payment.id, description: `${user.name} paid ${formatMoney(SUBSCRIPTION_AMOUNT)} for SmileRecords monthly subscription` });
  res.json({ ok: true, user: withHospital(user), subscription: subscriptionStatus(user), payment });
});

app.get('/api/queue', (req, res) => {
  const doctorQueue = db.cases
    .filter((item) => item.status === 'doctor_queue')
    .sort((a, b) => a.queueNumber - b.queueNumber);
  res.json({
    queue: db.queue,
    nextCase: doctorQueue[0] || null,
    waitingCount: doctorQueue.length,
    skippedNumbers: db.queue.skippedNumbers
  });
});

app.get('/api/appointments', (req, res) => {
  const selectedDate = req.query.date;
  const doctorId = String(req.query.doctorId || '').trim();
  const doctor = findDoctor('', req.query.doctorEmail);
  const caseForAppointment = (appointment) => db.cases.find((caseItem) => caseItem.id === appointment.caseId || caseItem.queueNumber === appointment.queueNumber);
  let appointments = selectedDate
    ? db.appointments.filter((item) => {
      const linkedCase = caseForAppointment(item);
      return appointmentDate(item) === selectedDate || (linkedCase && isCompletedCase(linkedCase) && caseActivityDate(linkedCase) === selectedDate);
    })
    : db.appointments;
  if (doctorId) appointments = appointments.filter((item) => item.doctorId === doctorId);
  if (doctor && req.query.scope === 'mapped') {
    appointments = appointments.filter((appointment) => {
      const item = caseForAppointment(appointment);
      return item ? isCaseVisibleToDoctor(item, doctor) : appointment.doctorId === doctor.id;
    });
  }
  res.json({
    appointments: appointments.map((appointment) => {
      const linkedCase = caseForAppointment(appointment);
      if (!linkedCase) return appointment;
      if (isCompletedCase(linkedCase)) return { ...appointment, status: 'complete', visitStatus: 'visit_complete' };
      if (isCancelledCase(linkedCase)) return { ...appointment, status: 'cancelled', visitStatus: linkedCase.visitStatus };
      return { ...appointment, visitStatus: linkedCase.visitStatus };
    })
  });
});

app.patch('/api/appointments/:id/send-to-doctor', (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
  if (isClosedAppointment(appointment)) return res.status(409).json({ error: 'Closed appointment cannot be changed' });

  const item = db.cases.find((caseItem) => caseItem.queueNumber === appointment.queueNumber);
  if (!item) return res.status(404).json({ error: 'Case not found for appointment' });

  sendCaseToDoctor(item);
  appointment.status = 'doctor_queue';
  log('ASSISTANT_SEND_APPOINTMENT_TO_DOCTOR', 'Assistant', `${appointment.queueNumber}`);
  res.json({ appointment, case: item, queue: db.queue });
});

app.patch('/api/appointments/:id/recall-to-waiting', (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
  if (isClosedAppointment(appointment)) return res.status(409).json({ error: 'Closed appointment cannot be changed' });

  const item = db.cases.find((caseItem) => caseItem.queueNumber === appointment.queueNumber);
  if (!item) return res.status(404).json({ error: 'Case not found for appointment' });

  appointment.status = 'waiting';
  item.status = 'assistant_intake';
  item.visitStatus = 'waiting_doctor';
  item.updatedAt = new Date().toISOString();
  log('RECALL_APPOINTMENT_TO_WAITING', req.body.actor || 'Assistant', `${appointment.queueNumber}`);
  res.json({ appointment, case: item, queue: db.queue });
});

app.patch('/api/appointments/:id/doctor-done', (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
  if (isClosedAppointment(appointment)) return res.status(409).json({ error: 'Closed appointment cannot be changed' });

  const item = db.cases.find((caseItem) => caseItem.queueNumber === appointment.queueNumber);
  if (!item) return res.status(404).json({ error: 'Case not found for appointment' });

  appointment.status = 'doctor_done';
  item.status = 'assistant_closure';
  item.visitStatus = 'doctor_done';
  item.updatedAt = new Date().toISOString();
  log('DOCTOR_MARK_APPOINTMENT_DONE', 'Doctor', `${appointment.queueNumber}`);
  res.json({ appointment, case: item });
});

app.patch('/api/appointments/:id/complete', (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

  const item = db.cases.find((caseItem) => caseItem.queueNumber === appointment.queueNumber);
  if (!item) return res.status(404).json({ error: 'Case not found for appointment' });

  appointment.status = 'complete';
  item.status = 'completed';
  item.visitStatus = 'visit_complete';
  item.updatedAt = new Date().toISOString();
  log('MARK_APPOINTMENT_COMPLETE', req.body.actor || 'Assistant', `${appointment.queueNumber}`);
  res.json({ appointment, case: item });
});

app.post('/api/cases', (req, res) => {
  const patient = normalizePatient(req.body.patient || req.body);
  const assignedDoctor = req.body.doctorId
    ? db.users.find((user) => user.id === req.body.doctorId && user.role === 'Doctor' && user.status === 'Active')
    : null;
  if (req.body.doctorId && !assignedDoctor) {
    return res.status(400).json({ error: 'Select valid doctor for this patient' });
  }
  const caseHospitalId = assignedDoctor?.hospitalId || req.body.hospitalId || patient.hospitalId || '';
  patient.hospitalId = caseHospitalId;
  if (!isValidMobile(patient.mobile)) {
    return res.status(400).json({ error: 'Enter a valid 10 digit mobile number starting with 6, 7, 8, or 9' });
  }
  if (!String(patient.name || '').trim()) return res.status(400).json({ error: 'Patient name is required' });
  if (!String(patient.age || '').trim()) return res.status(400).json({ error: 'Patient age is required' });
  if (!String(patient.gender || '').trim()) return res.status(400).json({ error: 'Patient gender is required' });
  if (!String(patient.address || '').trim()) return res.status(400).json({ error: 'Patient address is required' });
  if (patient.toothNumber && !isValidToothNumber(patient.toothNumber)) {
    return res.status(400).json({ error: 'Tooth number must be between 1 and 32' });
  }
  const appointmentTime = req.body.appointmentTime || patient.appointmentTime;
  const appointmentDay = req.body.appointmentDate || patient.appointmentDate || today();
  if (!isValidAppointmentTime(appointmentTime)) {
    return res.status(400).json({ error: 'Appointment time must use a 15 minute slot between 09:00 and 18:00' });
  }
  if (db.appointments.some((item) => (
    isSlotBlockingAppointment(item)
    && item.time === appointmentTime
    && appointmentDate(item) === appointmentDay
    && (item.doctorId || '') === (assignedDoctor?.id || '')
  ))) {
    return res.status(409).json({ error: 'Appointment time is already allocated to another patient' });
  }
  const mobileMatches = db.patients.filter((item) => (
    compactMobile(item.mobile) === patient.mobile && (!caseHospitalId || patientHospitalId(item) === caseHospitalId)
  ));
  const matchedPatientId = String(req.body.matchedPatientId || '').trim();
  const allowDuplicateMobile = req.body.allowDuplicateMobile === true || req.body.allowDuplicateMobile === 'true';
  const selectedExisting = matchedPatientId ? mobileMatches.find((item) => item.id === matchedPatientId) : null;
  if (matchedPatientId && !selectedExisting) {
    return res.status(400).json({ error: 'Selected patient does not match this mobile number and hospital' });
  }
  const sameNameExisting = mobileMatches.find((item) => sameText(item.name, patient.name));
  if (mobileMatches.length && !selectedExisting && !sameNameExisting && !allowDuplicateMobile) {
    return res.status(409).json({
      error: `Mobile number already exists for ${mobileMatches[0].name}. Confirm existing patient or create a new patient record.`,
      patient: patientFullSummary(mobileMatches[0]),
      patients: mobileMatches.map(patientFullSummary)
    });
  }
  if (allowDuplicateMobile && sameNameExisting && !selectedExisting) {
    return res.status(409).json({ error: 'Same mobile number and patient name already exists for this hospital' });
  }

  const existing = selectedExisting || sameNameExisting;
  const patientRecord = existing || {
    id: nextId('SR', db.patients.length + 1),
    ...patient,
    hospitalId: caseHospitalId,
    flags: patient.medicalFlags || [],
    treatmentStatus: 'Pending',
    nextFollowUp: '',
    timeline: []
  };

  if (!existing) db.patients.push(patientRecord);

  const item = {
    id: nextId('CASE', db.cases.length + 1),
    queueNumber: db.queue.nextNumber++,
    patientId: patientRecord.id,
    patient: patientRecord,
    status: 'assistant_intake',
    visitStatus: 'waiting_doctor',
    assignedDoctorId: assignedDoctor?.id || '',
    assignedDoctorName: assignedDoctor?.name || '',
    hospitalId: caseHospitalId,
    assistantId: req.body.assistantId || '',
    assistantName: req.body.assistantName || '',
    assistant: {
      intakeBy: req.body.assistantName || 'Assistant',
      consentCaptured: Boolean(patient.consent),
      intakeAt: new Date().toISOString()
    },
    doctor: {},
    closure: normalizeFeeCollection(req.body, { required: false, requireUpiReceipt: true }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.cases.unshift(item);
  db.appointments.push({
    id: nextId('APT', db.appointments.length + 1),
    caseId: item.id,
    date: appointmentDay,
    time: appointmentTime,
    patientName: patientRecord.name,
    type: patient.chiefComplaint || 'Consult',
    status: 'scheduled',
    queueNumber: item.queueNumber,
    doctorId: assignedDoctor?.id || '',
    doctorName: assignedDoctor?.name || ''
  });
  patientRecord.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Assistant intake', date: today(), note: 'Submitted to doctor queue' });
  log('ASSISTANT_SUBMIT_TO_DOCTOR', 'Assistant', item.id);
  res.status(201).json({ case: enrichCase(item) });
});

app.patch('/api/queue/skip-next', (req, res) => {
  const nextCase = db.cases
    .filter((item) => item.status === 'doctor_queue')
    .sort((a, b) => a.queueNumber - b.queueNumber)[0];
  if (!nextCase) return res.status(404).json({ error: 'No waiting case to skip' });

  nextCase.visitStatus = 'skipped';
  nextCase.status = 'assistant_intake';
  db.queue.skippedNumbers.push(nextCase.queueNumber);
  log('ASSISTANT_SKIP_QUEUE_NUMBER', 'Assistant', `${nextCase.queueNumber}`);
  res.json({ skipped: nextCase.queueNumber, case: nextCase, queue: db.queue });
});

app.patch('/api/queue/send-next', (req, res) => {
  const nextCase = db.cases
    .filter((item) => ['doctor_queue', 'assistant_intake'].includes(item.status))
    .sort((a, b) => a.queueNumber - b.queueNumber)[0];
  if (!nextCase) return res.status(404).json({ error: 'No case available' });

  nextCase.status = 'doctor_queue';
  nextCase.visitStatus = 'sent_to_doctor';
  nextCase.updatedAt = new Date().toISOString();
  db.queue.nowServing = nextCase.queueNumber;
  db.queue.currentDoctorCaseId = nextCase.id;
  db.queue.skippedNumbers = db.queue.skippedNumbers.filter((number) => number !== nextCase.queueNumber);
  log('ASSISTANT_SEND_NEXT_TO_DOCTOR', 'Assistant', `${nextCase.queueNumber}`);
  res.json({ case: nextCase, queue: db.queue });
});

app.patch('/api/queue/send-earlier', (req, res) => {
  const skippedNumber = db.queue.skippedNumbers.shift();
  const skippedCase = db.cases.find((item) => item.queueNumber === skippedNumber);
  if (!skippedCase) return res.status(404).json({ error: 'No skipped patient available' });

  sendCaseToDoctor(skippedCase);
  log('ASSISTANT_SEND_EARLIER_TO_DOCTOR', 'Assistant', `${skippedCase.queueNumber}`);
  res.json({ case: skippedCase, queue: db.queue });
});

app.patch('/api/cases/:id/send-to-doctor', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });

  sendCaseToDoctor(item);
  log('ASSISTANT_SEND_PATIENT_TO_DOCTOR', 'Assistant', `${item.queueNumber}`);
  res.json({ case: item, queue: db.queue });
});

app.patch('/api/cases/:id/skip', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });

  item.status = 'assistant_intake';
  item.visitStatus = 'skipped';
  item.updatedAt = new Date().toISOString();
  if (!db.queue.skippedNumbers.includes(item.queueNumber)) db.queue.skippedNumbers.push(item.queueNumber);
  log('ASSISTANT_SKIP_PATIENT', 'Assistant', `${item.queueNumber}`);
  res.json({ case: item, queue: db.queue });
});

app.patch('/api/cases/:id/send-earlier', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });

  item.queueNumber = Math.max(1, db.queue.nowServing - 1);
  sendCaseToDoctor(item);
  log('ASSISTANT_SEND_PATIENT_EARLIER', 'Assistant', `${item.queueNumber}`);
  res.json({ case: item, queue: db.queue });
});

app.get('/api/cases/:id', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  res.json({ case: enrichCase(item) });
});

app.patch('/api/cases/:id/basic', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  if (!['assistant_intake', 'doctor_queue'].includes(item.status)) {
    return res.status(409).json({ error: 'Case cannot be edited in current status' });
  }

  const submittedPatient = req.body.patient || {};
  const normalized = normalizePatient(submittedPatient);
  if (!Object.prototype.hasOwnProperty.call(submittedPatient, 'city')) normalized.city = item.patient.city || '';
  if (normalized.mobile && !isValidMobile(normalized.mobile)) {
    return res.status(400).json({ error: 'Enter a valid 10 digit mobile number starting with 6, 7, 8, or 9' });
  }
  if (normalized.toothNumber && !isValidToothNumber(normalized.toothNumber)) {
    return res.status(400).json({ error: 'Tooth number must be between 1 and 32' });
  }
  item.patient = { ...item.patient, ...normalized };
  let appointment = db.appointments.find((record) => record.caseId === item.id || record.queueNumber === item.queueNumber);
  const requestedAppointmentTime = String(req.body.appointmentTime || '').trim();
  const requestedAppointmentDate = normalizeDate(req.body.appointmentDate || '');
  if (requestedAppointmentTime || requestedAppointmentDate) {
    const nextAppointmentTime = requestedAppointmentTime || appointment?.time || item.patient.appointmentTime;
    const nextAppointmentDate = requestedAppointmentDate || (appointment ? appointmentDate(appointment) : item.patient.appointmentDate || today());
    if (!isValidAppointmentTime(nextAppointmentTime)) {
      return res.status(400).json({ error: 'Appointment time must use a 15 minute slot between 09:00 and 18:00' });
    }
    const appointmentDoctorId = appointment?.doctorId || item.assignedDoctorId || '';
    const slotTaken = db.appointments.some((record) => (
      record.id !== appointment?.id
      && isSlotBlockingAppointment(record)
      && record.time === nextAppointmentTime
      && appointmentDate(record) === nextAppointmentDate
      && (record.doctorId || '') === appointmentDoctorId
    ));
    if (slotTaken) {
      return res.status(409).json({ error: 'Appointment time is already allocated to another patient' });
    }
    if (!appointment) {
      appointment = {
        id: nextId('APT', db.appointments.length + 1),
        caseId: item.id,
        queueNumber: item.queueNumber,
        date: nextAppointmentDate,
        time: nextAppointmentTime,
        patientName: item.patient.name,
        type: item.patient.chiefComplaint || 'Consult',
        status: item.status === 'doctor_queue' ? 'doctor_queue' : 'scheduled',
        doctorId: appointmentDoctorId,
        doctorName: item.assignedDoctorName || ''
      };
      db.appointments.push(appointment);
    }
    appointment.patientName = item.patient.name;
    appointment.type = item.patient.chiefComplaint || appointment.type || 'Consult';
    appointment.time = nextAppointmentTime;
    appointment.date = nextAppointmentDate;
    appointment.updatedAt = new Date().toISOString();
    item.patient.appointmentTime = nextAppointmentTime;
    item.patient.appointmentDate = nextAppointmentDate;
  } else if (appointment) {
    appointment.patientName = item.patient.name;
    appointment.type = item.patient.chiefComplaint || appointment.type || 'Consult';
    appointment.updatedAt = new Date().toISOString();
  }
  const fees = normalizeFeeCollection(req.body, { required: false, requireUpiReceipt: false });
  if (fees.feesCollected) item.closure = { ...(item.closure || {}), ...fees };
  const patient = db.patients.find((record) => record.id === item.patientId);
  if (patient) Object.assign(patient, item.patient);
  item.updatedAt = new Date().toISOString();
  log('ASSISTANT_EDIT_PATIENT_BASIC', 'Assistant', item.id);
  res.json({ case: enrichCase(item) });
});

app.patch('/api/cases/:id/doctor-submit', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  const diagnosis = limitText(req.body.diagnosis);
  const treatmentPlan = limitText(req.body.treatmentPlan);
  if (!diagnosis || !treatmentPlan) {
    return res.status(400).json({ error: 'Analysis is pending. Add diagnosis and treatment plan before submitting case.' });
  }

  item.doctor = {
    diagnosis,
    treatmentPlan,
    treatmentStatus: req.body.treatmentStatus || 'Pending',
    doctorNotes: limitText(req.body.doctorNotes),
    testsRequested: Array.isArray(req.body.testsRequested) ? req.body.testsRequested : [],
    prescriptionForm: limitText(req.body.prescriptionForm),
    prescriptionItems: Array.isArray(req.body.prescriptionItems) ? req.body.prescriptionItems : [],
    prescription: req.body.prescription || formatPrescription(req.body.prescriptionItems || []),
    nextVisitDate: req.body.nextVisitDate || '',
    submittedBy: 'Doctor',
    submittedAt: new Date().toISOString()
  };
  const feesAlreadyCollected = Boolean(item.closure?.feesCollected);
  item.status = feesAlreadyCollected ? 'completed' : 'assistant_closure';
  item.visitStatus = feesAlreadyCollected ? 'visit_complete' : 'doctor_done';
  if (feesAlreadyCollected && !item.completedAt) item.completedAt = new Date().toISOString();
  const appointment = findCaseAppointment(item);
  if (appointment) appointment.status = feesAlreadyCollected ? 'complete' : 'doctor_done';
  item.updatedAt = new Date().toISOString();
  item.patient.treatmentStatus = item.doctor.treatmentStatus;
  item.patient.nextFollowUp = item.doctor.nextVisitDate;
  item.patient.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Doctor submitted case', date: today(), note: item.doctor.diagnosis || 'Clinical details added' });
  db.prescriptions.unshift({
    id: nextId('P', db.prescriptions.length + 1),
    patientId: item.patientId,
    patientName: item.patient.name,
    title: item.doctor.prescriptionForm || 'Prescription',
    status: 'Issued',
    date: today(),
    description: item.doctor.prescription
  });
  log('DOCTOR_SUBMIT_CASE', 'Doctor', item.id);
  res.json({ case: item });
});

app.patch('/api/cases/:id/doctor-cancel', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  if (item.status === 'completed') return res.status(409).json({ error: 'Completed visit cannot be cancelled' });
  if (item.status === 'cancelled') return res.status(409).json({ error: 'Visit is already cancelled' });

  item.status = 'cancelled';
  item.visitStatus = 'cancelled_by_doctor';
  item.updatedAt = new Date().toISOString();
  item.patient.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Doctor cancelled case', date: today(), note: req.body.reason || 'Cancelled by doctor' });
  releaseAppointmentSlot(item);
  log('DOCTOR_CANCEL_CASE', req.body.actor || 'Doctor', item.id);
  res.json({ case: item });
});

app.patch('/api/cases/:id/visit-complete', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  const actor = req.body.actor || 'Assistant';
  if (actor !== 'Doctor' && !canAssistantMarkComplete(item)) {
    return res.status(409).json({ error: 'Collect fees first. UPI payment requires receipt capture before completion.' });
  }

  item.status = 'completed';
  item.visitStatus = 'visit_complete';
  item.updatedAt = new Date().toISOString();
  item.patient.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Visit complete', date: today(), note: 'Marked complete by clinic staff' });
  const appointment = findCaseAppointment(item);
  if (appointment) appointment.status = 'complete';
  log('MARK_VISIT_COMPLETE', actor, item.id);
  res.json({ case: item });
});

app.patch('/api/cases/:id/cancel-visit', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  if (item.status === 'completed') return res.status(409).json({ error: 'Completed visit cannot be cancelled' });

  item.status = 'cancelled';
  item.visitStatus = 'cancelled';
  item.updatedAt = new Date().toISOString();
  item.patient.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Visit cancelled', date: today(), note: 'Cancelled by assistant before doctor completion' });
  releaseAppointmentSlot(item);
  log('CANCEL_VISIT', req.body.actor || 'Assistant', item.id);
  res.json({ case: item });
});

app.patch('/api/cases/:id/assistant-close', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  const optionalBeforeDoctor = !canAssistantCollectFees(item) && ['assistant_intake', 'doctor_queue'].includes(item.status);
  const updateAlreadyCollectedFees = canAssistantMarkComplete(item);
  const updateCompletedFees = isCompletedCase(item) && item.closure?.feesCollected;
  if (!canAssistantCollectFees(item) && !optionalBeforeDoctor && !updateAlreadyCollectedFees && !updateCompletedFees) {
    return res.status(409).json({ error: 'Doctor has not completed analysis yet. Assistant can save optional fees, but cannot close work.' });
  }
  if (item.status === 'completed' && !updateCompletedFees) {
    return res.status(409).json({ error: 'Visit is already complete.' });
  }
  const fees = normalizeFeeCollection(req.body, { required: true, requireUpiReceipt: !optionalBeforeDoctor });
  item.closure = { ...(item.closure || {}), ...fees };
  if (!item.closure.closedAt) item.closure.closedAt = new Date().toISOString();
  if (!item.closure.closedBy) item.closure.closedBy = 'Assistant';
  item.updatedAt = new Date().toISOString();
  if (updateCompletedFees) {
    item.status = 'completed';
    item.visitStatus = 'visit_complete';
    if (!item.completedAt) item.completedAt = new Date().toISOString();
    const appointment = findCaseAppointment(item);
    if (appointment) {
      appointment.status = 'complete';
      appointment.updatedAt = item.updatedAt;
    }
  } else if (!optionalBeforeDoctor) {
    item.status = 'assistant_closure';
    item.visitStatus = 'assistant_work_done';
  }
  item.patient.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Assistant fees collection', date: today(), note: 'Fees and payment details updated' });
  log('ASSISTANT_CLOSE_CASE', 'Assistant', item.id);
  res.json({ case: item });
});

app.get('/api/patients', (req, res) => {
  res.json({ patients: db.patients });
});

app.get('/api/patients/lookup', (req, res) => {
  const mobile = compactMobile(req.query.mobile);
  const hospitalId = String(req.query.hospitalId || '').trim();
  if (!mobile) return res.status(400).json({ error: 'Mobile number is required' });
  const matches = db.patients.filter((item) => (
    compactMobile(item.mobile) === mobile && (!hospitalId || patientHospitalId(item) === hospitalId)
  ));
  const patients = matches.map(patientFullSummary);
  const patient = patients[0];
  if (!patient) return res.json({ patient: null });
  res.json({ patient, patients });
});

app.get('/api/patients/:id', (req, res) => {
  const patient = db.patients.find((item) => item.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient: { ...patient, ...patientFullSummary(patient) } });
});

app.get('/api/patients/:id/visits', (req, res) => {
  res.json({ visits: db.visits.filter((item) => item.patientId === req.params.id) });
});

app.get('/api/patients/:id/prescriptions', (req, res) => {
  res.json({ prescriptions: db.prescriptions.filter((item) => item.patientId === req.params.id) });
});

app.get('/api/patients/:id/documents', (req, res) => {
  res.json({ documents: db.documents.filter((item) => item.patientId === req.params.id) });
});

app.get('/api/reminders', (req, res) => {
  res.json({ reminders: db.reminders });
});

app.get('/api/prescriptions', (req, res) => {
  res.json({ prescriptions: db.prescriptions });
});

app.get('/api/fees-summary', (req, res) => {
  const date = String(req.query.date || today()).slice(0, 10);
  const doctorId = String(req.query.doctorId || '').trim();
  const assistant = findAssistant('', req.query.assistantEmail);
  const doctor = findDoctor(req.query.doctorId, req.query.doctorEmail);
  const mappedDoctorIds = assistant ? getMappedDoctorIdsForAssistant(assistant) : [];
  const allowedDoctorIds = doctor ? [doctor.id] : (doctorId ? [doctorId] : mappedDoctorIds);
  const paidCases = db.cases.filter((item) => (
    item.closure?.closedAt
    && item.closure?.feesCollected
    && item.closure.closedAt.slice(0, 10) === date
    && (!allowedDoctorIds.length || allowedDoctorIds.includes(item.assignedDoctorId))
  ));
  const readyCases = db.cases.filter((item) => (
    canAssistantCollectFees(item)
    && (!allowedDoctorIds.length || allowedDoctorIds.includes(item.assignedDoctorId))
  ));
  res.json({
    date,
    doctorId,
    summary: buildFeesSummary(paidCases),
    doctorWise: buildDoctorFeeSummary(paidCases),
    cases: paidCases,
    readyCases
  });
});

app.get('/api/fees-reconciliations', (req, res) => {
  const doctorId = String(req.query.doctorId || '').trim();
  const date = String(req.query.date || '').slice(0, 10);
  const assistant = findAssistant('', req.query.assistantEmail);
  const doctor = findDoctor(req.query.doctorId, req.query.doctorEmail);
  let reconciliations = db.feeReconciliations || [];
  if (assistant) reconciliations = reconciliations.filter((item) => item.assistantId === assistant.id);
  if (doctor) reconciliations = reconciliations.filter((item) => item.doctorId === doctor.id);
  if (doctorId) reconciliations = reconciliations.filter((item) => item.doctorId === doctorId);
  if (date) reconciliations = reconciliations.filter((item) => item.date === date);
  if (req.query.status) reconciliations = reconciliations.filter((item) => item.status === req.query.status);
  res.json({ reconciliations });
});

app.post('/api/fees-reconciliations', (req, res) => {
  const assistant = findAssistant('', req.body.assistantEmail);
  if (!assistant) return res.status(404).json({ error: 'Assistant not found' });
  const doctor = findDoctor(req.body.doctorId, req.body.doctorEmail);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  if (!getMappedDoctorIdsForAssistant(assistant).includes(doctor.id)) {
    return res.status(403).json({ error: 'Assistant is not mapped to selected doctor' });
  }
  const date = String(req.body.date || today()).slice(0, 10);
  const paidCases = db.cases.filter((item) => (
    item.assignedDoctorId === doctor.id
    && item.closure?.closedAt
    && item.closure?.feesCollected
    && item.closure.closedAt.slice(0, 10) === date
  ));
  if (!paidCases.length) return res.status(400).json({ error: 'No fees collected for selected doctor and date' });
  const existingOpen = (db.feeReconciliations ||= []).find((item) => (
    item.assistantId === assistant.id && item.doctorId === doctor.id && item.date === date && item.status === 'Open'
  ));
  if (existingOpen) return res.status(409).json({ error: 'Fees reconciliation is already open for this doctor and date' });
  const summary = buildFeesSummary(paidCases);
  const reconciliation = {
    id: nextId('RECON', db.feeReconciliations.length + 1),
    date,
    assistantId: assistant.id,
    assistantName: assistant.name,
    doctorId: doctor.id,
    doctorName: doctor.name,
    hospitalId: doctor.hospitalId || assistant.hospitalId || '',
    cashAmount: summary.cashAmount,
    upiAmount: summary.upiAmount,
    totalAmount: summary.totalAmount,
    cashCount: summary.cashCount,
    upiCount: summary.upiCount,
    caseIds: paidCases.map((item) => item.id),
    status: 'Open',
    submittedAt: new Date().toISOString(),
    approvedAt: ''
  };
  db.feeReconciliations.unshift(reconciliation);
  addNotification(doctor.email, 'Fees reconciliation submitted', `${assistant.name} submitted ${formatMoney(summary.totalAmount)} for ${date}`, 'fees-reconciliation', reconciliation.id);
  log('ASSISTANT_SUBMIT_FEES_RECONCILIATION', assistant.name, reconciliation.id, { entityType: 'FeesReconciliation', entityId: reconciliation.id, description: `Submitted fees reconciliation to ${doctor.name}` });
  res.status(201).json({ reconciliation });
});

app.patch('/api/fees-reconciliations/:id/approve', (req, res) => {
  const reconciliation = (db.feeReconciliations || []).find((item) => item.id === req.params.id);
  if (!reconciliation) return res.status(404).json({ error: 'Fees reconciliation not found' });
  if (reconciliation.status === 'Closed') return res.status(409).json({ error: 'Fees reconciliation is already closed' });
  reconciliation.status = 'Closed';
  reconciliation.approvedAt = new Date().toISOString();
  reconciliation.approvedBy = req.body.actor || 'Doctor';
  addNotification('', 'Fees reconciliation closed', `${reconciliation.doctorName} confirmed fees received`, 'fees-reconciliation', reconciliation.id, reconciliation.assistantId);
  log('DOCTOR_APPROVE_FEES_RECONCILIATION', req.body.actor || reconciliation.doctorName, reconciliation.id, { entityType: 'FeesReconciliation', entityId: reconciliation.id, outcome: 'Closed' });
  res.json({ reconciliation });
});

app.get('/api/notifications', (req, res) => {
  const email = normalizeEmail(req.query.email);
  const user = db.users.find((item) => normalizeEmail(item.email) === email);
  const notifications = (db.notifications || []).filter((item) => (
    item.userId === user?.id || normalizeEmail(item.email) === email || (!item.userId && !item.email)
  ));
  res.json({ notifications });
});

app.patch('/api/notifications/read-all', (req, res) => {
  const email = normalizeEmail(req.body.email || req.headers['x-user-email']);
  const user = db.users.find((item) => normalizeEmail(item.email) === email);
  let updated = 0;
  for (const item of db.notifications || []) {
    const matches = item.userId === user?.id || normalizeEmail(item.email) === email || (!item.userId && !item.email);
    if (matches && item.status !== 'Read') {
      item.status = 'Read';
      item.readAt = new Date().toISOString();
      updated += 1;
    }
  }
  res.json({ updated });
});

app.patch('/api/notifications/clear-all', (req, res) => {
  const email = normalizeEmail(req.body.email || req.headers['x-user-email']);
  const user = db.users.find((item) => normalizeEmail(item.email) === email);
  let removed = 0;
  db.notifications = (db.notifications || []).filter((item) => {
    const matches = item.userId === user?.id || normalizeEmail(item.email) === email || (!item.userId && !item.email);
    if (matches) removed += 1;
    return !matches;
  });
  res.json({ removed });
});

app.patch('/api/notifications/:id/read', (req, res) => {
  const item = (db.notifications || []).find((notification) => notification.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Notification not found' });
  item.status = 'Read';
  item.readAt = item.readAt || new Date().toISOString();
  res.json({ notification: item });
});

app.get('/api/users', (req, res) => {
  res.json({ users: db.users.map((user) => withHospital(user)) });
});

app.get('/api/users/me', (req, res) => {
  const user = findUserByEmail(req.query.email || req.headers['x-user-email']);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: withHospital(user) });
});

app.patch('/api/users/profile-photo', (req, res) => {
  const user = findUserByEmail(req.body.email || req.headers['x-user-email']);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status !== 'Active') return res.status(403).json({ error: 'Only active users can update profile photo' });
  const action = req.body.action === 'delete' ? 'delete' : 'save';
  if (action === 'delete') {
    user.profilePhoto = '';
    log('USER_DELETE_PROFILE_PHOTO', user.name, user.id, { req, module: 'Profile', actorRole: user.role, entityType: 'User', entityId: user.id });
    return res.json({ user: withHospital(user) });
  }
  const profilePhoto = String(req.body.profilePhoto || '');
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(profilePhoto)) {
    return res.status(400).json({ error: 'Upload a PNG, JPG, or WEBP profile photo' });
  }
  if (profilePhoto.length > 220000) {
    return res.status(400).json({ error: 'Profile photo is too large. Please upload a smaller image or retry so it can be compressed.' });
  }
  user.profilePhoto = profilePhoto;
  log('USER_UPDATE_PROFILE_PHOTO', user.name, user.id, { req, module: 'Profile', actorRole: user.role, entityType: 'User', entityId: user.id });
  res.json({ user: withHospital(user) });
});

app.get('/api/hospitals', (req, res) => {
  res.json({ hospitals: db.hospitals || [] });
});

app.post('/api/hospitals', (req, res) => {
  const hospital = createHospital(req.body);
  db.hospitals.unshift(hospital);
  log('ADMIN_ADD_HOSPITAL', req.body.actor || 'Admin', hospital.id, { entityType: 'Hospital', entityId: hospital.id });
  res.status(201).json({ hospital });
});

app.patch('/api/hospitals/:id', (req, res) => {
  const hospital = db.hospitals.find((item) => item.id === req.params.id);
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' });
  Object.assign(hospital, pick(req.body, ['name', 'code', 'city', 'status', 'description']));
  log('ADMIN_UPDATE_HOSPITAL', req.body.actor || 'Admin', hospital.id, { entityType: 'Hospital', entityId: hospital.id });
  res.json({ hospital });
});

app.delete('/api/hospitals/:id', (req, res) => {
  const inUse = db.users.some((user) => user.hospitalId === req.params.id);
  if (inUse) return res.status(409).json({ error: 'Hospital is assigned to users and cannot be deleted' });
  const deleted = removeById(db.hospitals, req.params.id, 'Hospital');
  if (deleted.error) return res.status(404).json(deleted);
  log('ADMIN_DELETE_HOSPITAL', req.body?.actor || 'Admin', deleted.item.id, { entityType: 'Hospital', entityId: deleted.item.id });
  res.json({ deleted: deleted.item });
});

app.get('/api/doctor-assistant-mappings', (req, res) => {
  const doctor = findDoctor(req.query.doctorId, req.query.doctorEmail);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  const hospital = db.hospitals.find((item) => item.id === doctor.hospitalId) || null;
  const assistants = db.users
    .filter((user) => user.role === 'Assistant' && user.status === 'Active' && user.hospitalId === doctor.hospitalId)
    .map((user) => withHospital(user));
  const mapping = getDoctorAssistantMapping(doctor);
  res.json({
    doctor: withHospital(doctor),
    hospital,
    assistants,
    mappedAssistantIds: mapping.assistantIds || [],
    mapping
  });
});

app.get('/api/doctor-assistant-mappings-master', (req, res) => {
  const doctors = db.users
    .filter((user) => user.role === 'Doctor' && user.status === 'Active')
    .map((user) => withHospital(user));
  const assistants = db.users
    .filter((user) => user.role === 'Assistant' && user.status === 'Active')
    .map((user) => withHospital(user));
  const mappings = doctors.map((doctor) => {
    const mapping = getDoctorAssistantMapping(doctor);
    const mappedAssistants = assistants.filter((assistant) => mapping.assistantIds?.includes(assistant.id));
    return {
      id: mapping.id,
      doctorId: doctor.id,
      doctorName: doctor.name,
      doctorEmail: doctor.email,
      hospitalId: doctor.hospitalId,
      hospitalName: doctor.hospitalName,
      assistantIds: mapping.assistantIds || [],
      assistants: mappedAssistants,
      updatedAt: mapping.updatedAt
    };
  });
  res.json({ doctors, assistants, mappings });
});

app.get('/api/assistant-doctor-options', (req, res) => {
  const assistant = findAssistant(req.query.assistantId, req.query.assistantEmail);
  if (!assistant) return res.status(404).json({ error: 'Assistant not found' });
  const mappings = (db.doctorAssistantMappings || []).filter((mapping) => mapping.assistantIds?.includes(assistant.id));
  const doctors = mappings
    .map((mapping) => db.users.find((user) => user.id === mapping.doctorId && user.role === 'Doctor' && user.status === 'Active'))
    .filter(Boolean)
    .filter((doctor) => doctor.hospitalId === assistant.hospitalId)
    .map((doctor) => withHospital(doctor));
  const hospital = db.hospitals.find((item) => item.id === assistant.hospitalId) || null;
  res.json({ assistant: withHospital(assistant), hospital, doctors });
});

app.post('/api/doctor-assistant-mappings', (req, res) => {
  const doctor = findDoctor(req.body.doctorId, req.body.doctorEmail);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  if (!doctor.hospitalId) return res.status(400).json({ error: 'Doctor is not mapped to a hospital' });
  const requestedIds = Array.isArray(req.body.assistantIds) ? req.body.assistantIds : [];
  const allowedAssistants = db.users.filter((user) => (
    user.role === 'Assistant' && user.status === 'Active' && user.hospitalId === doctor.hospitalId
  ));
  const allowedIds = new Set(allowedAssistants.map((user) => user.id));
  const assistantIds = [...new Set(requestedIds)].filter((id) => allowedIds.has(id));
  const mapping = getDoctorAssistantMapping(doctor);
  const removedIds = (mapping.assistantIds || []).filter((id) => !assistantIds.includes(id));
  const blockingCases = db.cases.filter((item) => {
    if (item.assignedDoctorId !== doctor.id) return false;
    if (['completed', 'cancelled'].includes(item.status) || ['visit_complete', 'visit_cancelled'].includes(item.visitStatus)) return false;
    return removedIds.some((assistantId) => {
      const assistant = allowedAssistants.find((user) => user.id === assistantId);
      return item.assistantId === assistantId || (assistant && item.assistant?.intakeBy === assistant.name);
    });
  });
  if (blockingCases.length) {
    return res.status(409).json({
      error: `Cannot unmap assistant while ${blockingCases.length} patient case(s) are still open. Mark those cases complete or cancel them first.`,
      cases: blockingCases.map((item) => ({ id: item.id, patientName: item.patient?.name, status: item.status }))
    });
  }
  mapping.assistantIds = assistantIds;
  mapping.hospitalId = doctor.hospitalId;
  mapping.updatedAt = new Date().toISOString();
  log('DOCTOR_UPDATE_ASSISTANT_MAPPING', doctor.name, doctor.id, { entityType: 'DoctorAssistantMapping', entityId: mapping.id, actorRole: 'Doctor', description: `Mapped ${assistantIds.length} assistant(s)` });
  res.json({
    mapping,
    assistants: allowedAssistants.filter((assistant) => assistantIds.includes(assistant.id)).map((user) => withHospital(user))
  });
});

app.post('/api/users', (req, res) => {
  const user = createUser(req.body);
  if (user.status === 'Active') ensureUserSubscription(user);
  db.users.unshift(user);
  log('ADMIN_ADD_USER', req.body.actor || 'Admin', user.email);
  res.status(201).json({ user: withHospital(user) });
});

app.patch('/api/users/:id', (req, res) => {
  const user = db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  Object.assign(user, pick(req.body, ['name', 'email', 'role', 'requestedRole', 'hospitalId', 'status', 'description']));
  if (user.status === 'Active') ensureUserSubscription(user);
  log('ADMIN_UPDATE_USER', req.body.actor || 'Admin', user.id);
  res.json({ user: withHospital(user) });
});

app.patch('/api/users/:id/approve', (req, res) => {
  const user = db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const role = ['Assistant', 'Doctor', 'Super Admin', 'Viewer'].includes(req.body.role) ? req.body.role : user.requestedRole;
  if (!role || role === 'Pending') return res.status(400).json({ error: 'Admin must assign a role before approval' });
  user.role = role;
  user.status = 'Active';
  user.description = req.body.description || `Approved as ${role}`;
  ensureUserSubscription(user);
  log('ADMIN_APPROVE_USER', req.body.actor || 'Admin', user.id, { req, module: 'User Approval', actorRole: 'Super Admin', entityType: 'User', entityId: user.id, description: `User approved as ${role}` });
  res.json({ user: withHospital(user) });
});

app.patch('/api/users/:id/reject', (req, res) => {
  const user = db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.status = 'Rejected';
  user.description = req.body.description || 'Access request rejected by admin';
  log('ADMIN_REJECT_USER', req.body.actor || 'Admin', user.id, { req, module: 'User Approval', actorRole: 'Super Admin', entityType: 'User', entityId: user.id, outcome: 'Rejected', description: 'User access request rejected' });
  res.json({ user });
});

app.delete('/api/users/:id', (req, res) => {
  const deleted = removeById(db.users, req.params.id, 'User');
  if (deleted.error) return res.status(404).json(deleted);
  log('ADMIN_DELETE_USER', req.body?.actor || 'Admin', deleted.item.id);
  res.json({ deleted: deleted.item });
});

app.get('/api/roles', (req, res) => {
  res.json({ roles: db.roles });
});

app.post('/api/roles', (req, res) => {
  const role = createRole(req.body);
  db.roles.unshift(role);
  log('ADMIN_ADD_ROLE', req.body.actor || 'Admin', role.role);
  res.status(201).json({ role });
});

app.patch('/api/roles/:id', (req, res) => {
  const role = db.roles.find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  Object.assign(role, createRole({ ...role, ...req.body, id: role.id }));
  log('ADMIN_UPDATE_ROLE', req.body.actor || 'Admin', role.id);
  res.json({ role });
});

app.delete('/api/roles/:id', (req, res) => {
  const deleted = removeById(db.roles, req.params.id, 'Role');
  if (deleted.error) return res.status(404).json(deleted);
  log('ADMIN_DELETE_ROLE', req.body?.actor || 'Admin', deleted.item.id);
  res.json({ deleted: deleted.item });
});

app.get('/api/medicines', (req, res) => {
  res.json({ medicines: db.medicines });
});

app.get('/api/medicines/template.xlsx', (req, res) => {
  sendWorkbook(res, medicineWorkbook([
    {
      Name: 'Amoxicillin 500mg',
      Generic: 'Amoxicillin',
      Description: '1 capsule three times daily after food for 5 days'
    },
    {
      Name: 'Ibuprofen 400mg',
      Generic: 'Ibuprofen',
      Description: '1 tablet twice daily after food for pain'
    }
  ]), 'SmileRecords_Medicine_Upload_Template.xlsx');
});

app.get('/api/medicines/export.xlsx', (req, res) => {
  const rows = db.medicines.map((medicine) => ({
    Id: medicine.id,
    Name: medicine.name,
    Generic: medicine.generic || '',
    Description: medicine.description || ''
  }));
  sendWorkbook(res, medicineWorkbook(rows.length ? rows : [{ Id: '', Name: '', Generic: '', Description: '' }]), 'SmileRecords_Medicines.xlsx');
});

app.post('/api/medicines/bulk-upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload an Excel file first' });
  const rows = parseMedicineWorkbook(req.file.buffer);
  if (!rows.length) return res.status(400).json({ error: 'No medicine rows found in uploaded file' });
  const result = upsertMedicines(rows);
  log('ADMIN_BULK_UPLOAD_MEDICINES', req.body.actor || 'Admin', `${result.created} created, ${result.updated} updated`, { entityType: 'Medicine', entityId: 'bulk-upload' });
  res.json(result);
});

app.post('/api/medicines', (req, res) => {
  const medicine = createMedicine(req.body);
  db.medicines.unshift(medicine);
  log('ADMIN_ADD_MEDICINE', req.body.actor || 'Admin', medicine.name);
  res.status(201).json({ medicine });
});

app.patch('/api/medicines/:id', (req, res) => {
  const medicine = db.medicines.find((item) => item.id === req.params.id);
  if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
  Object.assign(medicine, pick(req.body, ['name', 'generic', 'description']));
  log('ADMIN_UPDATE_MEDICINE', req.body.actor || 'Admin', medicine.id);
  res.json({ medicine });
});

app.delete('/api/medicines/:id', (req, res) => {
  const deleted = removeById(db.medicines, req.params.id, 'Medicine');
  if (deleted.error) return res.status(404).json(deleted);
  log('ADMIN_DELETE_MEDICINE', req.body?.actor || 'Admin', deleted.item.id);
  res.json({ deleted: deleted.item });
});

app.get('/api/tests', (req, res) => {
  res.json({ tests: db.tests });
});

app.post('/api/tests', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Test name is required' });
  const test = {
    id: `TEST-${Date.now()}`,
    name,
    type: req.body.type || 'Test',
    description: req.body.description || ''
  };
  db.tests.unshift(test);
  log('ADMIN_ADD_TEST_MASTER', 'Admin', name);
  res.status(201).json({ test });
});

app.delete('/api/tests/:id', (req, res) => {
  const index = db.tests.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Test not found' });
  const [removed] = db.tests.splice(index, 1);
  log('ADMIN_DELETE_TEST_MASTER', 'Admin', removed.name);
  res.json({ deleted: removed });
});

app.get('/api/templates', (req, res) => {
  res.json({ templates: db.templates });
});

app.post('/api/templates', (req, res) => {
  const template = createTemplate(req.body);
  db.templates.unshift(template);
  log('ADMIN_ADD_TEMPLATE', req.body.actor || 'Admin', template.title);
  res.status(201).json({ template });
});

app.patch('/api/templates/:id', (req, res) => {
  const template = db.templates.find((item) => item.id === req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  Object.assign(template, pick(req.body, ['title', 'description']));
  log('ADMIN_UPDATE_TEMPLATE', req.body.actor || 'Admin', template.id);
  res.json({ template });
});

app.delete('/api/templates/:id', (req, res) => {
  const deleted = removeById(db.templates, req.params.id, 'Template');
  if (deleted.error) return res.status(404).json(deleted);
  log('ADMIN_DELETE_TEMPLATE', req.body?.actor || 'Admin', deleted.item.id);
  res.json({ deleted: deleted.item });
});

app.get('/api/audit', (req, res) => {
  res.json({
    audit: db.audit,
    schema: {
      requiredFields: [
        'id',
        'timestamp',
        'action',
        'module',
        'actor',
        'actorRole',
        'entityType',
        'entityId',
        'outcome',
        'sourceIp',
        'method',
        'path',
        'description'
      ],
      purpose: 'Essential activity review for patient, clinical, authorization, and system events'
    }
  });
});

app.get('/api/analytics', (req, res) => {
  res.json({
    charts: [
      { title: 'Case Movement', points: [{ label: 'Intake', value: 42 }, { label: 'Doctor', value: 65 }, { label: 'Assist', value: 38 }, { label: 'Closed', value: 74 }, { label: 'Tests', value: 46 }, { label: 'Rx', value: 58 }] },
      { title: 'Doctor Load', points: [{ label: 'Mon', value: 54 }, { label: 'Tue', value: 71 }, { label: 'Wed', value: 49 }, { label: 'Thu', value: 66 }, { label: 'Fri', value: 59 }, { label: 'Sat', value: 31 }] },
      { title: 'Revenue Steps', points: [{ label: 'Fees', value: 80 }, { label: 'Xray', value: 48 }, { label: 'Rpt', value: 32 }, { label: 'Due', value: 22 }, { label: 'Paid', value: 76 }, { label: 'Close', value: 68 }] },
      { title: 'Authorization', points: [{ label: 'Admin', value: 30 }, { label: 'Doc', value: 52 }, { label: 'Asst', value: 62 }, { label: 'View', value: 22 }, { label: 'Pend', value: 18 }, { label: 'Audit', value: 70 }] }
    ]
  });
});

const clientDistPath = join(__dirname, '..', 'dist');
if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'));
  });
}

function normalizePatient(patient) {
  return {
    name: patient.name || '',
    mobile: compactMobile(patient.mobile),
    age: patient.age || '',
    gender: patient.gender || '',
    city: patient.city || '',
    address: patient.address || '',
    chiefComplaint: patient.chiefComplaint || '',
    painLevel: patient.painLevel || '',
    toothNumber: patient.toothNumber || '',
    appointmentTime: patient.appointmentTime || '',
    appointmentDate: patient.appointmentDate || '',
    hospitalId: patient.hospitalId || '',
    medicalFlags: Array.isArray(patient.medicalFlags) ? patient.medicalFlags : [],
    guardian: patient.guardian || '',
    consent: Boolean(patient.consent)
  };
}

function isValidMobile(value) {
  return /^[6-9]\d{9}$/.test(compactMobile(value));
}

function isValidToothNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 32;
}

function compactMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function sameText(left = '', right = '') {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function patientHospitalId(patient) {
  return patient.hospitalId || 'HOSP-1';
}

function patientSummary(patient) {
  return {
    id: patient.id,
    name: patient.name,
    mobile: compactMobile(patient.mobile),
    hospitalId: patientHospitalId(patient),
    lastVisitDate: patient.lastVisitDate || patient.timeline?.[0]?.date || '',
    treatmentStatus: patient.treatmentStatus || ''
  };
}

function enrichCase(item) {
  const appointment = db.appointments.find((record) => record.caseId === item.id || record.queueNumber === item.queueNumber);
  return {
    ...item,
    patient: {
      ...item.patient,
      appointmentTime: item.patient?.appointmentTime || appointment?.time || '',
      appointmentDate: item.patient?.appointmentDate || (appointment ? appointmentDate(appointment) : ''),
      historyDays: patientHistoryDays(item.patient)
    },
    appointment
  };
}

function patientFullSummary(patient) {
  return {
    ...patientSummary(patient),
    age: patient.age || '',
    gender: patient.gender || '',
    city: patient.city || '',
    address: patient.address || '',
    chiefComplaint: patient.chiefComplaint || '',
    toothNumber: patient.toothNumber || '',
    medicalFlags: patient.medicalFlags || patient.flags || [],
    historyDays: patientHistoryDays(patient)
  };
}

function patientHistoryDays(patient) {
  const events = [];
  for (const entry of patient.timeline || []) {
    events.push({
      date: entry.date || today(),
      title: entry.title || 'Timeline',
      note: entry.note || ''
    });
  }
  for (const item of db.cases.filter((record) => record.patientId === patient.id)) {
    events.push({
      date: (item.createdAt || today()).slice(0, 10),
      title: `Case ${item.queueNumber} - ${formatStatusText(item.status)}`,
      note: item.doctor?.diagnosis || item.patient?.chiefComplaint || item.visitStatus || ''
    });
    if (item.doctor?.submittedAt) {
      events.push({
        date: item.doctor.submittedAt.slice(0, 10),
        title: 'Doctor analysis',
        note: item.doctor.diagnosis || item.doctor.treatmentPlan || ''
      });
    }
    if (item.closure?.closedAt) {
      events.push({
        date: item.closure.closedAt.slice(0, 10),
        title: 'Fees collection',
        note: `${item.closure.paymentMode || 'Payment'} ${formatMoney(toAmount(item.closure.feesCollected))}`
      });
    }
  }
  for (const visit of db.visits.filter((item) => item.patientId === patient.id)) {
    events.push({ date: visit.date || today(), title: visit.title || 'Visit', note: visit.note || '' });
  }
  for (const prescription of db.prescriptions.filter((item) => item.patientId === patient.id)) {
    events.push({ date: prescription.date || today(), title: `Prescription - ${prescription.title}`, note: prescription.description || '' });
  }
  for (const document of db.documents.filter((item) => item.patientId === patient.id)) {
    events.push({ date: document.date || today(), title: document.title || 'Document', note: `${document.type || ''} ${document.status || ''}`.trim() });
  }

  const grouped = new Map();
  for (const event of events) {
    const date = event.date || today();
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(event);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({ date, items }));
}

function formatStatusText(value = '') {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPrescription(items) {
  return (items || []).map((item) => {
    const dose = item.dosePattern ? ` [${item.dosePattern}]` : '';
    const masterDetails = [
      item.selectedStrength,
      item.selectedDosageForm,
      item.selectedUse
    ].filter((value) => value && value !== '-').join(' - ');
    const suggestion = item.doseSuggestion || item.description || item.generic || '';
    return `${item.name}${masterDetails ? ` - ${masterDetails}` : ''}${dose}${suggestion ? ` - ${suggestion}` : ''}`.trim();
  }).join('; ');
}

function limitText(value = '', maxLength = 300) {
  return String(value || '').trim().slice(0, maxLength);
}

function isValidAppointmentTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return false;
  const [hours, minutes] = value.split(':').map(Number);
  const total = hours * 60 + minutes;
  const start = 9 * 60;
  const end = 18 * 60;
  return total >= start && total <= end && minutes % 15 === 0;
}

function countCases(status) {
  return db.cases.filter((item) => item.status === status).length;
}

function normalizeDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00.000Z`)) ? text : '';
}

function validateDateRange(from, to) {
  const fromTime = Date.parse(`${from}T00:00:00.000Z`);
  const toTime = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return { error: 'Select a valid date range.' };
  if (fromTime > toTime) return { error: 'From date cannot be after To date.' };
  const days = Math.floor((toTime - fromTime) / 86400000) + 1;
  if (days > 366) return { error: 'Date range cannot be more than 366 days.' };
  return { days };
}

function isInDateRange(value, from, to) {
  const date = normalizeDate(value);
  return Boolean(date && date >= from && date <= to);
}

function isCompletedCase(item) {
  return item.status === 'completed' || item.visitStatus === 'visit_complete';
}

function isCancelledCase(item) {
  return item.status === 'cancelled' || String(item.visitStatus || '').includes('cancelled');
}

function caseCompletionDate(item) {
  return (item.completedAt || item.closure?.closedAt || item.updatedAt || item.doctor?.submittedAt || item.createdAt || today()).slice(0, 10);
}

function caseDashboardDate(item) {
  const appointment = db.appointments.find((record) => record.caseId === item.id || record.queueNumber === item.queueNumber);
  return (item.patient?.appointmentDate || appointment?.date || item.createdAt || item.updatedAt || today()).slice(0, 10);
}

function caseActivityDate(item) {
  return (item.closure?.closedAt || item.doctor?.submittedAt || item.updatedAt || item.createdAt || today()).slice(0, 10);
}

function toAmount(value) {
  return Number(String(value || '0').replace(/[^\d.]/g, '')) || 0;
}

function buildFeesSummary(cases) {
  return cases.reduce((summary, item) => {
    const entries = closureFeeEntries(item.closure);
    if (!entries.length) return summary;
    summary.totalAmount += entries.reduce((sum, entry) => sum + toAmount(entry.amount || entry.feesCollected), 0);
    summary.totalCount += 1;
    for (const entry of entries) {
      const amount = toAmount(entry.amount || entry.feesCollected);
      if (entry.paymentMode === 'UPI') {
        summary.upiAmount += amount;
        summary.upiCount += 1;
      } else {
        summary.cashAmount += amount;
        summary.cashCount += 1;
      }
    }
    return summary;
  }, { totalAmount: 0, cashAmount: 0, upiAmount: 0, totalCount: 0, cashCount: 0, upiCount: 0 });
}

function closureFeeEntries(closure = {}) {
  if (Array.isArray(closure.feeEntries) && closure.feeEntries.length) {
    return closure.feeEntries
      .map((entry) => ({
        amount: String(entry.amount || entry.feesCollected || '').trim(),
        paymentMode: ['Cash', 'UPI'].includes(entry.paymentMode) ? entry.paymentMode : 'Cash',
        receiptCapture: String(entry.receiptCapture || '').trim(),
        assistantNotes: String(entry.assistantNotes || '').trim(),
        collectedAt: entry.collectedAt || closure.closedAt || ''
      }))
      .filter((entry) => entry.amount);
  }
  if (!closure.feesCollected) return [];
  return [{
    amount: String(closure.feesCollected).trim(),
    paymentMode: ['Cash', 'UPI'].includes(closure.paymentMode) ? closure.paymentMode : 'Cash',
    receiptCapture: String(closure.receiptCapture || '').trim(),
    assistantNotes: String(closure.assistantNotes || '').trim(),
    collectedAt: closure.closedAt || ''
  }];
}

function normalizeFeeCollection(source = {}, options = {}) {
  const rawEntries = Array.isArray(source.feeEntries)
    ? source.feeEntries
    : (Array.isArray(source.closure?.feeEntries) ? source.closure.feeEntries : []);
  const entries = rawEntries
    .map((entry) => ({
      amount: String(entry.amount || entry.feesCollected || '').trim(),
      paymentMode: ['Cash', 'UPI'].includes(entry.paymentMode) ? entry.paymentMode : '',
      receiptCapture: String(entry.receiptCapture || '').trim(),
      assistantNotes: String(entry.assistantNotes || '').trim(),
      collectedAt: entry.collectedAt || new Date().toISOString()
    }))
    .filter((entry) => entry.amount);
  if (!entries.length && (source.feesCollected || source.closure?.feesCollected)) {
    entries.push({
      amount: String(source.feesCollected || source.closure?.feesCollected || '').trim(),
      paymentMode: ['Cash', 'UPI'].includes(source.paymentMode || source.closure?.paymentMode)
        ? (source.paymentMode || source.closure?.paymentMode)
        : '',
      receiptCapture: String(source.receiptCapture || source.closure?.receiptCapture || '').trim(),
      assistantNotes: String(source.assistantNotes || source.closure?.assistantNotes || '').trim(),
      collectedAt: source.closure?.closedAt || new Date().toISOString()
    });
  }
  if (!entries.length) {
    if (options.required) throwHttp(400, 'Fees collected amount is required');
    return {};
  }
  for (const entry of entries) {
    if (!entry.paymentMode) throwHttp(400, 'Select payment mode Cash or UPI');
    if (entry.paymentMode === 'UPI' && options.requireUpiReceipt && !entry.receiptCapture) {
      throwHttp(400, 'UPI payment requires receipt screenshot capture');
    }
  }
  const existingClosedAt = source.closure?.closedAt || '';
  const totalAmount = entries.reduce((sum, entry) => sum + toAmount(entry.amount), 0);
  const modes = new Set(entries.map((entry) => entry.paymentMode));
  return {
    feeEntries: entries,
    feesCollected: String(totalAmount),
    paymentMode: modes.size === 1 ? entries[0].paymentMode : 'Mixed',
    receiptCapture: entries.map((entry) => entry.receiptCapture).filter(Boolean).join(', '),
    assistantNotes: entries.map((entry) => entry.assistantNotes).filter(Boolean).join(' | '),
    closedBy: source.closure?.closedBy || 'Assistant',
    closedAt: existingClosedAt || new Date().toISOString()
  };
}

function buildDoctorFeeSummary(cases) {
  const grouped = new Map();
  for (const item of cases) {
    const key = item.assignedDoctorId || 'unassigned';
    if (!grouped.has(key)) {
      grouped.set(key, {
        doctorId: item.assignedDoctorId || '',
        doctorName: item.assignedDoctorName || 'Unassigned Doctor',
        ...buildFeesSummary([])
      });
    }
    const summary = grouped.get(key);
    const entries = closureFeeEntries(item.closure);
    if (!entries.length) continue;
    summary.totalAmount += entries.reduce((sum, entry) => sum + toAmount(entry.amount || entry.feesCollected), 0);
    summary.totalCount += 1;
    for (const entry of entries) {
      const amount = toAmount(entry.amount || entry.feesCollected);
      if (entry.paymentMode === 'UPI') {
        summary.upiAmount += amount;
        summary.upiCount += 1;
      } else {
        summary.cashAmount += amount;
        summary.cashCount += 1;
      }
    }
  }
  return [...grouped.values()];
}

function buildDoctorDashboardDays(cases, from, to) {
  const days = [];
  const fromTime = Date.parse(`${from}T00:00:00.000Z`);
  const toTime = Date.parse(`${to}T00:00:00.000Z`);
  for (let time = fromTime; time <= toTime; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const activeCases = cases.filter((item) => caseDashboardDate(item) === date);
    const servedCases = cases.filter((item) => isCompletedCase(item) && caseCompletionDate(item) === date);
    const cancelledCases = cases.filter((item) => isCancelledCase(item) && caseDashboardDate(item) === date);
    const paidCases = cases.filter((item) => item.closure?.closedAt?.slice(0, 10) === date && item.closure?.feesCollected);
    const fees = buildFeesSummary(paidCases);
    days.push({
      date,
      patientServed: servedCases.length,
      openCases: activeCases.filter((item) => !isCompletedCase(item) && !isCancelledCase(item)).length,
      cancelledCases: cancelledCases.length,
      cashAmount: fees.cashAmount,
      upiAmount: fees.upiAmount,
      totalAmount: fees.totalAmount
    });
  }
  return days.reverse();
}

function isCaseOwnedByDoctor(item, doctor) {
  return Boolean(doctor && item.hospitalId === doctor.hospitalId && item.assignedDoctorId === doctor.id);
}

function getMappedDoctorIdsForAssistant(assistant) {
  return (db.doctorAssistantMappings || [])
    .filter((mapping) => mapping.assistantIds?.includes(assistant.id))
    .map((mapping) => mapping.doctorId);
}

function formatMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
}

function addNotification(email, title, message, type, entityId, userId = '') {
  if (!db.notifications) db.notifications = [];
  db.notifications.unshift({
    id: nextId('NOTIF', db.notifications.length + 1),
    email: normalizeEmail(email),
    userId,
    title,
    message,
    type,
    entityId,
    status: 'Unread',
    createdAt: new Date().toISOString()
  });
}

function sendCaseToDoctor(item) {
  item.status = 'doctor_queue';
  item.visitStatus = 'sent_to_doctor';
  item.updatedAt = new Date().toISOString();
  db.queue.nowServing = item.queueNumber;
  db.queue.currentDoctorCaseId = item.id;
  db.queue.skippedNumbers = db.queue.skippedNumbers.filter((number) => number !== item.queueNumber);
}

function isClosedAppointment(appointment) {
  return ['complete', 'completed', 'cancelled'].includes(appointment.status);
}

function isSlotBlockingAppointment(appointment) {
  return !['cancelled'].includes(appointment.status);
}

function findCaseAppointment(item) {
  return db.appointments.find((record) => record.caseId === item.id)
    || db.appointments.find((record) => record.queueNumber === item.queueNumber);
}

function releaseAppointmentSlot(item) {
  const appointment = findCaseAppointment(item);
  if (!appointment) return null;
  appointment.status = 'cancelled';
  appointment.releasedAt = new Date().toISOString();
  appointment.updatedAt = appointment.releasedAt;
  return appointment;
}

function isCaseVisibleToDoctor(item, doctor) {
  if (!doctor || item.hospitalId !== doctor.hospitalId) return false;
  if (item.assignedDoctorId === doctor.id) return true;
  const mapping = getDoctorAssistantMapping(doctor);
  if (!mapping.assistantIds?.length) return false;
  const assistantIds = new Set(mapping.assistantIds);
  if (item.assistantId && assistantIds.has(item.assistantId)) return true;
  const mappedAssistantNames = db.users
    .filter((user) => assistantIds.has(user.id))
    .map((user) => user.name);
  return mappedAssistantNames.includes(item.assistant?.intakeBy);
}

function nextId(prefix, value) {
  return `${prefix}-${String(value).padStart(4, '0')}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function appointmentDate(appointment) {
  return appointment.date || today();
}

function canAssistantCollectFees(item) {
  return item.status === 'assistant_closure' && item.visitStatus === 'doctor_done';
}

function canAssistantMarkComplete(item) {
  return item.status === 'assistant_closure' && item.visitStatus === 'assistant_work_done';
}

function log(action, actor, entity, details = {}) {
  if (!db.audit) db.audit = [];
  const req = details.req;
  const entityInfo = parseAuditEntity(entity, details);
  const timestamp = new Date().toISOString();
  const record = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    action,
    module: details.module || inferAuditModule(action),
    actor: actor || 'System',
    actorRole: details.actorRole || inferActorRole(actor, action),
    entityType: entityInfo.entityType,
    entityId: entityInfo.entityId,
    outcome: details.outcome || 'Success',
    sourceIp: details.sourceIp || req?.ip || req?.headers?.['x-forwarded-for'] || '',
    method: details.method || req?.method || '',
    path: details.path || req?.originalUrl || req?.url || '',
    description: details.description || describeAuditEvent(action, entity)
  };
  db.audit.unshift(record);
}

function parseAuditEntity(entity, details = {}) {
  const value = String(entity || '');
  if (details.entityType || details.entityId) {
    return { entityType: details.entityType || 'Record', entityId: details.entityId || value };
  }
  if (/^CASE-/i.test(value)) return { entityType: 'Case', entityId: value };
  if (/^SR-/i.test(value)) return { entityType: 'Patient', entityId: value };
  if (/^U-/i.test(value)) return { entityType: 'User', entityId: value };
  if (/^ROLE-/i.test(value)) return { entityType: 'Role', entityId: value };
  if (/^\d+$/.test(value)) return { entityType: 'QueueNumber', entityId: value };
  if (value.includes('@')) return { entityType: 'User', entityId: value };
  return { entityType: 'SystemRecord', entityId: value };
}

function inferAuditModule(action = '') {
  if (action.includes('LOGIN')) return 'Login';
  if (action.includes('USER') || action.includes('APPROVE') || action.includes('REJECT')) return 'User Authorization';
  if (action.includes('ROLE')) return 'Role Management';
  if (action.includes('TEST')) return 'Test Master';
  if (action.includes('MEDICINE')) return 'Medicine Master';
  if (action.includes('TEMPLATE')) return 'Prescription Template';
  if (action.includes('DOCTOR')) return 'Doctor Workflow';
  if (action.includes('QUEUE') || action.includes('APPOINTMENT')) return 'Queue';
  if (action.includes('CASE') || action.includes('VISIT')) return 'Case';
  return 'System';
}

function inferActorRole(actor = '', action = '') {
  if (/doctor/i.test(actor) || action.startsWith('DOCTOR')) return 'Doctor';
  if (/admin/i.test(actor) || action.startsWith('ADMIN')) return 'Super Admin';
  if (/assistant/i.test(actor) || action.startsWith('ASSISTANT')) return 'Assistant';
  return 'System/User';
}

function describeAuditEvent(action, entity) {
  return `${action.replaceAll('_', ' ').toLowerCase()} for ${entity || 'system record'}`;
}

function createStorage() {
  if (STORAGE_MODE === 'json-file') {
    if (IS_DEPLOYED_RUNTIME) {
      throw new Error('JSON file storage is not allowed in deployed environments. Configure Firebase for Render.');
    }
    return createJsonFileStorage();
  }

  const firebaseCredential = parseFirebaseCredential();
  if (firebaseCredential) {
    if (!getApps().length) {
      initializeApp({ credential: cert(firebaseCredential) });
    }
    const firestore = getFirestore();
    const collection = process.env.FIREBASE_COLLECTION || 'smileRecords';
    const document = process.env.FIREBASE_DOCUMENT || 'appState';
    const backupCollection = process.env.FIREBASE_BACKUP_COLLECTION || `${collection}Backups`;
    const docRef = firestore.collection(collection).doc(document);
    return {
      mode: 'firestore',
      documentPath: `${collection}/${document}`,
      async load() {
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
          if (IS_DEPLOYED_RUNTIME && process.env.ALLOW_FIRESTORE_INITIALIZE !== 'true') {
            throw new Error(
              `Firestore document ${collection}/${document} does not exist. Check FIREBASE_COLLECTION/FIREBASE_DOCUMENT, or set ALLOW_FIRESTORE_INITIALIZE=true once for first-time setup.`
            );
          }
          const localData = loadJsonDbIfExists();
          const initial = prepareDb(localData || seed);
          await docRef.set({
            data: initial,
            storageSource: localData ? 'local-json-migration' : 'seed',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          return initial;
        }
        return prepareDb(snapshot.data()?.data || {});
      },
      async save(value) {
        const nextValue = clone(value);
        const snapshot = await docRef.get();
        const currentValue = snapshot.exists ? snapshot.data()?.data : null;
        if (shouldBackupBeforeSave(currentValue, nextValue)) {
          await firestore.collection(backupCollection).doc(`${document}-${Date.now()}`).set({
            sourceDocument: `${collection}/${document}`,
            reason: backupReason(currentValue, nextValue),
            createdAt: new Date().toISOString(),
            counts: {
              before: dataCounts(currentValue),
              after: dataCounts(nextValue)
            },
            data: clone(currentValue)
          });
        }
        await docRef.set({
          data: nextValue,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    };
  }

  if (IS_DEPLOYED_RUNTIME || STORAGE_MODE === 'firestore') {
    throw new Error(
      'Firebase is required in deployed environments. Configure FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
    );
  }

  return createJsonFileStorage();
}

function createJsonFileStorage() {
  return {
    mode: 'json-file',
    documentPath: DATA_FILE,
    async load() {
      return loadJsonDb();
    },
    async save(value) {
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify(value, null, 2));
    }
  };
}

function parseFirebaseCredential() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (encoded) {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch (error) {
      console.warn(`Could not parse FIREBASE_SERVICE_ACCOUNT_BASE64: ${error.message}`);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

async function loadDb() {
  try {
    return await storage.load();
  } catch (error) {
    if (storage.mode === 'firestore' || IS_DEPLOYED_RUNTIME) {
      throw new Error(`Could not load SmileRecords ${storage.mode} storage: ${error.message}`);
    }
    console.warn(`Could not load SmileRecords ${storage.mode} storage, using seed data: ${error.message}`);
    return prepareDb(seed);
  }
}

function loadJsonDb() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  if (!existsSync(DATA_FILE)) {
    const initial = prepareDb(seed);
    writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return prepareDb(parsed);
  } catch (error) {
    console.warn(`Could not read SmileRecords data file, using seed data: ${error.message}`);
    return prepareDb(seed);
  }
}

function loadJsonDbIfExists() {
  if (!existsSync(DATA_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.warn(`Could not read local SmileRecords data for Firestore migration: ${error.message}`);
    return null;
  }
}

function prepareDb(value) {
  const merged = { ...clone(seed), ...clone(value || {}) };
  merged.audit = normalizeAuditRecords(merged.audit || []);
  merged.hospitals = merged.hospitals?.length ? merged.hospitals : clone(seed).hospitals;
  merged.doctorAssistantMappings = merged.doctorAssistantMappings || [];
  merged.notifications = merged.notifications || [];
  merged.feeReconciliations = merged.feeReconciliations || [];
  merged.subscriptionPayments = merged.subscriptionPayments || [];
  for (const user of merged.users || []) {
    if (user.status === 'Active') ensureUserSubscription(user);
  }
  return merged;
}

function normalizeAuditRecords(records) {
  return records.map((record) => {
    return {
      id: record.id || `AUD-${Date.now()}`,
      timestamp: record.timestamp || new Date().toISOString(),
      action: record.action || 'UNKNOWN_EVENT',
      module: record.module || inferAuditModule(record.action || ''),
      actor: record.actor || 'System',
      actorRole: record.actorRole || inferActorRole(record.actor || '', record.action || ''),
      entityType: record.entityType || parseAuditEntity(record.entity || record.entityId || {}).entityType,
      entityId: record.entityId || record.entity || '',
      outcome: record.outcome || 'Success',
      sourceIp: record.sourceIp || '',
      method: record.method || '',
      path: record.path || '',
      description: record.description || describeAuditEvent(record.action || 'UNKNOWN_EVENT', record.entity || '')
    };
  });
}

function saveDb() {
  return storage.save(db);
}

function isDataResetAllowed(req) {
  if (process.env.ALLOW_DATA_RESET !== 'true') return false;
  if (storage.mode === 'json-file' && !IS_DEPLOYED_RUNTIME) return true;
  const token = process.env.DATA_RESET_CONFIRMATION || '';
  return Boolean(token && req.body?.confirmation === token);
}

function dataCounts(value = {}) {
  return {
    cases: value?.cases?.length || 0,
    patients: value?.patients?.length || 0,
    users: value?.users?.length || 0,
    appointments: value?.appointments?.length || 0,
    audit: value?.audit?.length || 0
  };
}

function totalStoredRecords(value = {}) {
  const counts = dataCounts(value);
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function shouldBackupBeforeSave(currentValue, nextValue) {
  if (!currentValue) return false;
  return totalStoredRecords(nextValue) < totalStoredRecords(currentValue);
}

function backupReason(currentValue, nextValue) {
  const before = dataCounts(currentValue);
  const after = dataCounts(nextValue);
  const reduced = Object.keys(before).filter((key) => after[key] < before[key]);
  return reduced.length ? `record-count-drop:${reduced.join(',')}` : 'pre-save-safety';
}

function persistSuccessfulMutations(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        saveDb().catch((error) => {
          console.error(`Could not persist SmileRecords data: ${error.message}`);
        });
      }
    });
  }
  next();
}

function requireActiveSubscriptionForAppApi(req, res, next) {
  const publicPrefixes = [
    '/api/health',
    '/api/auth',
    '/api/access-requests',
    '/api/hospitals',
    '/api/subscriptions',
    '/api/users/me'
  ];
  if (!req.path.startsWith('/api') || publicPrefixes.some((prefix) => req.path.startsWith(prefix))) return next();
  const email = normalizeEmail(req.headers['x-user-email']);
  if (!email) return next();
  const user = db.users.find((item) => normalizeEmail(item.email) === email);
  if (!user || user.status !== 'Active') return res.status(401).json({ error: 'Active login is required.' });
  if (!isSubscriptionBillable(user)) return next();
  const subscription = subscriptionStatus(user);
  if (!subscription.isUsable) {
    return res.status(402).json({ error: 'Subscription payment is required before using SmileRecords.' });
  }
  return next();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pick(source, keys) {
  return keys.reduce((result, key) => {
    if (source[key] !== undefined) result[key] = source[key];
    return result;
  }, {});
}

function removeById(collection, id, label) {
  const index = collection.findIndex((item) => item.id === id);
  if (index === -1) return { error: `${label} not found` };
  const [item] = collection.splice(index, 1);
  return { item };
}

function createUser(input) {
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim();
  if (!name) throwHttp(400, 'User name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throwHttp(400, 'Valid user email is required');
  return {
    id: input.id || nextId('U', db.users.length + 1),
    name,
    email,
    role: input.role || 'Pending',
    requestedRole: input.requestedRole || '',
    hospitalId: input.hospitalId || '',
    status: input.status || 'Pending',
    description: input.description || '',
    profilePhoto: input.profilePhoto || ''
  };
}

function createHospital(input) {
  const name = String(input.name || '').trim();
  if (!name) throwHttp(400, 'Hospital name is required');
  const code = String(input.code || '').trim() || nextHospitalCode(name);
  return {
    id: input.id || nextId('HOSP', db.hospitals.length + 1),
    name,
    code,
    city: String(input.city || '').trim(),
    status: input.status || 'Active',
    description: input.description || ''
  };
}

function nextHospitalCode(name) {
  const base = name
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 4)
    .toUpperCase() || 'HOSP';
  let index = db.hospitals.length + 1;
  let code = `${base}-${String(index).padStart(3, '0')}`;
  const existingCodes = new Set((db.hospitals || []).map((hospital) => String(hospital.code || '').toUpperCase()));
  while (existingCodes.has(code.toUpperCase())) {
    index += 1;
    code = `${base}-${String(index).padStart(3, '0')}`;
  }
  return code;
}

function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return db.users.find((user) => normalizeEmail(user.email) === normalized);
}

function publicSubscriptionConfig() {
  return {
    amount: SUBSCRIPTION_AMOUNT,
    amountPaise: SUBSCRIPTION_AMOUNT * 100,
    currency: SUBSCRIPTION_CURRENCY,
    trialDays: SUBSCRIPTION_TRIAL_DAYS,
    billableRole: 'Doctor',
    configured: Boolean(razorpay),
    keyId: RAZORPAY_KEY_ID
  };
}

function isSubscriptionBillable(user) {
  return user?.role === 'Doctor';
}

function exemptSubscriptionStatus(user) {
  const subscription = {
    provider: 'Internal',
    plan: 'Not Required',
    amount: 0,
    currency: SUBSCRIPTION_CURRENCY,
    trialStartedAt: '',
    trialEndsAt: '',
    paidUntil: '',
    lastPaymentAt: '',
    status: 'Not Required',
    isUsable: true,
    daysRemaining: null
  };
  if (user) user.subscription = subscription;
  return subscription;
}

function ensureUserSubscription(user) {
  if (!user || user.status !== 'Active') return null;
  if (!isSubscriptionBillable(user)) return exemptSubscriptionStatus(user);
  const nowIso = new Date().toISOString();
  const createdAt = user.approvedAt || user.createdAt || nowIso;
  const subscription = {
    provider: 'Razorpay',
    plan: 'Monthly',
    amount: SUBSCRIPTION_AMOUNT,
    currency: SUBSCRIPTION_CURRENCY,
    trialStartedAt: createdAt,
    trialEndsAt: addDays(createdAt, SUBSCRIPTION_TRIAL_DAYS),
    paidUntil: '',
    lastPaymentAt: '',
    status: 'Trial',
    ...(user.subscription || {})
  };
  user.subscription = subscription;
  updateSubscriptionState(user);
  return user.subscription;
}

function updateSubscriptionState(user) {
  if (!isSubscriptionBillable(user)) return exemptSubscriptionStatus(user);
  const subscription = user.subscription || {};
  const paidUntil = timestampValue(subscription.paidUntil);
  const trialEndsAt = timestampValue(subscription.trialEndsAt);
  const now = Date.now();
  if (paidUntil >= now) subscription.status = 'Active';
  else if (trialEndsAt >= now) subscription.status = 'Trial';
  else subscription.status = 'Expired';
  subscription.isUsable = ['Active', 'Trial'].includes(subscription.status);
  subscription.daysRemaining = Math.max(0, Math.ceil((Math.max(paidUntil, trialEndsAt) - now) / 86400000));
  user.subscription = subscription;
  return subscription;
}

function subscriptionStatus(user) {
  ensureUserSubscription(user);
  return updateSubscriptionState(user);
}

function activatePaidSubscription(user, payment) {
  const subscription = ensureUserSubscription(user);
  const nowIso = new Date().toISOString();
  const baseTimestamp = Math.max(
    Date.now(),
    timestampValue(subscription.paidUntil),
    timestampValue(subscription.trialEndsAt)
  );
  subscription.status = 'Active';
  subscription.isUsable = true;
  subscription.lastPaymentAt = payment.paidAt || nowIso;
  subscription.lastPaymentId = payment.id;
  subscription.lastRazorpayPaymentId = payment.razorpayPaymentId;
  subscription.paidUntil = addMonths(new Date(baseTimestamp).toISOString(), 1);
  subscription.amount = SUBSCRIPTION_AMOUNT;
  subscription.currency = SUBSCRIPTION_CURRENCY;
  updateSubscriptionState(user);
  return subscription;
}

function buildSubscriptionOverview() {
  const users = (db.users || []).filter((user) => user.status === 'Active' && isSubscriptionBillable(user));
  const rows = users.map((user) => {
    const subscription = subscriptionStatus(user);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hospitalName: db.hospitals.find((hospital) => hospital.id === user.hospitalId)?.name || '',
      lastLoginAt: user.lastLoginAt || '',
      loginCount: user.loginCount || 0,
      subscription
    };
  });
  const doctorUserIds = new Set(users.map((user) => user.id));
  const payments = (db.subscriptionPayments || []).filter((payment) => payment.status === 'Paid' && doctorUserIds.has(payment.userId));
  const totalCollected = payments.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
  const billableUsers = rows.length;
  const recentCutoff = Date.now() - (7 * 86400000);
  return {
    config: publicSubscriptionConfig(),
    totalCollected,
    projectedMonthly: billableUsers * SUBSCRIPTION_AMOUNT,
    billableUsers,
    activeSubscriptions: rows.filter((user) => user.subscription.status === 'Active').length,
    trialUsers: rows.filter((user) => user.subscription.status === 'Trial').length,
    expiredUsers: rows.filter((user) => user.subscription.status === 'Expired').length,
    activeOnApp: rows.filter((user) => timestampValue(user.lastLoginAt) >= recentCutoff).length,
    notUsingApp: rows.filter((user) => timestampValue(user.lastLoginAt) < recentCutoff).length,
    users: rows,
    payments: payments.slice(0, 25)
  };
}

function addDays(value, days) {
  const date = new Date(value || Date.now());
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

function addMonths(value, months) {
  const date = new Date(value || Date.now());
  date.setMonth(date.getMonth() + Number(months || 0));
  return date.toISOString();
}

function timestampValue(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function findDoctor(doctorId, doctorEmail) {
  return db.users.find((user) => (
    user.role === 'Doctor' &&
    (doctorId ? user.id === doctorId : normalizeEmail(user.email) === normalizeEmail(doctorEmail))
  ));
}

function findAssistant(assistantId, assistantEmail) {
  return db.users.find((user) => (
    user.role === 'Assistant' &&
    (assistantId ? user.id === assistantId : normalizeEmail(user.email) === normalizeEmail(assistantEmail))
  ));
}

function getDoctorAssistantMapping(doctor) {
  if (!db.doctorAssistantMappings) db.doctorAssistantMappings = [];
  let mapping = db.doctorAssistantMappings.find((item) => item.doctorId === doctor.id);
  if (!mapping) {
    mapping = {
      id: nextId('DAM', db.doctorAssistantMappings.length + 1),
      doctorId: doctor.id,
      hospitalId: doctor.hospitalId || '',
      assistantIds: [],
      updatedAt: new Date().toISOString()
    };
    db.doctorAssistantMappings.push(mapping);
  }
  return mapping;
}

function withHospital(user) {
  const hospital = db.hospitals.find((item) => item.id === user.hospitalId);
  if (user.status === 'Active') ensureUserSubscription(user);
  return {
    ...user,
    hospitalName: hospital?.name || '',
    profilePhoto: user.profilePhoto || '',
    subscription: user.subscription ? subscriptionStatus(user) : user.subscription
  };
}

function createRole(input) {
  const role = String(input.role || '').trim();
  if (!role) throwHttp(400, 'Role name is required');
  const permissions = Array.isArray(input.permissions)
    ? input.permissions
    : String(input.permissions || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    id: input.id || nextId('ROLE', db.roles.length + 1),
    role,
    permissions
  };
}

function createMedicine(input) {
  const name = String(input.name || '').trim();
  if (!name) throwHttp(400, 'Medicine name is required');
  return {
    id: input.id || nextId('M', db.medicines.length + 1),
    name,
    generic: input.generic || '',
    description: input.description || ''
  };
}

function medicineWorkbook(rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['Id', 'Name', 'Generic', 'Description'] });
  worksheet['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 28 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Medicines');
  return workbook;
}

function sendWorkbook(res, workbook, filename) {
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

function parseMedicineWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
  return rows
    .map((row) => ({
      id: row.Id || row.ID || row.id || '',
      name: row.Name || row.Medicine || row['Medicine Name'] || row.name || '',
      generic: row.Generic || row.generic || '',
      description: row.Description || row.Dosage || row.Instructions || row.description || ''
    }))
    .filter((row) => String(row.name || '').trim());
}

function upsertMedicines(rows) {
  let created = 0;
  let updated = 0;
  const medicines = [];
  for (const row of rows) {
    const existing = row.id
      ? db.medicines.find((medicine) => medicine.id === String(row.id).trim())
      : db.medicines.find((medicine) => sameText(medicine.name, row.name));
    if (existing) {
      Object.assign(existing, {
        name: String(row.name || existing.name).trim(),
        generic: String(row.generic || '').trim(),
        description: String(row.description || '').trim()
      });
      updated += 1;
      medicines.push(existing);
    } else {
      const medicine = createMedicine(row);
      db.medicines.unshift(medicine);
      created += 1;
      medicines.push(medicine);
    }
  }
  return { created, updated, total: rows.length, medicines };
}

function createTemplate(input) {
  const title = String(input.title || '').trim();
  if (!title) throwHttp(400, 'Template title is required');
  return {
    id: input.id || nextId('T', db.templates.length + 1),
    title,
    description: input.description || ''
  };
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.message || 'Unexpected backend error' });
});

app.listen(port, () => {
  console.log(`SmileRecords API running at http://localhost:${port}/api`);
});
