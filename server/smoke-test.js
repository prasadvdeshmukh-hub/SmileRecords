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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const health = await request('/health');
  assert(health.ok, 'Health check failed');

  await request('/admin/reset-data', {
    method: 'POST',
    body: JSON.stringify({ actor: 'Smoke Test' })
  });

  const intake = await request('/cases', {
    method: 'POST',
    body: JSON.stringify({
      appointmentTime: '12:45',
      patient: {
        name: 'Smoke Test Patient',
        mobile: '9876543210',
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

  const closure = await request(`/cases/${caseId}/assistant-close`, {
    method: 'PATCH',
    body: JSON.stringify({
      feesCollected: '500',
      xrayUploads: 'IOPA uploaded',
      medicalReports: 'Sensitivity notes attached',
      assistantNotes: 'Payment collected'
    })
  });
  assert(closure.case.visitStatus === 'assistant_work_done', 'Assistant closure did not save');

  const completed = await request(`/cases/${caseId}/visit-complete`, {
    method: 'PATCH',
    body: JSON.stringify({ actor: 'Smoke Test' })
  });
  assert(completed.case.status === 'completed', 'Visit was not completed');

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
