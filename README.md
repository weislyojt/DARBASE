# ILDF DAR Batangas — Municipal Records Portal

Internal records portal for the Department of Agrarian Reform, Batangas
Provincial Office. Stores title folders (CLOA records) by DARMO cluster and
municipality, with supporting documents, map pins, and Google Earth export.

## Architecture

| Layer     | Service                  | Why |
|-----------|--------------------------|-----|
| Hosting   | Railway                  | Runs the Node/Express app |
| Database  | PostgreSQL (Neon)        | Records; free tier, lives outside Railway |
| Documents | Cloudflare R2            | Uploaded files; free tier, no egress fees |

Because the data lives outside Railway, the Railway service is disposable —
rebuild or delete it and the records are untouched.

## Setup

### 1. Database (Neon — free)

1. Sign up at neon.tech, create a project.
2. **Connect → copy the POOLED connection string** (the host contains
   `-pooler`). The pooled URL matters: Neon's free compute allows few direct
   connections.
3. Keep it for step 3.

### 2. Document storage (Cloudflare R2 — free)

1. Sign up at cloudflare.com → **R2** → create a bucket (e.g. `ildf-documents`).
   Keep the bucket **private** — the app serves files through short-lived
   signed links.
2. **R2 → Manage API tokens → Create API token**, with Object Read & Write.
3. Note the **Account ID**, **Access Key ID**, and **Secret Access Key**.

### 3. Railway variables

In your Railway service → **Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `SESSION_SECRET` | any long random string |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET` | your bucket name |
| `NODE_ENV` | `production` |
| `DEFAULT_ADMIN_USERNAME` | first admin login (optional) |
| `DEFAULT_ADMIN_PASSWORD` | first admin password (optional) |

You no longer need a Railway **volume** — nothing is stored on disk.

### 4. Deploy

Push to GitHub; Railway builds and deploys automatically. On first boot the
app creates its tables and seeds the admin account, then starts serving.

## Local development

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL at minimum
npm start                # http://localhost:3000
```

If the R2 variables are left blank, documents are written to `./data/uploads`
instead. Handy for local work; not recommended in production.

## Features

- Login with admin-approved registration; admin and user roles
- DARMO clusters → municipalities → title folders → documents
- 37 document forms, tracked per folder as a Document Library checklist
- Global search plus admin-configurable filters (area range, remarks, barangay…)
- Remarks with add/delete management, shared across all users
- Map pin per parcel with place search, satellite and Street View
- Google Earth (KML) export, single record or whole municipality
- Light and dark themes
- Admin backup: full `.tar.gz` of records and documents, or records-only JSON
- Audit trail: every action logged permanently, with CSV export for auditors

## Backups

Admin → **Manage Users → Backup & Export**. Download a full backup regularly
and keep it off-platform. Neon also retains its own restore window, but an
independent copy you control is the real safety net.

`GET /api/admin/health` reports whether the database and storage are reachable.

## Audit trail

Every action is recorded in the `activity_log` table: sign-ins (including
failed attempts), folder and document creation and deletion, remarks and map
pin changes, account approvals, settings changes, and backup downloads. Each
entry stores the user, a readable description, the affected record, the IP
address, and a timestamp.

Folders and documents additionally carry `created_by_name`, shown in the UI as
"Added by ...". The name is stored alongside the account id so attribution
survives even if that account is later deleted.

Admin → **Manage Users → Audit Trail → Open Activity Log**, filterable by user
and activity type, with a CSV export.

The log is append-only: nothing in the application deletes from it.
