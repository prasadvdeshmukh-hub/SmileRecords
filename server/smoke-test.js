const API_URL = process.env.API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${payload.error || ''}`);
  }
  return payload;
}

async function requestError(path, options = {}, expectedStatus) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method || 'GET'} ${path} expected ${expectedStatus}, got ${response.status} ${payload.error || ''}`);
  }
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  const health = await request('/health');
  assert(health.ok, 'Health check failed');

  await request('/admin/reset-data', {
    method: 'POST',
    body: JSON.stringify({ actor: 'Smoke Test' })
  });

  const assistantLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'assistant@test.smile', provider: 'Google' })
  });
  assert(assistantLogin.user.role === 'Assistant', 'Sample assistant login failed');

  const doctorLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'doctor@test.smile', provider: 'Google' })
  });
  assert(doctorLogin.user.role === 'Doctor', 'Sample doctor login failed');

  const medicineMaster = await request('/medicines');
  assert(medicineMaster.medicines.length === 45, 'Dental medicine master should contain 45 records from workbook');

  const hospitals = await request('/hospitals');
  assert(hospitals.hospitals.length >= 2, 'Hospital master should contain sample hospitals');
  const mainHospital = hospitals.hospitals.find((item) => item.id === 'HOSP-1');
  assert(mainHospital, 'Primary hospital missing from master');

  await requestError('/access-requests', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Missing Hospital Test',
      email: 'missing.hospital@clinic.example',
      requestedRole: 'Assistant'
    })
  }, 400);

  const mappingOptions = await request('/doctor-assistant-mappings?doctorEmail=doctor@test.smile');
  assert(mappingOptions.assistants.some((assistant) => assistant.email === 'assistant@test.smile'), 'Doctor should see assistant from same hospital');
  assert(!mappingOptions.assistants.some((assistant) => assistant.email === 'branch.assistant@test.smile'), 'Doctor should not see assistant from another hospital');

  const savedMapping = await request('/doctor-assistant-mappings', {
    method: 'POST',
    body: JSON.stringify({
      doctorEmail: 'doctor@test.smile',
      assistantIds: ['U-5', 'U-7']
    })
  });
  assert(savedMapping.mapping.assistantIds.includes('U-5'), 'Same-hospital assistant should be mapped');
  assert(!savedMapping.mapping.assistantIds.includes('U-7'), 'Different-hospital assistant should not be mapped');

  const assistantDoctorOptions = await request('/assistant-doctor-options?assistantEmail=assistant@test.smile');
  assert(assistantDoctorOptions.doctors.some((doctor) => doctor.email === 'doctor@test.smile'), 'Mapped assistant should see assigned doctor');

  const accessRequest = await request('/access-requests', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Rejected Login Test',
      email: 'rejected.login@clinic.example',
      requestedRole: 'Assistant',
      hospitalId: mainHospital.id
    })
  });
  await request(`/users/${accessRequest.user.id}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ actor: 'Smoke Test' })
  });
  const rejectedLogin = await requestError('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'rejected.login@clinic.example', provider: 'Google' })
  }, 403);
  assert(rejectedLogin.error.includes('rejected'), 'Rejected login should show rejected access message');

  const intake = await request('/cases', {
    method: 'POST',
    body: JSON.stringify({
      appointmentTime: '12:45',
      doctorId: 'U-6',
      patient: {
        name: 'Smoke Test Patient',
        mobile: '9123456780',
        age: '38',
        gender: 'Female',
        address: 'Test Address',
        chiefComplaint: 'Sensitivity',
        toothNumber: '26',
        appointmentTime: '12:45',
        consent: true
      }
    })
  });
  const caseId = intake.case.id;
  assert(caseId, 'Case was not created');
  assert(intake.case.assignedDoctorId === 'U-6', 'Created case should retain selected doctor');

  const lookup = await request('/patients/lookup?mobile=9123456780&hospitalId=HOSP-1');
  assert(lookup.patient?.name === 'Smoke Test Patient', 'Mobile lookup should find same-hospital patient');

  const duplicateBlocked = await requestError('/cases', {
    method: 'POST',
    body: JSON.stringify({
      appointmentTime: '13:15',
      doctorId: 'U-6',
      patient: {
        name: 'Second Mobile Holder',
        mobile: '9123456780',
        age: '31',
        gender: 'Male',
        address: 'Duplicate Address',
        chiefComplaint: 'Consult',
        toothNumber: '11',
        appointmentTime: '13:15',
        consent: true
      }
    })
  }, 409);
  assert(duplicateBlocked.patient?.name === 'Smoke Test Patient', 'Duplicate guard should return matched patient');

  const duplicateAllowed = await request('/cases', {
    method: 'POST',
    body: JSON.stringify({
      appointmentTime: '13:15',
      doctorId: 'U-6',
      allowDuplicateMobile: true,
      patient: {
        name: 'Second Mobile Holder',
        mobile: '9123456780',
        age: '31',
        gender: 'Male',
        address: 'Duplicate Address',
        chiefComplaint: 'Consult',
        toothNumber: '11',
        appointmentTime: '13:15',
        consent: true
      }
    })
  });
  assert(duplicateAllowed.case.patientId !== intake.case.patientId, 'Confirmed duplicate mobile should create a second patient record');

  const multiLookup = await request('/patients/lookup?mobile=9123456780&hospitalId=HOSP-1');
  assert(multiLookup.patients.length >= 2, 'Lookup should return all same-mobile patient records');
  assert(Array.isArray(multiLookup.patients[0].historyDays), 'Lookup should include day-wise patient history');
  const fullPatientLookup = await request(`/patients/${intake.case.patientId}`);
  assert(fullPatientLookup.patient.age === '38', 'Full patient lookup should return saved age');
  assert(fullPatientLookup.patient.gender === 'Female', 'Full patient lookup should return saved gender');
  assert(fullPatientLookup.patient.address === 'Test Address', 'Full patient lookup should return saved address');

  const matchedExisting = await request('/cases', {
    method: 'POST',
    body: JSON.stringify({
      appointmentTime: '13:30',
      doctorId: 'U-6',
      matchedPatientId: intake.case.patientId,
      patient: {
        name: 'Typo Name Should Reuse Existing',
        mobile: '9123456780',
        age: '38',
        gender: 'Female',
        address: 'Test Address',
        chiefComplaint: 'Sensitivity review',
        toothNumber: '26',
        appointmentTime: '13:30',
        consent: true
      }
    })
  });
  assert(matchedExisting.case.patientId === intake.case.patientId, 'Confirmed existing mobile should reuse selected patient');
  assert(Array.isArray(matchedExisting.case.patient.historyDays), 'Created case should include linked day-wise patient history');

  const assistantIntakeBeforeSend = await request('/cases?queue=assistant-intake&doctorId=U-6');
  assert(assistantIntakeBeforeSend.cases.some((item) => item.id === caseId), 'New case should remain in assistant queue before send');

  const appointmentForCase = (await request(`/appointments?date=${today}&doctorId=U-6`)).appointments.find((item) => item.caseId === caseId);
  assert(appointmentForCase, 'Created appointment should be visible for selected doctor');
  await request(`/appointments/${appointmentForCase.id}/send-to-doctor`, {
    method: 'PATCH',
    body: JSON.stringify({ actor: 'Smoke Test' })
  });

  const assistantIntakeAfterSend = await request('/cases?queue=assistant-intake&doctorId=U-6');
  assert(!assistantIntakeAfterSend.cases.some((item) => item.id === caseId), 'Sent case should leave assistant intake queue');

  await requestError(`/cases/${caseId}/doctor-submit`, {
    method: 'PATCH',
    body: JSON.stringify({
      diagnosis: '',
      treatmentPlan: '',
      treatmentStatus: 'Pending'
    })
  }, 400);

  await requestError(`/cases/${caseId}/visit-complete`, {
    method: 'PATCH',
    body: JSON.stringify({ actor: 'Assistant' })
  }, 409);

  const doctor = await request(`/cases/${caseId}/doctor-submit`, {
    method: 'PATCH',
    body: JSON.stringify({
      diagnosis: 'Dentin hypersensitivity',
      treatmentPlan: 'Desensitizing treatment and review',
      treatmentStatus: 'In Progress',
      doctorNotes: 'Avoid cold drinks for 48 hours',
      testsRequested: [{ id: 'XR-1', name: 'IOPA X-ray', type: 'X-ray' }],
      prescriptionItems: [{ id: 'M-2', name: 'Ibuprofen 400mg', description: 'After food if pain persists' }],
      prescriptionForm: 'Sensitivity Care',
      nextVisitDate: '2026-05-15'
    })
  });
  assert(doctor.case.status === 'assistant_closure', 'Doctor submit did not move case to assistant closure');

  const doctorQueueAfterSubmit = await request('/cases?queue=doctor&doctorId=U-6');
  assert(!doctorQueueAfterSubmit.cases.some((item) => item.id === caseId), 'Doctor-submitted case should leave doctor queue');

  const closure = await request(`/cases/${caseId}/assistant-close`, {
    method: 'PATCH',
    body: JSON.stringify({
      feesCollected: '500',
      paymentMode: 'Cash',
      assistantNotes: 'Payment collected'
    })
  });
  assert(closure.case.visitStatus === 'assistant_work_done', 'Assistant closure did not save');
  assert(!('xrayUploads' in closure.case.closure), 'Assistant closure should not keep removed upload fields');

  const completed = await request(`/cases/${caseId}/visit-complete`, {
    method: 'PATCH',
    body: JSON.stringify({ actor: 'Assistant' })
  });
  assert(completed.case.status === 'completed', 'Visit was not completed');
  const feesQueueAfterComplete = await request('/cases?queue=assistant-closure&doctorId=U-6');
  assert(!feesQueueAfterComplete.cases.some((item) => item.id === caseId), 'Completed visit should leave fees queue');

  const doctorAppointments = await request(`/appointments?date=${today}&doctorId=U-6`);
  assert(doctorAppointments.appointments.every((item) => item.doctorId === 'U-6'), 'Appointment doctor filter failed');

  const feesSummary = await request(`/fees-summary?assistantEmail=assistant@test.smile&date=${today}&doctorId=U-6`);
  assert(feesSummary.summary.cashAmount >= 500, 'Fees summary should include collected cash amount');
  assert(feesSummary.cases.some((item) => item.id === caseId), 'Fees summary should list paid patient case');

  const reconciliation = await request('/fees-reconciliations', {
    method: 'POST',
    body: JSON.stringify({
      assistantEmail: 'assistant@test.smile',
      doctorId: 'U-6',
      date: today
    })
  });
  assert(reconciliation.reconciliation.status === 'Open', 'Fees reconciliation should open after assistant submission');

  const doctorReconList = await request('/fees-reconciliations?doctorEmail=doctor@test.smile&status=Open');
  assert(doctorReconList.reconciliations.some((item) => item.id === reconciliation.reconciliation.id), 'Doctor should see open reconciliation');

  const approvedRecon = await request(`/fees-reconciliations/${reconciliation.reconciliation.id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({ actor: 'Test Doctor' })
  });
  assert(approvedRecon.reconciliation.status === 'Closed', 'Doctor approval should close reconciliation');

  const cancelIntake = await request('/cases', {
    method: 'POST',
    body: JSON.stringify({
      appointmentTime: '13:00',
      doctorId: 'U-6',
      patient: {
        name: 'Doctor Cancel Test',
        mobile: '9876543211',
        age: '41',
        gender: 'Male',
        address: 'Cancel Address',
        chiefComplaint: 'Consultation cancellation',
        toothNumber: '16',
        appointmentTime: '13:00',
        consent: true
      }
    })
  });
  const cancelled = await request(`/cases/${cancelIntake.case.id}/doctor-cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ actor: 'Doctor' })
  });
  assert(cancelled.case.status === 'cancelled', 'Doctor cancel did not cancel case');

  const createdTest = await request('/tests', {
    method: 'POST',
    body: JSON.stringify({ name: 'Smoke Test X-ray', type: 'X-ray', description: 'Temporary test master' })
  });
  assert(createdTest.test.id, 'Test master was not created');

  await request(`/tests/${createdTest.test.id}`, { method: 'DELETE' });

  const dashboard = await request('/dashboard');
  assert(Array.isArray(dashboard.metrics), 'Dashboard metrics missing');

  console.log('SmileRecords backend smoke test passed');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
