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

The backend is an Express API with Firebase Firestore support. If Firebase credentials are configured, `/api/health` shows `storage: "firestore"` and all app data is saved into one Firestore document. If Firebase is not configured, the app falls back to JSON-file persistence for local testing.

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
```

After deployment, open `/api/health`. It should show:

```json
{
  "storage": "firestore",
  "firestoreDocument": "smileRecords/appState"
}
```

Without Firebase variables, local fallback creates:

`server/data/smile-records.local.json`

That file is ignored by git so local test data does not get committed. To reset local data back to the seeded demo records:

```powershell
Invoke-RestMethod -Method Post http://localhost:4000/api/admin/reset-data -ContentType 'application/json' -Body '{}'
```

Useful backend commands:

```powershell
npm run dev:api
npm run test:api
```

Health check: `http://localhost:4000/api/health`

Backend smoke test flow:

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
