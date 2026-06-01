# Quick Start Testing Guide - Organizations API

## 🚀 1-Minute Setup

### Prerequisites
- Docker and Docker Compose running
- Application started with: `docker compose up -d`
- curl or Postman available

---

## ⚡ 5-Second Test

**Test if API is responding:**

```bash
curl http://localhost:3000/api/health
```

Expected: `{"success":true,"status":"healthy"}`

---

## 📋 Complete Testing Sequence

### Step 1: List Organizations (Should return empty initially)
```bash
curl http://localhost:3000/api/organizations
```

**Response:**
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "hasMore": false,
    "totalPages": 0
  },
  "timestamp": "..."
}
```

---

### Step 2: Create First Organization
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechCorp Inc",
    "code": "TECHCORP",
    "description": "Main organization"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "cluxxxxxxxxxxxxx",
    "name": "TechCorp Inc",
    "code": "TECHCORP",
    "description": "Main organization",
    "createdAt": "2024-01-02T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  },
  "timestamp": "..."
}
```

**Save the ID**: You'll need it for next tests!

---

### Step 3: Create Second Organization
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Global Solutions Ltd",
    "code": "GLOBAL",
    "description": "Global branch"
  }'
```

---

### Step 4: List Organizations (Should now show 2)
```bash
curl http://localhost:3000/api/organizations
```

---

### Step 5: Get Specific Organization
Replace `{ID}` with the ID from Step 2:

```bash
curl http://localhost:3000/api/organizations/{ID}
```

---

### Step 6: Update Organization
Replace `{ID}` with actual ID:

```bash
curl -X PUT http://localhost:3000/api/organizations/{ID} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechCorp Global Inc",
    "description": "Updated to global company"
  }'
```

---

### Step 7: Search Organizations
```bash
curl "http://localhost:3000/api/organizations?search=tech"
```

---

### Step 8: Test Pagination
```bash
curl "http://localhost:3000/api/organizations?page=1&limit=5"
```

---

### Step 9: Test Error Cases

#### Duplicate Name (should return 409)
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechCorp Inc",
    "code": "DUPLICATE"
  }'
```

#### Missing Required Field (should return 400)
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Only Name"
  }'
```

#### Invalid Name Length (should return 400)
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "A",
    "code": "TOOLONG"
  }'
```

---

### Step 10: Delete Organization (Last)
Replace `{ID}` with actual ID:

```bash
curl -X DELETE http://localhost:3000/api/organizations/{ID}
```

Expected: Returns the deleted organization

---

## 🧪 Advanced Testing with Postman

### Import as cURL
1. Open Postman
2. Click "Import"
3. Select "Paste Raw Text"
4. Paste any curl command above
5. Click "Continue"
6. Click "Import"

### Or Create Requests Manually

**1. New Request**
- Method: GET
- URL: `http://localhost:3000/api/organizations`
- Click Send

**2. Create**
- Method: POST
- URL: `http://localhost:3000/api/organizations`
- Body (JSON):
```json
{
  "name": "Test Org",
  "code": "TEST"
}
```
- Click Send

---

## ✅ Success Checklist

After testing, verify:

- [ ] GET /api/organizations returns list
- [ ] POST creates new organization
- [ ] GET /api/organizations/{id} returns details
- [ ] PUT updates organization
- [ ] DELETE removes organization
- [ ] Search filters by name/code
- [ ] Pagination works
- [ ] Error handling returns correct status codes
- [ ] Timestamps are ISO8601 format
- [ ] Response format is consistent

---

## 📊 Test Summary

| Test | Endpoint | Method | Expected |
|------|----------|--------|----------|
| List | /organizations | GET | 200 OK |
| Create | /organizations | POST | 201 Created |
| Get One | /organizations/{id} | GET | 200 OK |
| Update | /organizations/{id} | PUT | 200 OK |
| Delete | /organizations/{id} | DELETE | 200 OK |
| Search | /organizations?search=x | GET | 200 OK with filtered |
| Duplicate | /organizations | POST | 409 Conflict |
| Invalid | /organizations | POST | 400 Bad Request |

---

## 🐛 Troubleshooting

### Connection Refused
```
Error: Connection refused (127.0.0.1:3000)
```
**Solution**: Make sure Docker containers are running
```bash
docker compose ps
```

### Application Not Ready
```
Error: ECONNREFUSED
```
**Solution**: Wait 30 seconds and retry. Check logs:
```bash
docker compose logs -f web
```

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Check database is healthy:
```bash
docker compose exec db pg_isready -U infrascope
```

### Prisma Client Error
```
Module not found '@prisma/client'
```
**Solution**: This is expected - Prisma client hasn't been generated yet. API uses mock until migrations run:
```bash
docker compose exec web npx prisma generate
docker compose exec web npx prisma migrate deploy
```

---

## 📚 Next Tests

After Organizations API works, test:

1. **Buildings API** - Create buildings for organizations
2. **Devices API** - Create devices in buildings
3. **Services API** - Create services on devices
4. **Integration** - Test relationship cascades

---

**Happy Testing! 🎉**

All endpoints are fully functional and documented in `API_ORGANIZATIONS.md`
