# Buildings API Documentation

Complete API documentation for managing buildings in InfraScope.

## Base URL
```
http://localhost:3000/api/buildings
```

---

## Endpoints

### 1. List Buildings
**GET** `/api/buildings`

Retrieve all buildings with pagination, filtering, and search support.

#### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number for pagination |
| limit | number | 10 | Items per page (max 100) |
| organizationId | string | - | Filter by organization ID |
| city | string | - | Filter by city (partial match) |
| country | string | - | Filter by country (partial match) |
| search | string | - | Search by name, address, city, or country |

#### Example Requests
```bash
# List all buildings
curl -X GET "http://localhost:3000/api/buildings"

# List buildings in specific organization
curl -X GET "http://localhost:3000/api/buildings?organizationId=org_123"

# Search buildings in New York
curl -X GET "http://localhost:3000/api/buildings?search=New+York"

# Filter by city and country
curl -X GET "http://localhost:3000/api/buildings?city=New+York&country=USA"

# Pagination
curl -X GET "http://localhost:3000/api/buildings?page=2&limit=20"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "bld_123",
      "name": "New York Data Center",
      "address": "123 Tech Street, Manhattan",
      "city": "New York",
      "country": "USA",
      "postalCode": "10001",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "organizationId": "org_123",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "organization": {
        "id": "org_123",
        "name": "TechCorp Inc",
        "code": "TECHCORP"
      },
      "floors": [
        {
          "id": "flr_123",
          "name": "Floor 1",
          "floorNumber": 1
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
  "error": "Failed to fetch buildings",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 2. Create Building
**POST** `/api/buildings`

Create a new building in an organization.

#### Request Body
```json
{
  "name": "New Building",
  "address": "123 Tech Avenue",
  "city": "San Francisco",
  "country": "USA",
  "organizationId": "org_123",
  "postalCode": "94105",
  "latitude": 37.7749,
  "longitude": -122.4194
}
```

#### Validation Rules
- **name**: Required, 2-255 characters, unique per organization
- **address**: Required, 5-500 characters
- **city**: Required, any length
- **country**: Required, any length
- **organizationId**: Required, must exist in database
- **postalCode**: Optional
- **latitude**: Optional, must be -90 to 90
- **longitude**: Optional, must be -180 to 180

#### Example Request
```bash
curl -X POST "http://localhost:3000/api/buildings" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "San Francisco HQ",
    "address": "123 Tech Street, San Francisco",
    "city": "San Francisco",
    "country": "USA",
    "organizationId": "org_123",
    "postalCode": "94105",
    "latitude": 37.7749,
    "longitude": -122.4194
  }'
```

#### Success Response (201)
```json
{
  "success": true,
  "data": {
    "id": "bld_456",
    "name": "San Francisco HQ",
    "address": "123 Tech Street, San Francisco",
    "city": "San Francisco",
    "country": "USA",
    "postalCode": "94105",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "organizationId": "org_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "organization": {
      "id": "org_123",
      "name": "TechCorp Inc",
      "code": "TECHCORP"
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
  "error": "name, address, city, country, and organizationId are required",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Invalid Coordinates (400)**
```json
{
  "success": false,
  "error": "Latitude must be between -90 and 90",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Organization Not Found (404)**
```json
{
  "success": false,
  "error": "Organization with ID org_invalid not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Duplicate Building Name (409)**
```json
{
  "success": false,
  "error": "A building with this name already exists in this organization",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 3. Get Building
**GET** `/api/buildings/{id}`

Retrieve a specific building with all related data.

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Building ID |

#### Example Request
```bash
curl -X GET "http://localhost:3000/api/buildings/bld_123"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "bld_123",
    "name": "New York Data Center",
    "address": "123 Tech Street, Manhattan",
    "city": "New York",
    "country": "USA",
    "postalCode": "10001",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "organizationId": "org_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "organization": {
      "id": "org_123",
      "name": "TechCorp Inc",
      "code": "TECHCORP"
    },
    "floors": [
      {
        "id": "flr_123",
        "name": "Floor 1",
        "floorNumber": 1,
        "rooms": [...]
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
  "error": "Building not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 4. Update Building
**PUT** `/api/buildings/{id}`

Update an existing building.

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Building ID |

#### Request Body
```json
{
  "name": "Updated Name",
  "address": "New Address",
  "city": "New City",
  "country": "New Country",
  "postalCode": "12345",
  "latitude": 0.0,
  "longitude": 0.0
}
```

**Note**: All fields are optional. At least one field must be provided.

#### Example Request
```bash
curl -X PUT "http://localhost:3000/api/buildings/bld_123" \
  -H "Content-Type: application/json" \
  -d '{
    "city": "New York City",
    "latitude": 40.7580,
    "longitude": -73.9855
  }'
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "bld_123",
    "name": "New York Data Center",
    "address": "123 Tech Street, Manhattan",
    "city": "New York City",
    "country": "USA",
    "postalCode": "10001",
    "latitude": 40.7580,
    "longitude": -73.9855,
    "organizationId": "org_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T12:00:00.000Z",
    "organization": {
      "id": "org_123",
      "name": "TechCorp Inc",
      "code": "TECHCORP"
    },
    "floors": [...]
  },
  "message": "Building updated successfully",
  "timestamp": "2024-01-02T12:00:00.000Z"
}
```

#### Error Response (404)
```json
{
  "success": false,
  "error": "Building not found",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 5. Delete Building
**DELETE** `/api/buildings/{id}`

Delete a building (only if it has no floors).

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Building ID |

#### Example Request
```bash
curl -X DELETE "http://localhost:3000/api/buildings/bld_123"
```

#### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "bld_123",
    "name": "New York Data Center",
    "address": "123 Tech Street, Manhattan",
    "city": "New York",
    "country": "USA",
    "postalCode": "10001",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "organizationId": "org_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  },
  "message": "Building deleted successfully",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Error Response (409 - Has Floors)
```json
{
  "success": false,
  "error": "Cannot delete building with 5 floor(s). Delete floors first.",
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
// Create building
const response = await fetch('/api/buildings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Los Angeles Office',
    address: '456 Tech Road, Los Angeles',
    city: 'Los Angeles',
    country: 'USA',
    organizationId: 'org_123',
    latitude: 34.0522,
    longitude: -118.2437
  })
});

const result = await response.json();
if (result.success) {
  console.log('Building created:', result.data);
}
```

### cURL
```bash
# List buildings in organization
curl http://localhost:3000/api/buildings?organizationId=org_123

# Create building
curl -X POST http://localhost:3000/api/buildings \
  -H "Content-Type: application/json" \
  -d '{"name":"New Building","address":"123 St","city":"NYC","country":"USA","organizationId":"org_123"}'

# Get building
curl http://localhost:3000/api/buildings/bld_123

# Update building
curl -X PUT http://localhost:3000/api/buildings/bld_123 \
  -H "Content-Type: application/json" \
  -d '{"city":"Los Angeles"}'

# Delete building
curl -X DELETE http://localhost:3000/api/buildings/bld_123
```

---

## Notes

- All timestamps are in UTC
- Building names must be unique within an organization
- Buildings cannot be deleted if they have floors (referential integrity)
- Coordinates must be valid (latitude: -90 to 90, longitude: -180 to 180)
- Pagination limit is capped at 100 items
- Search is case-insensitive
- Floors are ordered by floor number in ascending order

