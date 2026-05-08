import cors from 'cors';
import express from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.js';

const app = express();
const port = process.env.PORT || 4000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.SMILE_RECORDS_DATA_FILE || join(__dirname, 'data', 'smile-records.local.json');
let db = loadDb();

app.use(cors());
app.use(express.json());
app.use(persistSuccessfulMutations);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'SmileRecords',
    version: '0.3.0',
    storage: 'json-file',
    dataFile: DATA_FILE
  });
});

app.post('/api/admin/reset-data', (req, res) => {
  db = clone(seed);
  log('ADMIN_RESET_DATA', req.body.actor || 'Admin', 'SmileRecords');
  res.json({ ok: true, message: 'SmileRecords data reset to seed values' });
});

app.get('/api/admin/export', (req, res) => {
  res.json({ exportedAt: new Date().toISOString(), data: db });
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    metrics: [
      { label: 'Doctor Queue', value: countCases('doctor_queue'), hint: 'Waiting for analysis' },
      { label: 'Assistant Work', value: countCases('assistant_closure'), hint: 'Fees and uploads' },
      { label: 'Completed Cases', value: countCases('completed'), hint: 'Closed today' },
      { label: 'Now Serving', value: db.queue.nowServing, hint: 'Current token' },
      { label: 'Total Patients', value: db.patients.length, hint: 'Clinic records' },
      { label: 'Pending Approvals', value: db.users.filter((item) => item.status === 'Pending').length, hint: 'Admin action' },
      { label: 'Active Roles', value: db.roles.length, hint: 'RBAC enabled' },
      { label: 'Audit Events', value: db.audit.length, hint: 'Sensitive actions' }
    ]
  });
});

app.get('/api/cases', (req, res) => {
  let cases = db.cases;
  if (req.query.queue === 'doctor') cases = cases.filter((item) => item.status === 'doctor_queue');
  if (req.query.queue === 'assistant-closure') cases = cases.filter((item) => item.status === 'assistant_closure');
  if (req.query.queue === 'assistant-intake') cases = cases.filter((item) => ['doctor_queue', 'assistant_intake'].includes(item.status));
  res.json({ cases });
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
  res.json({ appointments: db.appointments });
});

app.patch('/api/appointments/:id/send-to-doctor', (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
  if (appointment.status === 'complete') return res.status(409).json({ error: 'Completed appointment cannot be sent to doctor queue' });

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
  if (!isValidMobile(patient.mobile)) {
    return res.status(400).json({ error: 'Enter a valid 10 digit mobile number starting with 6, 7, 8, or 9' });
  }
  const appointmentTime = req.body.appointmentTime || patient.appointmentTime;
  if (!isValidAppointmentTime(appointmentTime)) {
    return res.status(400).json({ error: 'Appointment time must use a 15 minute slot between 09:00 and 18:00' });
  }
  if (db.appointments.some((item) => item.time === appointmentTime)) {
    return res.status(409).json({ error: 'Appointment time is already allocated to another patient' });
  }
  const existing = db.patients.find((item) => item.mobile && item.mobile === patient.mobile && item.name === patient.name);
  const patientRecord = existing || {
    id: nextId('SR', db.patients.length + 1),
    ...patient,
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
    status: 'doctor_queue',
    visitStatus: 'waiting_doctor',
    assistant: {
      intakeBy: 'Assistant',
      consentCaptured: Boolean(patient.consent),
      intakeAt: new Date().toISOString()
    },
    doctor: {},
    closure: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.cases.unshift(item);
  db.appointments.push({
    id: nextId('APT', db.appointments.length + 1),
    caseId: item.id,
    time: appointmentTime,
    patientName: patientRecord.name,
    type: patient.chiefComplaint || 'Consult',
    status: 'waiting',
    queueNumber: item.queueNumber
  });
  patientRecord.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Assistant intake', date: today(), note: 'Submitted to doctor queue' });
  log('ASSISTANT_SUBMIT_TO_DOCTOR', 'Assistant', item.id);
  res.status(201).json({ case: item });
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
  res.json({ case: item });
});

app.patch('/api/cases/:id/basic', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });
  if (!['assistant_intake', 'doctor_queue', 'assistant_closure'].includes(item.status)) {
    return res.status(409).json({ error: 'Case cannot be edited in current status' });
  }

  const normalized = normalizePatient(req.body.patient || {});
  if (normalized.mobile && !isValidMobile(normalized.mobile)) {
    return res.status(400).json({ error: 'Enter a valid 10 digit mobile number starting with 6, 7, 8, or 9' });
  }
  item.patient = { ...item.patient, ...normalized };
  const patient = db.patients.find((record) => record.id === item.patientId);
  if (patient) Object.assign(patient, item.patient);
  item.updatedAt = new Date().toISOString();
  log('ASSISTANT_EDIT_PATIENT_BASIC', 'Assistant', item.id);
  res.json({ case: item });
});

app.patch('/api/cases/:id/doctor-submit', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });

  item.doctor = {
    diagnosis: req.body.diagnosis || '',
    treatmentPlan: req.body.treatmentPlan || '',
    treatmentStatus: req.body.treatmentStatus || 'In Progress',
    doctorNotes: req.body.doctorNotes || '',
    testsRequested: Array.isArray(req.body.testsRequested) ? req.body.testsRequested : [],
    prescriptionForm: req.body.prescriptionForm || '',
    prescriptionItems: Array.isArray(req.body.prescriptionItems) ? req.body.prescriptionItems : [],
    prescription: req.body.prescription || formatPrescription(req.body.prescriptionItems || []),
    nextVisitDate: req.body.nextVisitDate || '',
    submittedBy: 'Doctor',
    submittedAt: new Date().toISOString()
  };
  item.status = 'assistant_closure';
  item.visitStatus = 'doctor_done';
  const appointment = db.appointments.find((record) => record.queueNumber === item.queueNumber);
  if (appointment) appointment.status = 'doctor_done';
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

app.patch('/api/cases/:id/visit-complete', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });

  item.status = 'completed';
  item.visitStatus = 'visit_complete';
  item.updatedAt = new Date().toISOString();
  item.patient.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Visit complete', date: today(), note: 'Marked complete by clinic staff' });
  const appointment = db.appointments.find((record) => record.queueNumber === item.queueNumber);
  if (appointment) appointment.status = 'complete';
  log('MARK_VISIT_COMPLETE', req.body.actor || 'Assistant', item.id);
  res.json({ case: item });
});

app.patch('/api/cases/:id/assistant-close', (req, res) => {
  const item = db.cases.find((caseItem) => caseItem.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Case not found' });

  item.closure = {
    feesCollected: req.body.feesCollected || '',
    xrayUploads: req.body.xrayUploads || '',
    medicalReports: req.body.medicalReports || '',
    assistantNotes: req.body.assistantNotes || '',
    closedBy: 'Assistant',
    closedAt: new Date().toISOString()
  };
  item.status = 'assistant_closure';
  item.visitStatus = 'assistant_work_done';
  item.updatedAt = new Date().toISOString();
  item.patient.timeline.unshift({ id: `TL-${Date.now()}`, title: 'Assistant closure', date: today(), note: 'Fees/uploads/supporting reports updated' });
  if (item.closure.xrayUploads) {
    db.documents.unshift({
      id: nextId('D', db.documents.length + 1),
      patientId: item.patientId,
      title: item.closure.xrayUploads,
      type: 'X-ray / Medical Report',
      status: 'Uploaded by assistant',
      date: today()
    });
  }
  log('ASSISTANT_CLOSE_CASE', 'Assistant', item.id);
  res.json({ case: item });
});

app.get('/api/patients', (req, res) => {
  res.json({ patients: db.patients });
});

app.get('/api/patients/lookup', (req, res) => {
  const mobile = String(req.query.mobile || '').trim();
  if (!mobile) return res.status(400).json({ error: 'Mobile number is required' });
  const patient = db.patients.find((item) => item.mobile === mobile);
  if (!patient) return res.json({ patient: null });
  res.json({
    patient: {
      id: patient.id,
      name: patient.name,
      mobile: patient.mobile,
      lastVisitDate: patient.lastVisitDate || patient.timeline?.[0]?.date || '',
      treatmentStatus: patient.treatmentStatus || ''
    }
  });
});

app.get('/api/patients/:id', (req, res) => {
  const patient = db.patients.find((item) => item.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json({ patient });
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

app.get('/api/users', (req, res) => {
  res.json({ users: db.users });
});

app.post('/api/users', (req, res) => {
  const user = createUser(req.body);
  db.users.unshift(user);
  log('ADMIN_ADD_USER', req.body.actor || 'Admin', user.email);
  res.status(201).json({ user });
});

app.patch('/api/users/:id', (req, res) => {
  const user = db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  Object.assign(user, pick(req.body, ['name', 'email', 'role', 'status', 'description']));
  log('ADMIN_UPDATE_USER', req.body.actor || 'Admin', user.id);
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
  res.json({ audit: db.audit });
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

function normalizePatient(patient) {
  return {
    name: patient.name || '',
    mobile: patient.mobile || '',
    age: patient.age || '',
    gender: patient.gender || '',
    city: patient.city || '',
    address: patient.address || '',
    chiefComplaint: patient.chiefComplaint || '',
    painLevel: patient.painLevel || '',
    toothNumber: patient.toothNumber || '',
    appointmentTime: patient.appointmentTime || '',
    medicalFlags: Array.isArray(patient.medicalFlags) ? patient.medicalFlags : [],
    guardian: patient.guardian || '',
    consent: Boolean(patient.consent)
  };
}

function isValidMobile(value) {
  return /^[6-9]\d{9}$/.test(String(value || '').trim());
}

function formatPrescription(items) {
  return (items || []).map((item) => `${item.name} - ${item.description || item.generic || ''}`.trim()).join('; ');
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

function sendCaseToDoctor(item) {
  item.status = 'doctor_queue';
  item.visitStatus = 'sent_to_doctor';
  item.updatedAt = new Date().toISOString();
  db.queue.nowServing = item.queueNumber;
  db.queue.currentDoctorCaseId = item.id;
  db.queue.skippedNumbers = db.queue.skippedNumbers.filter((number) => number !== item.queueNumber);
}

function nextId(prefix, value) {
  return `${prefix}-${String(value).padStart(4, '0')}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function log(action, actor, entity) {
  db.audit.unshift({
    id: `AUD-${Date.now()}`,
    action,
    actor,
    entity,
    description: 'Captured by SmileRecords queue workflow',
    timestamp: new Date().toISOString()
  });
}

function loadDb() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  if (!existsSync(DATA_FILE)) {
    const initial = clone(seed);
    writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    return { ...clone(seed), ...parsed };
  } catch (error) {
    console.warn(`Could not read SmileRecords data file, using seed data: ${error.message}`);
    return clone(seed);
  }
}

function saveDb() {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function persistSuccessfulMutations(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        try {
          saveDb();
        } catch (error) {
          console.error(`Could not persist SmileRecords data: ${error.message}`);
        }
      }
    });
  }
  next();
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
    status: input.status || 'Pending',
    description: input.description || ''
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
