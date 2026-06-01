# Floors API Documentation

Complete API documentation for managing floors in InfraScope.

## Base URL
```
http://localhost:3000/api/floors
```

---

## Endpoints

### 1. List Floors
**GET** `/api/floors`

Retrieve all floors in a building with pagination and filtering.

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| buildingId | string | Yes | - | Building ID (required for safety) |
| page | number | No | 1 | Page number for pagination |
| limit | number | No | 10 | Items per page (max 100) |
| search | string | No | - | Search by floor name |
| floorNumber | number | No | - | Filter by exact floor number |

#### Example Requests
```bash
# List all floors in a building
curl -X GET "http://localhost:3000/api/floors?buildingId=bld_123"

# List with pagination
curl -X GET "http://localhost:3000/api/floors?buildingId=bld_123&page=1&limit=20"

# Search for specific floor
curl -X GET "http://localhost:3000/api/floors?buildingId=bld_123&search=lobby"

# Filter by floor number
curl -X GET "http://localhost:3000/api/floors?buildingId=bld_123&floorNumber=5"

# Combine filters
curl -X GET "http://localhost:3000/api/floors?buildingId=bld_123&search=server&page=1&limit=10"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "flr_123",
      "name": "Basement - Server Room",
      "floorNumber": -1,
      "buildingId": "bld_123",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "building": {
        "id": "bld_123",
        "name": "New York Data Center",
        "city": "New York"
      },
      "rooms": [
        {
          "id": "rm_123",
          "name": "Server Room A",
          "capacity": 100
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "hasMore": true,
    "totalPages": 2
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Response (400 - Missing buildingId)
```json
{
  "success": false,
  "error": "buildingId query parameter is required",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 2. Create Floor
**POST** `/api/floors`

Create a new floor in a building.

#### Request Body
```json
{
  "name": "Floor Name",
  "floorNumber": 5,
  "buildingId": "bld_123"
}
```

#### Validation Rules
- **name**: Required, 1-255 characters, unique per building is recommended
- **floorNumber**: Required, integer between -100 (basement) and 1000
- **buildingId**: Required, must exist in database
- **Unique Constraint**: (buildingId, floorNumber) must be unique

#### Example Request
```bash
curl -X POST "http://localhost:3000/api/floors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "5th Floor - Management",
    "floorNumber": 5,
    "buildingId": "bld_123"
  }'
```

#### Success Response (201)
```json
{
  "success": true,
  "data": {
    "id": "flr_456",
    "name": "5th Floor - Management",
    "floorNumber": 5,
    "buildingId": "bld_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "building": {
      "id": "bld_123",
      "name": "New York Data Center",
      "city": "New York"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Responses

**Missing Required Fields (400)**
```json
{
  "success": false,
  "error": "name, floorNumber, and buildingId are required",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Invalid Floor Number (400)**
```json
{
  "success": false,
  "error": "floorNumber must be between -100 (basement) and 1000",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Building Not Found (404)**
```json
{
  "success": false,
  "error": "Building with ID bld_invalid not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Duplicate Floor Number (409)**
```json
{
  "success": false,
  "error": "A floor with this floor number already exists in this building",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 3. Get Floor
**GET** `/api/floors/{id}`

Retrieve a specific floor with all related rooms and racks.

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Floor ID |

#### Example Request
```bash
curl -X GET "http://localhost:3000/api/floors/flr_123"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "flr_123",
    "name": "Basement - Server Room",
    "floorNumber": -1,
    "buildingId": "bld_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "building": {
      "id": "bld_123",
      "name": "New York Data Center",
      "city": "New York",
      "organizationId": "org_123"
    },
    "rooms": [
      {
        "id": "rm_123",
        "name": "Server Room A",
        "capacity": 100,
        "racks": [...]
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Response (404)
```json
{
  "success": false,
  "error": "Floor not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 4. Update Floor
**PUT** `/api/floors/{id}`

Update an existing floor.

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Floor ID |

#### Request Body
```json
{
  "name": "Updated Floor Name",
  "floorNumber": 6
}
```

**Note**: All fields are optional. At least one field must be provided.

#### Example Request
```bash
curl -X PUT "http://localhost:3000/api/floors/flr_123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "5th Floor - Executive Suite",
    "floorNumber": 5
  }'
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "flr_123",
    "name": "5th Floor - Executive Suite",
    "floorNumber": 5,
    "buildingId": "bld_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T12:00:00.000Z",
    "building": {
      "id": "bld_123",
      "name": "New York Data Center",
      "city": "New York"
    },
    "rooms": [...]
  },
  "message": "Floor updated successfully",
  "timestamp": "2024-01-02T12:00:00.000Z"
}
```

#### Error Response (409 - Duplicate Floor Number)
```json
{
  "success": false,
  "error": "A floor with this floor number already exists in this building",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 5. Delete Floor
**DELETE** `/api/floors/{id}`

Delete a floor (only if it has no rooms).

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Floor ID |

#### Example Request
```bash
curl -X DELETE "http://localhost:3000/api/floors/flr_123"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "flr_123",
    "name": "Basement - Server Room",
    "floorNumber": -1,
    "buildingId": "bld_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T12:00:00.000Z"
  },
  "message": "Floor deleted successfully",
  "timestamp": "2024-01-02T12:00:00.000Z"
}
```

#### Error Response (409 - Has Rooms)
```json
{
  "success": false,
  "error": "Cannot delete floor with 3 room(s). Delete rooms first.",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Floor Number Guidelines

| Floor Number | Type | Examples |
|--------------|------|----------|
| -5 to -1 | Basement/Underground | -2 (Basement Level 2), -1 (Basement Level 1) |
| 0 | Ground Floor | Ground floor, Street level |
| 1 to 50+ | Standard Floors | 1st floor, 5th floor, 25th floor |
| Special Cases | Penthouse, Rooftop | 999 (Rooftop), 100+ (High rises) |

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created |
| 400 | Bad Request - Invalid input or missing buildingId |
| 404 | Not Found - Floor or Building doesn't exist |
| 409 | Conflict - Duplicate floor number or has rooms |
| 500 | Server Error - Internal error |

---

## Usage Examples

### JavaScript/TypeScript with Fetch
```typescript
// Create floor in building
const response = await fetch('/api/floors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: '3rd Floor - Engineering',
    floorNumber: 3,
    buildingId: 'bld_123'
  })
});

const result = await response.json();
if (result.success) {
  console.log('Floor created:', result.data);
}

// List floors in building
const listResponse = await fetch('/api/floors?buildingId=bld_123&page=1&limit=20');
const listResult = await listResponse.json();
console.log('Floors:', listResult.data);
```

### cURL
```bash
# List floors in building
curl "http://localhost:3000/api/floors?buildingId=bld_123"

# Create floor
curl -X POST http://localhost:3000/api/floors \
  -H "Content-Type: application/json" \
  -d '{"name":"Floor 1","floorNumber":1,"buildingId":"bld_123"}'

# Get floor
curl http://localhost:3000/api/floors/flr_123

# Update floor
curl -X PUT http://localhost:3000/api/floors/flr_123 \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Floor Name"}'

# Delete floor
curl -X DELETE http://localhost:3000/api/floors/flr_123
```

---

## Notes

- All timestamps are in UTC
- **buildingId is required** when listing floors (for safety and performance)
- Floor numbers must be unique per building
- Floors cannot be deleted if they have rooms (referential integrity)
- Floor numbers support basements (negative numbers) and high-rises (1000+)
- Negative floor numbers represent basement levels (-1 = Basement Level 1, -2 = Basement Level 2, etc.)
- Pagination limit is capped at 100 items
- Search is case-insensitive
- Rooms are ordered by name within each floor

