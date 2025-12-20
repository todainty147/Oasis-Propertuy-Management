# 🏠 Property Management SaaS

A modern property management SaaS built with **React**, **Tailwind CSS**, and **Supabase**.  
Designed for landlords and property managers to manage **properties, tenants, and finances** with real-time updates and secure row-level access.

---

## ✨ Features

### 🏢 Properties
- Create, edit, and delete properties
- Assign tenants to properties
- Real-time updates via Supabase subscriptions

### 👤 Tenants
- Full CRUD (Create, Read, Update, Delete)
- Assign / unassign tenants to properties
- Realtime synchronization
- Secure ownership via Row Level Security (RLS)

### 💰 Finance
- Live income summary
- Expected vs paid vs overdue payments
- Aggregated per property and globally
- Derived data (no duplicated state)

### 🔐 Authentication & Security
- Supabase Auth
- Row Level Security (RLS) on all core tables
- Data automatically scoped to the logged-in user

---

## 🧱 Tech Stack

- **Frontend**
  - React
  - React Router
  - Tailwind CSS
  - Vite

- **Backend**
  - Supabase
    - PostgreSQL
    - Auth
    - Row Level Security (RLS)
    - Realtime subscriptions

---

## 📂 Project Structure

src/
├── components/ # Reusable UI components
├── pages/ # Route pages (Dashboard, Properties, Tenants, Finance)
├── hooks/ # Supabase data hooks (useProperties, useTenants, etc.)
├── services/ # Supabase CRUD services
├── layout/ # App layout (Sidebar, Topbar)
├── lib/ # Supabase client
└── data/ # Mock data (being phased out)


---

## 🚀 Getting Started

### 1️⃣ Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

###Install dependencies
npm install

### Configure environment variables
Create a .env file in the root:
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

## RUN THE APP
npm run dev

##The app will be available at:
http://localhost:5173
🗄️ Supabase Schema (Core Tables)
properties

id (uuid)

owner_id → auth.users.id

address

city

status

tenants

id (uuid)

owner_id → auth.users.id

property_id → properties.id

name

email

phone

payments

id

property_id

amount

status

due_date

All tables use Row Level Security to ensure users only access their own data.

🔒 Security Model

Ownership enforced at the database level using RLS

Frontend does not filter by user — Supabase handles it

Safe against accidental cross-user access

🛠️ Development Notes

Realtime updates handled via Supabase channels

No duplicated derived state (finance is computed, not stored)

UUIDs used everywhere — no numeric IDs

Modals reused for create/edit flows

📈 Roadmap

 Auth UI (login / logout)

 Payments CRUD

 Charts for finance dashboard

 Remove remaining mock data

 Deployment (Vercel / Netlify)

 Role-based access (admin / manager)

🧑‍💻 Author

Built by [Your Name]
For learning, experimentation, and real-world SaaS architecture practice.

📄 License

MIT (or your preferred license)


---

## ✅ Commit the README

After saving `README.md`:

```bash
git add README.md
git commit -m "Add professional README"
git push

