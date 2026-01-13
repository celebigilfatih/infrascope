# Organizations API Documentation

Complete API documentation for managing organizations in InfraScope.

## Base URL
```
http://localhost:3000/api/organizations
```

---

## Endpoints

### 1. List Organizations
**GET** `/api/organizations`

Retrieve all organizations with pagination and search support.

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number for pagination |
| limit | number | 10 | Items per page (max 100) |
| search | string | - | Search by name, code, or description |

#### Example Request
```bash
curl -X GET "http://localhost:3000/api/organizations?page=1&limit=10&search=tech"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "org_123",
      "name": "TechCorp Inc.",
      "code": "TECHCORP",
      "description": "Enterprise IT Infrastructure",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "buildings": [
        {
          "id": "bld_123",
          "name": "New York Data Center",
          "city": "New York",
          "country": "USA"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "hasMore": false,
    "totalPages": 1
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Response (500)
```json
{
  "success": false,
  "error": "Failed to fetch organizations",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 2. Create Organization
**POST** `/api/organizations`

Create a new organization.

#### Request Body
```json
{
  "name": "New Organization",
  "code": "NEW_ORG",
  "description": "Optional description"
}
```

#### Validation Rules
- **name**: Required, 2-255 characters, must be unique
- **code**: Required, 2-50 characters, must be unique, auto-converted to uppercase
- **description**: Optional

#### Example Request
```bash
curl -X POST "http://localhost:3000/api/organizations" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Global Tech Corp",
    "code": "GTC",
    "description": "Global technology company"
  }'
```

#### Success Response (201)
```json
{
  "success": true,
  "data": {
    "id": "org_456",
    "name": "Global Tech Corp",
    "code": "GTC",
    "description": "Global technology company",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Responses

**Missing Required Fields (400)**
```json
{
  "success": false,
  "error": "Name and code are required",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Duplicate Name/Code (409)**
```json
{
  "success": false,
  "error": "Organization name already exists",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 3. Get Organization
**GET** `/api/organizations/{id}`

Retrieve a specific organization with all related data.

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Organization ID |

#### Example Request
```bash
curl -X GET "http://localhost:3000/api/organizations/org_123"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "org_123",
    "name": "TechCorp Inc.",
    "code": "TECHCORP",
    "description": "Enterprise IT Infrastructure",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "buildings": [
      {
        "id": "bld_123",
        "name": "New York Data Center",
        "city": "New York",
        "country": "USA",
        "floors": [...]
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
  "error": "Organization not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 4. Update Organization
**PUT** `/api/organizations/{id}`

Update an existing organization.

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Organization ID |

#### Request Body
```json
{
  "name": "Updated Name",
  "code": "NEW_CODE",
  "description": "Updated description"
}
```

**Note**: All fields are optional. At least one field must be provided.

#### Example Request
```bash
curl -X PUT "http://localhost:3000/api/organizations/org_123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechCorp Global",
    "description": "Updated description"
  }'
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "org_123",
    "name": "TechCorp Global",
    "code": "TECHCORP",
    "description": "Updated description",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z",
    "buildings": [...]
  },
  "message": "Organization updated successfully",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Error Response (404)
```json
{
  "success": false,
  "error": "Organization not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 5. Delete Organization
**DELETE** `/api/organizations/{id}`

Delete an organization (only if it has no buildings).

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Organization ID |

#### Example Request
```bash
curl -X DELETE "http://localhost:3000/api/organizations/org_123"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "org_123",
    "name": "TechCorp Inc.",
    "code": "TECHCORP",
    "description": "Enterprise IT Infrastructure",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  },
  "message": "Organization deleted successfully",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Error Response (409 - Has Buildings)
```json
{
  "success": false,
  "error": "Cannot delete organization with 3 building(s). Delete buildings first.",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created |
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Duplicate or constraint violation |
| 500 | Server Error - Internal error |

---

## Usage Examples

### JavaScript/TypeScript with Fetch
```typescript
// Create organization
const response = await fetch('/api/organizations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Acme Corp',
    code: 'ACME',
    description: 'Global company'
  })
});

const result = await response.json();
if (result.success) {
  console.log('Organization created:', result.data);
}
```

### cURL
```bash
# List organizations
curl http://localhost:3000/api/organizations

# Create organization
curl -X POST http://localhost:3000/api/organizations \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme","code":"ACME","description":"Global"}'

# Get organization
curl http://localhost:3000/api/organizations/org_123

# Update organization
curl -X PUT http://localhost:3000/api/organizations/org_123 \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Inc"}'

# Delete organization
curl -X DELETE http://localhost:3000/api/organizations/org_123
```

---

## Notes

- All timestamps are in UTC
- Codes are automatically converted to uppercase
- Duplicate names or codes are rejected with 409 Conflict
- Organizations cannot be deleted if they have buildings
- Pagination limit is capped at 100 items
- Search is case-insensitive

