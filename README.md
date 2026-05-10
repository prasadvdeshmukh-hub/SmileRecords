# SmileRecords

SmileRecords is a dentist patient data management MVP with mobile-first Assistant and Doctor workflows plus a separate web Admin panel.

## Run

```powershell
npm install
npm run dev
```

Login / role selector: `http://localhost:5173/login`

Assistant mobile view: `http://localhost:5173/assistant/intake`

Doctor mobile view: `http://localhost:5173/doctor/queue`

Admin web panel: `http://localhost:5173/admin`

API: `http://localhost:4000/api`

## Deploy To Render

The repository includes `render.yaml` for one-service deployment. Render builds the React app, starts the Express backend, serves `/api/*`, and serves the React app from the same public URL.

Deploy link:

https://render.com/deploy?repo=https://github.com/prasadvdeshmukh-hub/SmileRecords

After Render finishes deployment, open:

- App login: `https://YOUR-RENDER-SERVICE.onrender.com/login`
- API health: `https://YOUR-RENDER-SERVICE.onrender.com/api/health`

## Backend Storage

The backend is an Express API with Firebase Firestore support. If Firebase credentials are configured, `/api/health` shows `storage: "firestore"` and all app data is saved into one Firestore document. Render/production requires Firebase and will not fall back to local JSON storage.

### Firebase Free Database Setup

Create a Firebase project, enable Firestore Database, then create a service account key from Firebase Console -> Project settings -> Service accounts.

For Render/Replit, add either this single environment variable:

```text
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 encoded service-account-json>
```

For local testing, put the same values in a `.env` file at the project root. `.env` is ignored by git.

Or add these three variables:

```text
FIREBASE_PROJECT_ID=<your-project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key-with-\n-newlines>
```

Optional:

```text
FIREBASE_COLLECTION=smileRecords
FIREBASE_DOCUMENT=appState
FIREBASE_BACKUP_COLLECTION=smileRecordsBackups
```

For an existing live app, keep `FIREBASE_COLLECTION` and `FIREBASE_DOCUMENT` unchanged across every Render deployment. If either value changes, the app will look at a different Firestore document and the old records will not appear.

On Render, the app will not automatically create a new seed Firestore document. For first-time setup only, set:

```text
ALLOW_FIRESTORE_INITIALIZE=true
```

Deploy once, confirm `/api/health` shows `storage: "firestore"`, then remove `ALLOW_FIRESTORE_INITIALIZE` so future typos cannot silently create a fresh empty dataset.

After deployment, open `/api/health`. It should show:

```json
{
  "storage": "firestore",
  "firestoreDocument": "smileRecords/appState"
}
```

Use the same Firebase variables locally if you want local and Render to use the same central repository. Without Firebase variables, local fallback creates:

`server/data/smile-records.local.json`

That file is ignored by git so local test data does not get committed.

### Razorpay Subscription Setup

Add these environment variables in Render to enable subscription payments:

```text
RAZORPAY_KEY_ID=<your-razorpay-key-id>
RAZORPAY_KEY_SECRET=<your-razorpay-key-secret>
```

Optional billing settings:

```text
SUBSCRIPTION_MONTHLY_AMOUNT=999
SUBSCRIPTION_TRIAL_DAYS=30
```

Every approved user receives the first month free. After the trial ends, SmileRecords requires a verified Razorpay payment of Rs. 999 in advance before the user can continue into Assistant, Doctor, or Admin views. Payment access is granted only after backend signature verification.

### Reset and Smoke Test Safety

Never run smoke tests against the shared Firestore document. The smoke test resets data by design, so start the API with isolated JSON-file storage:

```powershell
$env:SMILE_RECORDS_STORAGE='json-file'
$env:SMILE_RECORDS_DATA_FILE='D:\SmileRecords\server\data\smoke-test.local.json'
$env:ALLOW_DATA_RESET='true'
npm start
```

Then in another terminal:

```powershell
$env:API_URL='http://127.0.0.1:4000/api'
npm run test:api
```

The reset endpoint is disabled by default for Firestore-backed or deployed environments. To perform an intentional one-time Firestore reset, both values are required:

```text
ALLOW_DATA_RESET=true
DATA_RESET_CONFIRMATION=<strong one-time token>
```

The request body must include the same confirmation token. Remove these variables immediately after the reset.

To reset only isolated local JSON test data back to the seeded demo records:

```powershell
$env:ALLOW_DATA_RESET='true'
Invoke-RestMethod -Method Post http://localhost:4000/api/admin/reset-data -ContentType 'application/json' -Body '{"actor":"Local Test"}'
Remove-Item Env:ALLOW_DATA_RESET
```

Useful backend commands:

```powershell
npm run dev:api
npm run test:api
```

Health check: `http://localhost:4000/api/health`

Backend smoke test flow, only on isolated JSON storage:

- Reset seed data
- Create a new assistant intake case
- Submit doctor diagnosis, X-rays/tests, prescription, and next visit
- Save assistant billing/uploads
- Mark visit complete
- Add and delete a test master
- Verify dashboard metrics

## Included Modules

- Role selector for Assistant mobile, Doctor mobile, and Admin web
- Assistant patient basic intake, edit basic patient details, offline draft save, queue sync
- Appointment calendar, queue numbering, skipped numbers, and one-by-one send-next flow
- Doctor queue with diagnosis, analysis, tests/X-rays, prescription form, prescription details, next visit date, and visit completion
- Assistant post-doctor queue for fee collection, X-ray/report upload notes, assistant work submission, and mark visit complete
- Admin dashboard, backend data, patient/case management, authorization, role creation, masters, analytics, audit logs
- Medicine and prescription template masters
- Offline data support for assistant mobile intake drafts via device local storage

## API Highlights

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/appointments`
- `PATCH /api/appointments/:id/send-to-doctor`
- `PATCH /api/appointments/:id/recall-to-waiting`
- `PATCH /api/appointments/:id/doctor-done`
- `PATCH /api/appointments/:id/complete`
- `GET /api/cases`
- `POST /api/cases`
- `GET /api/cases/:id`
- `PATCH /api/cases/:id/basic`
- `PATCH /api/cases/:id/doctor-submit`
- `PATCH /api/cases/:id/assistant-close`
- `PATCH /api/cases/:id/visit-complete`
- `GET /api/patients`
- `GET /api/patients/lookup?mobile=9876543210`
- `GET/POST/PATCH/DELETE /api/users`
- `GET/POST/PATCH/DELETE /api/roles`
- `GET/POST/PATCH/DELETE /api/medicines`
- `GET/POST/DELETE /api/tests`
- `GET/POST/PATCH/DELETE /api/templates`
- `GET /api/admin/export`
- `POST /api/admin/reset-data`
