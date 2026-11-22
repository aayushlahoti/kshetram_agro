# Kshetram

A restrained Next.js and Express monorepo for agricultural services. This phase contains only authentication, OTP/KYC structure, roles, and role-based access control.

## Roles

- `FARMER`
- `GOVT_BUYER`
- `ADMIN`

Marketplace, mower, seed, cattle-feed, and daily-tip features are intentionally out of scope. The crop-stubble marketplace is included.

## Local setup

Prerequisites: Node.js 20+, npm, Docker Desktop.

```powershell
npm install
Copy-Item server/.env.example server/.env
Copy-Item client/.env.local.example client/.env.local
docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. The API runs at `http://localhost:4000`.

In development, requesting an OTP returns `123456` for quick local testing.

## Commands

- `npm run dev` - start frontend and backend
- `npm run build` - build both workspaces
- `npm run lint` - type/lint checks
- `npm run db:generate` - generate Prisma Client
- `npm run db:migrate` - create and apply migrations

## Access checks

The backend provides `authenticate`, `authorize`, `isFarmer`, `isGovtBuyer`, and `isAdmin` middleware. Government-buyer KYC submission is available through `POST /api/auth/kyc/submit` with a bearer token.

## Stubble marketplace

- Farmers create listings through `POST /api/stubble/listings`.
- Administrators approve or reject listings through `PATCH /api/stubble/listings/:id/moderate`.
- Only government buyers with approved KYC can place bids or view farmer contact details.
- Farmers accept bids through `PATCH /api/stubble/bids/:id/accept`.
- Parties and administrators can view and advance orders through `/api/stubble/orders`.

## Feature scope

The demo includes stubble listings and procurement, mower availability and booking slots, one daily suggestion with archive, seed buy/sell marketplace, cattle-feed catalog with subscriptions, and role-aware dashboards.

## Dummy external credentials

Set these placeholders in environment variables only. Replace them before production:

- `JWT_SECRET=dummy-development-secret-change-in-production`
- `RAZORPAY_KEY_ID=dummy_razorpay_key_id`
- `RAZORPAY_KEY_SECRET=dummy_razorpay_key_secret`
- `MSG91_AUTH_KEY=dummy_msg91_auth_key`
- `TWILIO_ACCOUNT_SID=dummy_twilio_account_sid`
- `TWILIO_AUTH_TOKEN=dummy_twilio_auth_token`
- `AWS_ACCESS_KEY_ID=dummy_aws_access_key`
- `AWS_SECRET_ACCESS_KEY=dummy_aws_secret_key`
- `AWS_S3_BUCKET=dummy-kshetram-uploads`

The temporary OTP is `123456`. No SMS, payment, or cloud upload provider is called while using demo data.
