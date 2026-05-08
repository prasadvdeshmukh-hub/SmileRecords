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
        xrayUploads: '',
        medicalReports: 'Scaling notes uploaded',
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
    { id: 'APT-1', caseId: 'CASE-0001', time: '09:30', patientName: 'Neha Patil', type: 'Consult', status: 'waiting', queueNumber: 12 },
    { id: 'APT-2', caseId: 'CASE-0002', time: '10:00', patientName: 'Aarav Shah', type: 'RCT', status: 'doctor_done', queueNumber: 11 },
    { id: 'APT-3', caseId: '', time: '10:30', patientName: 'Maya Kulkarni', type: 'Scaling', status: 'scheduled', queueNumber: 13 },
    { id: 'APT-4', caseId: '', time: '11:00', patientName: 'Kabir Mehta', type: 'Review', status: 'scheduled', queueNumber: 14 }
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
  users: [
    { id: 'U-1', name: 'Dr. Meera Rao', email: 'meera@clinic.example', role: 'Doctor', status: 'Active', description: 'Doctor mobile and clinical submission access' },
    { id: 'U-2', name: 'Anita Dsouza', email: 'anita@clinic.example', role: 'Assistant', status: 'Active', description: 'Mobile intake, edit basic details, fees, uploads' },
    { id: 'U-3', name: 'Clinic Admin', email: 'admin@clinic.example', role: 'Super Admin', status: 'Active', description: 'Admin web panel access' },
    { id: 'U-4', name: 'New Staff', email: 'new@clinic.example', role: 'Pending', status: 'Pending', description: 'Awaiting admin authorization' }
  ],
  roles: [
    { id: 'ROLE-1', role: 'Super Admin', permissions: ['dashboard', 'backend_data', 'roles', 'authorization', 'audit', 'settings'] },
    { id: 'ROLE-2', role: 'Doctor', permissions: ['doctor_queue', 'analysis', 'prescription', 'tests', 'next_visit'] },
    { id: 'ROLE-3', role: 'Assistant', permissions: ['patient_intake', 'edit_basic_details', 'fees', 'upload_xray_report', 'view_prescription'] },
    { id: 'ROLE-4', role: 'Viewer', permissions: ['read_assigned'] }
  ],
  medicines: [
    { id: 'M-1', name: 'Amoxicillin 500mg', generic: 'Amoxicillin', description: 'Capsule - 1-0-1 after food - 5 days' },
    { id: 'M-2', name: 'Ibuprofen 400mg', generic: 'Ibuprofen', description: 'Tablet - pain management - after food' },
    { id: 'M-3', name: 'Chlorhexidine Mouthwash', generic: 'Chlorhexidine', description: 'Rinse twice daily - 7 days' }
  ],
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
  ]
};
