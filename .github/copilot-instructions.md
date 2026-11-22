# Kshetram workspace instructions

- Project: restrained Next.js and Express monorepo for an agricultural commerce platform.
- Visual direction: warm cream, agricultural green, restrained gold accents; avoid flashy effects and black/blue-only themes.
- Implemented scopes: roles, OTP demo authentication, KYC structure, stubble marketplace, mower lending, daily suggestions, seed exchange, and cattle-feed store.
- Roles: FARMER, GOVT_BUYER, EQUIPMENT_OFFICER, ADMIN.
- Government buyer bidding and contact access require APPROVED KYC.
- Stubble flow: listing creation → admin approval → verified buyer bids → farmer bid acceptance → pickup, weighbridge, settlement tracking.
- Frontend: Next.js App Router, TypeScript, Tailwind CSS, role-aware navigation, auth context, typed API services.
- Backend: Express, TypeScript, temporary demo data plus Prisma/PostgreSQL and Redis-ready structure.
- Keep setup reproducible on Windows with npm scripts and Docker Compose.
