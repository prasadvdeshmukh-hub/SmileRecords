import { dentalMedicines } from './dentalMedicineMaster.js';

const patientAarav = {
  id: 'SR-0001',
  name: 'Aarav Shah',
  mobile: '+91 98765 43210',
  age: '34',
  gender: 'Male',
  city: 'Pune',
  address: 'Baner, Pune',
  chiefComplaint: 'Severe pain in lower molar',
  painLevel: '7',
  toothNumber: '36',
  medicalFlags: ['Allergy', 'BP'],
  flags: ['Allergy', 'BP'],
  guardian: '',
  consent: true,
  treatmentStatus: 'In Progress',
  nextFollowUp: '2026-05-10',
  lastVisitDate: '2026-05-07',
  timeline: [
    { id: 'TL-1', title: 'Doctor submitted case', date: '2026-05-07', note: 'RCT advised' },
    { id: 'TL-2', title: 'Assistant intake', date: '2026-05-07', note: 'Submitted to doctor queue' }
  ]
};

const patientNeha = {
  id: 'SR-0002',
  name: 'Neha Patil',
  mobile: '+91 97654 32109',
  age: '29',
  gender: 'Female',
  city: 'Mumbai',
  address: 'Dadar, Mumbai',
  chiefComplaint: 'Wisdom tooth discomfort',
  painLevel: '5',
  toothNumber: '48',
  medicalFlags: ['Diabetes'],
  flags: ['Diabetes'],
  guardian: '',
  consent: true,
  treatmentStatus: 'Pending',
  nextFollowUp: '',
  lastVisitDate: '2026-05-07',
  timeline: [
    { id: 'TL-3', title: 'Assistant intake', date: '2026-05-07', note: 'Waiting in doctor queue' }
  ]
};

const patientRohan = {
  id: 'SR-0003',
  name: 'Rohan Iyer',
  mobile: '+91 96543 21098',
  age: '41',
  gender: 'Male',
  city: 'Nashik',
  address: 'College Road, Nashik',
  chiefComplaint: 'Bleeding gums',
  painLevel: '2',
  toothNumber: 'General',
  medicalFlags: [],
  flags: [],
  guardian: '',
  consent: true,
  treatmentStatus: 'Completed',
  nextFollowUp: '2026-05-20',
  lastVisitDate: '2026-05-06',
  timeline: [
    { id: 'TL-4', title: 'Assistant closure', date: '2026-05-06', note: 'Fees and report upload complete' },
    { id: 'TL-5', title: 'Doctor submitted case', date: '2026-05-06', note: 'Scaling completed' }
  ]
};

export const seed = {
  patients: [patientAarav, patientNeha, patientRohan],
  cases: [
    {
      id: 'CASE-0001',
      queueNumber: 12,
      patientId: 'SR-0002',
      patient: patientNeha,
      status: 'doctor_queue',
      visitStatus: 'waiting_doctor',
      assignedDoctorId: 'U-6',
      assignedDoctorName: 'Test Doctor',
      hospitalId: 'HOSP-1',
      assistant: { intakeBy: 'Anita Dsouza', consentCaptured: true, intakeAt: '2026-05-07T08:30:00.000Z' },
      doctor: {},
      closure: {},
      createdAt: '2026-05-07T08:30:00.000Z',
      updatedAt: '2026-05-07T08:30:00.000Z'
    },
    {
      id: 'CASE-0002',
      queueNumber: 11,
      patientId: 'SR-0001',
      patient: patientAarav,
      status: 'assistant_closure',
      visitStatus: 'doctor_done',
      assignedDoctorId: 'U-6',
      assignedDoctorName: 'Test Doctor',
      hospitalId: 'HOSP-1',
      assistant: { intakeBy: 'Anita Dsouza', consentCaptured: true, intakeAt: '2026-05-07T07:45:00.000Z' },
      doctor: {
        diagnosis: 'Deep caries with pulpal involvement',
        treatmentPlan: 'Root canal treatment followed by crown',
        treatmentStatus: 'In Progress',
        doctorNotes: 'Start first sitting today',
        testsRequested: ['IOPA X-ray'],
        prescriptionForm: 'RCT Pain Management',
        prescription: 'Ibuprofen 400mg after food, Chlorhexidine rinse twice daily',
        nextVisitDate: '2026-05-10',
        submittedBy: 'Dr. Meera Rao',
        submittedAt: '2026-05-07T09:10:00.000Z'
      },
      closure: {},
      createdAt: '2026-05-07T07:45:00.000Z',
      updatedAt: '2026-05-07T09:10:00.000Z'
    },
    {
      id: 'CASE-0003',
      queueNumber: 10,
      patientId: 'SR-0003',
      patient: patientRohan,
      status: 'completed',
      visitStatus: 'visit_complete',
      assignedDoctorId: 'U-8',
      assignedDoctorName: 'Test Doctor Two',
      hospitalId: 'HOSP-1',
      assistant: { intakeBy: 'Rahul More', consentCaptured: true, intakeAt: '2026-05-06T10:10:00.000Z' },
      doctor: {
        diagnosis: 'Gingivitis',
        treatmentPlan: 'Scaling and oral hygiene care',
        treatmentStatus: 'Completed',
        doctorNotes: 'Review if bleeding persists',
        testsRequested: [],
        prescriptionForm: 'Scaling Care',
        prescription: 'Chlorhexidine mouthwash twice daily for 7 days',
        nextVisitDate: '2026-05-20',
        submittedBy: 'Dr. Meera Rao',
        submittedAt: '2026-05-06T10:35:00.000Z'
      },
      closure: {
        feesCollected: '1200',
        paymentMode: 'Cash',
        assistantNotes: 'Payment collected',
        closedBy: 'Assistant',
        closedAt: '2026-05-06T10:55:00.000Z'
      },
      createdAt: '2026-05-06T10:10:00.000Z',
      updatedAt: '2026-05-06T10:55:00.000Z'
    }
  ],
  queue: {
    nowServing: 11,
    nextNumber: 13,
    skippedNumbers: [9],
    currentDoctorCaseId: 'CASE-0002'
  },
  appointments: [
    { id: 'APT-1', caseId: 'CASE-0001', date: '2026-05-08', time: '09:30', patientName: 'Neha Patil', type: 'Consult', status: 'waiting', queueNumber: 12, doctorId: 'U-6', doctorName: 'Test Doctor' },
    { id: 'APT-2', caseId: 'CASE-0002', date: '2026-05-08', time: '10:00', patientName: 'Aarav Shah', type: 'RCT', status: 'doctor_done', queueNumber: 11, doctorId: 'U-6', doctorName: 'Test Doctor' },
    { id: 'APT-3', caseId: '', date: '2026-05-08', time: '10:30', patientName: 'Maya Kulkarni', type: 'Scaling', status: 'scheduled', queueNumber: 13, doctorId: 'U-8', doctorName: 'Test Doctor Two' },
    { id: 'APT-4', caseId: '', date: '2026-05-08', time: '11:00', patientName: 'Kabir Mehta', type: 'Review', status: 'scheduled', queueNumber: 14, doctorId: 'U-8', doctorName: 'Test Doctor Two' }
  ],
  visits: [
    { id: 'V-1001', patientId: 'SR-0001', title: 'RCT evaluation', date: '2026-05-07', note: 'Pain level 7, tooth 36, RCT advised' },
    { id: 'V-1002', patientId: 'SR-0002', title: 'Wisdom tooth consult', date: '2026-05-07', note: 'Waiting doctor review' },
    { id: 'V-1003', patientId: 'SR-0003', title: 'Scaling follow-up', date: '2026-05-06', note: 'Gums healing well' }
  ],
  documents: [
    { id: 'D-0001', patientId: 'SR-0001', title: 'IOPA X-ray', type: 'X-ray - IOPA', status: 'Requested by doctor', date: '2026-05-07' },
    { id: 'D-0002', patientId: 'SR-0003', title: 'Scaling Report', type: 'Medical Report', status: 'Uploaded by assistant', date: '2026-05-06' }
  ],
  prescriptions: [
    { id: 'P-0001', patientId: 'SR-0001', patientName: 'Aarav Shah', title: 'RCT Pain Management', status: 'Issued', date: '2026-05-07', description: 'Ibuprofen 400mg after food, Chlorhexidine rinse twice daily' },
    { id: 'P-0002', patientId: 'SR-0003', patientName: 'Rohan Iyer', title: 'Scaling Care', status: 'Issued', date: '2026-05-06', description: 'Chlorhexidine mouthwash twice daily for 7 days' }
  ],
  reminders: [
    { id: 'R-0001', patientId: 'SR-0001', patientName: 'Aarav Shah', type: 'Next Visit', dueAt: '2026-05-10 10:30', status: 'Upcoming' },
    { id: 'R-0002', patientId: 'SR-0003', patientName: 'Rohan Iyer', type: 'Review', dueAt: '2026-05-20 11:00', status: 'Upcoming' }
  ],
  hospitals: [
    { id: 'HOSP-1', name: 'SmileRecords Central Clinic', code: 'SRC-MUM', city: 'Mumbai', status: 'Active', description: 'Primary SmileRecords clinic' },
    { id: 'HOSP-2', name: 'SmileRecords Dental Care Pune', code: 'SRC-PUN', city: 'Pune', status: 'Active', description: 'Branch clinic for Pune operations' }
  ],
  users: [
    { id: 'U-1', name: 'Dr. Meera Rao', email: 'meera@clinic.example', role: 'Doctor', requestedRole: 'Doctor', hospitalId: 'HOSP-1', status: 'Active', description: 'Doctor mobile and clinical submission access' },
    { id: 'U-2', name: 'Anita Dsouza', email: 'anita@clinic.example', role: 'Assistant', requestedRole: 'Assistant', hospitalId: 'HOSP-1', status: 'Active', description: 'Mobile intake, edit basic details, fees, uploads' },
    { id: 'U-3', name: 'Clinic Admin', email: 'admin@clinic.example', role: 'Super Admin', hospitalId: 'HOSP-1', status: 'Active', description: 'Admin web panel access' },
    { id: 'U-4', name: 'New Staff', email: 'new@clinic.example', role: 'Pending', requestedRole: 'Assistant', hospitalId: 'HOSP-1', status: 'Pending', description: 'Awaiting admin authorization' },
    { id: 'U-5', name: 'Test Assistant', email: 'assistant@test.smile', role: 'Assistant', requestedRole: 'Assistant', hospitalId: 'HOSP-1', status: 'Active', description: 'Sample approved assistant user for testing' },
    { id: 'U-6', name: 'Test Doctor', email: 'doctor@test.smile', role: 'Doctor', requestedRole: 'Doctor', hospitalId: 'HOSP-1', status: 'Active', description: 'Sample approved doctor user for testing' },
    { id: 'U-7', name: 'Branch Assistant', email: 'branch.assistant@test.smile', role: 'Assistant', requestedRole: 'Assistant', hospitalId: 'HOSP-2', status: 'Active', description: 'Sample assistant for second hospital filtering' },
    { id: 'U-8', name: 'Test Doctor Two', email: 'doctor.two@test.smile', role: 'Doctor', requestedRole: 'Doctor', hospitalId: 'HOSP-1', status: 'Active', description: 'Second sample doctor for assistant selection testing' }
  ],
  doctorAssistantMappings: [
    { id: 'DAM-1', doctorId: 'U-1', hospitalId: 'HOSP-1', assistantIds: ['U-2'], updatedAt: '2026-05-08T09:00:00.000Z' },
    { id: 'DAM-2', doctorId: 'U-6', hospitalId: 'HOSP-1', assistantIds: ['U-5'], updatedAt: '2026-05-08T09:00:00.000Z' },
    { id: 'DAM-3', doctorId: 'U-8', hospitalId: 'HOSP-1', assistantIds: ['U-5'], updatedAt: '2026-05-08T09:00:00.000Z' }
  ],
  roles: [
    { id: 'ROLE-1', role: 'Super Admin', permissions: ['dashboard', 'backend_data', 'roles', 'authorization', 'audit', 'settings'] },
    { id: 'ROLE-2', role: 'Doctor', permissions: ['doctor_queue', 'analysis', 'prescription', 'tests', 'next_visit'] },
    { id: 'ROLE-3', role: 'Assistant', permissions: ['patient_intake', 'edit_basic_details', 'fees', 'upload_xray_report', 'view_prescription'] },
    { id: 'ROLE-4', role: 'Viewer', permissions: ['read_assigned'] }
  ],
  medicines: dentalMedicines,
  tests: [
    { id: 'XR-1', name: 'IOPA X-ray', type: 'X-ray', description: 'Intraoral periapical radiograph' },
    { id: 'XR-2', name: 'OPG X-ray', type: 'X-ray', description: 'Full mouth panoramic radiograph' },
    { id: 'XR-3', name: 'CBCT Scan', type: 'Imaging', description: 'Cone beam CT scan' },
    { id: 'LAB-1', name: 'Blood Sugar Test', type: 'Lab', description: 'Required before selected procedures' }
  ],
  templates: [
    { id: 'T-1', title: 'RCT Pain Management', description: 'Pain medicine, antibiotic if indicated, next visit instruction' },
    { id: 'T-2', title: 'Extraction Care', description: 'Post-surgery care, soft diet, follow-up instruction' },
    { id: 'T-3', title: 'Scaling Care', description: 'Mouthwash, sensitivity advice, review if bleeding persists' }
  ],
  audit: [
    { id: 'A-1', action: 'ASSISTANT_SUBMIT_TO_DOCTOR', actor: 'Anita Dsouza', entity: 'CASE-0001', description: 'Patient submitted to doctor queue', timestamp: '2026-05-07T08:30:00.000Z' },
    { id: 'A-2', action: 'DOCTOR_SUBMIT_CASE', actor: 'Dr. Meera Rao', entity: 'CASE-0002', description: 'Diagnosis, prescription, tests, next visit saved', timestamp: '2026-05-07T09:10:00.000Z' },
    { id: 'A-3', action: 'ASSISTANT_CLOSE_CASE', actor: 'Rahul More', entity: 'CASE-0003', description: 'Fees and reports completed', timestamp: '2026-05-06T10:55:00.000Z' }
  ],
  subscriptionPayments: [],
  feeReconciliations: [],
  notifications: []
};
