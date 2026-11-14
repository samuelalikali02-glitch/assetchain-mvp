# AssetChain

**A blockchain-backed digital asset identity, verification and marketplace platform.**

AssetChain is a digital asset management and verification platform designed to improve transparency, traceability and trust in asset ownership, documentation and marketplace transactions.

The platform enables users and organisations to register assets, create digital asset passports, submit supporting evidence, manage inspection workflows and explore asset marketplace listings. It also uses cryptographic hashing and Ethereum blockchain anchoring to support the integrity and independent verification of important asset records.

**Live Demo:** https://assetchain-mvp.vercel.app

**GitHub Repository:** https://github.com/samuelalikali02-glitch/assetchain-mvp

---

## Project Overview

AssetChain addresses the challenges associated with fragmented asset records, unreliable documentation, limited traceability and difficulties verifying asset information.

The platform provides a digital environment where asset information and supporting evidence can be organised, inspected and tracked through a structured workflow.

Its architecture combines a React frontend, Node.js API, Supabase services and Ethereum smart contracts.

## Key Features

### 1. Digital Asset Passports
- Register assets with names, categories, locations and descriptions.
- Generate unique asset passport identifiers.
- Maintain structured digital asset records.
- Support asset categories including agriculture, vehicles and real estate.

### 2. Evidence Management and Integrity
- Attach supporting asset documentation.
- Generate SHA-256 fingerprints for submitted documents.
- Identify matching document fingerprints across existing records.
- Maintain cryptographic hashes of important asset information.

### 3. Asset Inspection
- Support inspector assignment workflows.
- Generate category-specific inspection checklists.
- Submit inspection findings and supporting observations.
- Maintain versioned inspection reports.
- Generate cryptographic fingerprints of inspection reports.

### 4. Blockchain Evidence Anchoring
- Integrate with Ethereum through ethers.js.
- Anchor important asset events and evidence hashes.
- Maintain a queue for blockchain anchoring operations.
- Track transaction hashes, block numbers and confirmation statuses.
- Support verification of previously anchored evidence.

### 5. Asset Marketplace
- Publish asset listings.
- Support full-sale and fractional-sale listing types.
- Specify asking prices and ownership percentages.
- Allow eligible users to submit offers.
- Perform server-side ownership and organisation permission checks.

Marketplace offers are not equivalent to completed purchases. Payment processing and legal review must be implemented and completed separately.

### 6. Authentication and Account Management
- Account registration and sign-in.
- Email confirmation.
- Password recovery through email.
- Password reset functionality.
- User profile and notification preferences.
- Authenticated API requests.

### 7. Organisation Management
- Support organisation profiles.
- Manage organisation membership and permissions.
- Associate assets with organisations.
- Apply role-based authorisation to organisation activities.

### 8. Platform Administration
- Platform overview and organisation management.
- Inspector application submission and review.
- Administrative workflows and audit history.

---

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React 19 |
| Frontend tooling | Vite 8 |
| Backend | Node.js |
| API | Native Node.js HTTP server |
| Database and authentication | Supabase |
| Blockchain integration | Ethereum |
| Smart contract interaction | ethers.js 6 |
| Cryptographic hashing | SHA-256 |
| Smart contracts | Solidity |

## Repository Structure

```text
assetchain-mvp/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── App.jsx
│   │   │   ├── main.jsx
│   │   │   └── style.css
│   │   └── package.json
│   │
│   └── api/
│       ├── src/
│       │   ├── server.js
│       │   ├── auth.js
│       │   ├── supabase.js
│       │   ├── uploads.js
│       │   └── anchoring.js
│       ├── data/
│       └── package.json
│
├── contracts/
│
├── package.json
└── package-lock.json
```

## Getting Started

### Prerequisites

Install the following:

- Node.js 20.19+ or a compatible newer release.
- npm.
- A Supabase project.
- An Ethereum Sepolia RPC endpoint.
- A deployed AssetChain evidence-anchoring smart contract for blockchain functionality.

### 1. Clone the repository

```bash
git clone https://github.com/samuelalikali02-glitch/assetchain-mvp.git

cd assetchain-mvp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the frontend

Create a `.env` file inside `apps/web/`.

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_BASE_URL=https://your-backend-domain/api
```

### 4. Configure the backend

Create a `.env` file inside `apps/api/`.

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

SEPOLIA_RPC_URL=your_sepolia_rpc_url
PLATFORM_PRIVATE_KEY=your_platform_wallet_private_key
ASSETCHAIN_CONTRACT_ADDRESS=your_deployed_contract_address

INSPECTOR_EMAIL=your_inspector_email

# Optional backend role accounts
OWNER_EMAIL=your_owner_email
OWNER_PASSWORD=your_owner_password
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_admin_password
INSPECTOR_PASSWORD=your_inspector_password
USER_EMAIL=your_user_email
USER_PASSWORD=your_user_password

# Optional comma-separated frontend origins
WEB_ORIGINS=http://localhost:5173,https://your-frontend-domain
```

**Security warning:** Never publish `.env` files, private keys, Supabase service-role keys or other credentials. Keep privileged credentials exclusively on the server.

### 5. Start the backend

Open a terminal in the project root:

```bash
npm run dev:api
```

The API starts on:

```text
http://127.0.0.1:4000
```

You can check its health endpoint:

```text
http://127.0.0.1:4000/api/health
```

### 6. Start the frontend

Open another terminal in the project root:

```bash
npm run dev:web
```

Vite will display the local development URL in the terminal, usually:

```text
http://localhost:5173
```

### 7. Build the frontend

To create a production frontend build:

```bash
npm run build
```

The generated frontend build is placed in the web application's build output directory.

---

## Blockchain Architecture

AssetChain uses Ethereum smart contracts to anchor cryptographic evidence associated with important asset events.

The backend creates cryptographic fingerprints of important events and queues them for blockchain submission.

The anchoring worker processes queued events and tracks their transaction status.

The system is designed to support:
- Evidence integrity.
- Traceable asset events.
- Blockchain transaction references.
- Independent verification of anchored evidence.

The blockchain anchoring functionality requires a correctly deployed and configured smart contract and a funded platform wallet.

## Security and Trust

AssetChain incorporates several security-oriented design considerations:

- Authenticated API access.
- Role-based permissions.
- Server-side ownership checks.
- Organisation membership validation.
- Cryptographic evidence fingerprints.
- Restricted access to uploaded files.
- Protection of privileged backend credentials.

Blockchain anchoring and cryptographic hashing support evidence integrity but do not independently establish the truth of submitted asset information or prove legal ownership.

## Current Development Status

AssetChain is an evolving MVP.

The repository contains the core application structure and implementations for asset registration, authentication, evidence management, inspection workflows, marketplace functionality and blockchain anchoring.

Some workflows require additional deployment configuration, independent validation, legal review and production hardening before they can be considered production-ready.

## Future Improvements

Potential development areas include:

- Production-grade blockchain deployment and verification.
- More comprehensive asset ownership verification.
- Secure production file storage.
- Automated inspection and verification integrations.
- Marketplace payment and transaction settlement.
- Improved auditability and operational monitoring.
- Enhanced scalability and infrastructure resilience.
- Additional asset categories and integrations.

## Contributing

Contributions, suggestions and technical feedback are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement your changes.
4. Test your changes.
5. Submit a pull request describing your contribution.

## License

No open-source license has currently been specified. All rights remain with the repository owner unless a license is added.

---

**AssetChain — Building greater trust, transparency and traceability in digital asset management.**
