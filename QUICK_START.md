# InfraScope - Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Text editor or IDE

### Step 1: Install Dependencies
```bash
cd d:\Dev\infraScope
npm install
```

### Step 2: Configure Database
Edit `.env.local` and set your PostgreSQL connection:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/infrascope"
```

### Step 3: Generate Prisma Client
```bash
npx prisma generate
```

### Step 4: Create Database
```bash
npx prisma db push
```

### Step 5: Load Sample Data
```bash
npm run db:seed
```

### Step 6: Start Development Server
```bash
npm run dev
```

### Step 7: Open in Browser
Visit: `http://localhost:3000/dashboard`

---

## 🌐 Access the Application

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/dashboard` | Overview & metrics |
| Devices | `/devices` | Device inventory |
| Locations | `/locations` | Infrastructure hierarchy |
| Services | `/services` | Service management |
| Network | `/network` | Network topology |

---

## 🛠️ Common Tasks

### View Database in GUI
```bash
npm run db:studio
```

### Reset Database
```bash
npx prisma migrate reset
```

### Update Database Schema
1. Edit `prisma/schema.prisma`
2. Run: `npx prisma migrate dev --name your_migration_name`

### Create New Page
1. Create folder: `app/your-page/`
2. Create file: `page.tsx`
3. Use Header component and Tailwind CSS
4. Add link to Header navigation

### Build for Production
```bash
npm run build
npm run start
```

---

## 📁 Key Files to Know

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Database schema |
| `types/index.ts` | All TypeScript types |
| `lib/api.ts` | API utilities |
| `lib/formatting.ts` | Text formatting helpers |
| `app/layout.tsx` | Root layout |
| `components/layout/Header.tsx` | Navigation header |

---

## 🔍 Project Structure

```
app/                 # Pages & API routes
├── dashboard/       # Dashboard page
├── devices/         # Device page
├── locations/       # Locations page
├── services/        # Services page
├── network/         # Network page
└── api/             # API endpoints

components/          # React components
├── layout/          # Layout components
└── ...

lib/                 # Utilities
├── api.ts           # API client
├── formatting.ts    # Formatting utilities
└── prisma.ts        # Database client

types/               # TypeScript definitions
prisma/              # Database schema & seed
```

---

## 💡 Tips

- **Mock Data**: Pages use mock data for demonstration
- **Ready for APIs**: Pages are ready to connect to real API endpoints
- **Type Safe**: Use TypeScript enums from `types/index.ts`
- **Styling**: Use Tailwind CSS classes throughout
- **API Format**: All endpoints follow consistent response format

---

## ❓ Troubleshooting

### Can't connect to PostgreSQL?
```bash
# Create database if it doesn't exist
createdb infrascope

# Check connection
psql -U postgres -d infrascope
```

### Port 3000 already in use?
```bash
npm run dev -- -p 3001
```

### TypeScript errors?
```bash
npm run type-check
```

### Components not updating?
```bash
# Clear cache
rm -rf .next
npm run dev
```

---

## 📚 Documentation

- **ARCHITECTURE.md** - Detailed architecture guide
- **SETUP.md** - Complete setup instructions
- **PROJECT_SUMMARY.md** - Full project overview
- **QUICK_START.md** - This file

---

## ✨ Ready to Use

- ✅ Database schema (complete)
- ✅ Type definitions (complete)
- ✅ UI pages (complete)
- ✅ Styling (complete)
- ✅ Utilities (complete)
- ✅ Documentation (complete)

**Next: Connect API endpoints to database and implement CRUD operations**

---

**Happy Coding! 🎉**
