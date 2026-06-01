# Testing Guide - Organizations & Buildings APIs

Complete step-by-step testing guide for both APIs.

## 📋 Prerequisites

- Docker containers running: `docker compose ps`
- Application health: `curl http://localhost:3000/api/health`

---

## 🧪 Phase 1: Organizations API Testing

### Step 1: Create First Organization
```bash
ORG_ID=$(curl -s -X POST "http://localhost:3000/api/organizations" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechCorp Inc",
    "code": "TECHCORP",
    "description": "Main enterprise organization"
  }' | jq -r '.data.id')

echo "Created organization: $ORG_ID"
```

**Expected**: Returns organization object with ID

### Step 2: Create Second Organization
```bash
ORG_ID_2=$(curl -s -X POST "http://localhost:3000/api/organizations" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Global Solutions Ltd",
    "code": "GLOBAL",
    "description": "International branch"
  }' | jq -r '.data.id')

echo "Created organization: $ORG_ID_2"
```

### Step 3: List Organizations
```bash
curl -X GET "http://localhost:3000/api/organizations"
```

**Expected**: Returns array with 2 organizations and pagination metadata

### Step 4: Search Organizations
```bash
curl -X GET "http://localhost:3000/api/organizations?search=tech"
```

**Expected**: Returns only "TechCorp Inc"

### Step 5: Get Specific Organization
```bash
curl -X GET "http://localhost:3000/api/organizations/$ORG_ID"
```

**Expected**: Returns single organization with empty buildings array

### Step 6: Update Organization
```bash
curl -X PUT "http://localhost:3000/api/organizations/$ORG_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechCorp Global Inc",
    "description": "Expanded global presence"
  }'
```

**Expected**: Returns updated organization

---

## 🏢 Phase 2: Buildings API Testing

### Step 1: Create Building in First Organization
```bash
BUILDING_ID=$(curl -s -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"New York Data Center\",
    \"address\": \"123 Tech Street, Manhattan, New York\",
    \"city\": \"New York\",
    \"country\": \"USA\",
    \"organizationId\": \"$ORG_ID\",
    \"postalCode\": \"10001\",
    \"latitude\": 40.7128,
    \"longitude\": -74.0060
  }" | jq -r '.data.id')

echo "Created building: $BUILDING_ID"
```

**Expected**: Returns building object with ID, linked to organization

### Step 2: Create Second Building
```bash
BUILDING_ID_2=$(curl -s -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"San Francisco HQ\",
    \"address\": \"456 Tech Ave, San Francisco\",
    \"city\": \"San Francisco\",
    \"country\": \"USA\",
    \"organizationId\": \"$ORG_ID\",
    \"postalCode\": \"94105\",
    \"latitude\": 37.7749,
    \"longitude\": -122.4194
  }" | jq -r '.data.id')

echo "Created building: $BUILDING_ID_2"
```

### Step 3: Create Building in Second Organization
```bash
BUILDING_ID_3=$(curl -s -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"London Office\",
    \"address\": \"789 Tech Lane, London\",
    \"city\": \"London\",
    \"country\": \"UK\",
    \"organizationId\": \"$ORG_ID_2\",
    \"latitude\": 51.5074,
    \"longitude\": -0.1278
  }" | jq -r '.data.id')

echo "Created building: $BUILDING_ID_3"
```

### Step 4: List All Buildings
```bash
curl -X GET "http://localhost:3000/api/buildings"
```

**Expected**: Returns 3 buildings with pagination

### Step 5: Filter Buildings by Organization
```bash
curl -X GET "http://localhost:3000/api/buildings?organizationId=$ORG_ID"
```

**Expected**: Returns 2 buildings (New York and San Francisco)

### Step 6: Filter by City
```bash
curl -X GET "http://localhost:3000/api/buildings?city=New+York"
```

**Expected**: Returns 1 building (New York Data Center)

### Step 7: Search Buildings
```bash
curl -X GET "http://localhost:3000/api/buildings?search=San+Francisco"
```

**Expected**: Returns San Francisco HQ building

### Step 8: Get Specific Building
```bash
curl -X GET "http://localhost:3000/api/buildings/$BUILDING_ID"
```

**Expected**: Returns building with organization details and empty floors array

### Step 9: Update Building
```bash
curl -X PUT "http://localhost:3000/api/buildings/$BUILDING_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Manhattan",
    "latitude": 40.7580,
    "longitude": -73.9855
  }'
```

**Expected**: Returns updated building

### Step 10: Test Pagination
```bash
curl -X GET "http://localhost:3000/api/buildings?page=1&limit=2"
```

**Expected**: Returns 2 buildings with pagination showing totalPages=2

---

## 🧪 Phase 3: Error Testing

### Test Invalid Organization
```bash
curl -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Invalid Org Building",
    "address": "123 St",
    "city": "City",
    "country": "Country",
    "organizationId": "invalid_org_id"
  }'
```

**Expected**: 404 error - "Organization with ID invalid_org_id not found"

### Test Duplicate Building Name
```bash
curl -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"New York Data Center\",
    \"address\": \"Different Address\",
    \"city\": \"Different City\",
    \"country\": \"USA\",
    \"organizationId\": \"$ORG_ID\"
  }"
```

**Expected**: 409 error - "A building with this name already exists in this organization"

### Test Invalid Coordinates
```bash
curl -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Invalid Coords\",
    \"address\": \"123 St\",
    \"city\": \"City\",
    \"country\": \"Country\",
    \"organizationId\": \"$ORG_ID\",
    \"latitude\": 95
  }"
```

**Expected**: 400 error - "Latitude must be between -90 and 90"

### Test Missing Required Fields
```bash
curl -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Incomplete Building"
  }'
```

**Expected**: 400 error - "name, address, city, country, and organizationId are required"

### Test Delete Building with Floors
```bash
curl -X DELETE "http://localhost:3000/api/buildings/$BUILDING_ID"
```

**Expected**: 409 error (once floors are added) - "Cannot delete building with X floor(s). Delete floors first."

---

## 📊 Test Summary

### Success Cases
| Test | Expected Status |
|------|-----------------|
| Create organization | 201 |
| List organizations | 200 |
| Get organization | 200 |
| Update organization | 200 |
| Create building | 201 |
| List buildings | 200 |
| Filter buildings | 200 |
| Search buildings | 200 |
| Get building | 200 |
| Update building | 200 |

### Error Cases
| Test | Expected Status |
|------|-----------------|
| Invalid organization ID | 404 |
| Duplicate building name | 409 |
| Invalid coordinates | 400 |
| Missing required fields | 400 |
| Non-existent building | 404 |
| Delete with children | 409 |

---

## 🔄 Relationship Testing

### Verify Organizations have Buildings
```bash
curl -X GET "http://localhost:3000/api/organizations/$ORG_ID"
```

**Expected**: Response includes `buildings` array with created buildings

### Verify Buildings Reference Organizations
```bash
curl -X GET "http://localhost:3000/api/buildings/$BUILDING_ID"
```

**Expected**: Response includes `organization` object with org details

### Cross-Organization Isolation
```bash
curl -X GET "http://localhost:3000/api/buildings?organizationId=$ORG_ID"
curl -X GET "http://localhost:3000/api/buildings?organizationId=$ORG_ID_2"
```

**Expected**: Each query returns only buildings for that organization

---

## 📱 Using Postman (Alternative)

1. **Import Collection**: Use the curl commands above
2. **Set Variables**:
   - `org_id`: Store from first organization creation
   - `org_id_2`: Store from second organization creation
   - `building_id`: Store from first building creation
3. **Create Tests**: Add assertions for response codes and data

---

## ✅ Completion Checklist

- [ ] Create organizations works (201)
- [ ] List organizations works (200)
- [ ] Search organizations works (200)
- [ ] Get organization works (200)
- [ ] Update organization works (200)
- [ ] Create buildings works (201)
- [ ] List buildings works (200)
- [ ] Filter buildings by organization works
- [ ] Filter buildings by city works
- [ ] Search buildings works (200)
- [ ] Get building works (200)
- [ ] Update building works (200)
- [ ] Duplicate organization prevention works (409)
- [ ] Duplicate building prevention works (409)
- [ ] Invalid coordinates rejected (400)
- [ ] Non-existent organization returns 404
- [ ] Relationships properly linked

---

## 🚀 Next Steps

Once both APIs are verified:

1. **Implement Floors API** - Depends on Buildings
2. **Implement Rooms API** - Depends on Floors
3. **Implement Racks API** - Depends on Rooms
4. **Test cascading relationships**

---

**Happy Testing! 🎉**

For detailed endpoint documentation, see:
- `API_ORGANIZATIONS.md`
- `API_BUILDINGS.md`
