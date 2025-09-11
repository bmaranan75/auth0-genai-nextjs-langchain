# Add to Cart API

This document describes the Add to Cart API endpoint that allows authenticated users to add items from a predefined catalog to their shopping cart.

## Product Catalog

The API includes a backend catalog of **20 products** with the following categories:

- Clothing (T-Shirts, Jeans, Sweaters)
- Footwear (Sneakers, Boots)
- Electronics (Headphones, Laptops, Smartphones)
- Home & Kitchen (Coffee Makers, Blenders)
- Sports & Fitness (Yoga Mats, Dumbbells)
- Books (Novels, Cookbooks)
- Travel (Backpacks, Suitcases)
- Accessories (Sunglasses, Wallets)
- Beauty (Perfumes)

Each product has:

- **code**: Unique identifier (e.g., "TS001", "JN002")
- **name**: Product name
- **price**: Product price
- **description**: Product description
- **category**: Product category
- **imageUrl**: Product image URL
- **inStock**: Availability status

## Endpoints

### Add Item to Cart

```
POST /api/add-to-cart
```

### Browse Product Catalog

```
GET /api/catalog
```

## Authentication

The Add to Cart API is protected by the **standard OpenID scope** (`openid`). The catalog browsing API is public and does not require authentication.

### Authorization Header (for Add to Cart)

```
Authorization: Bearer <access_token>
```

## Add to Cart Request Format

### Content-Type

```
Content-Type: application/json
```

### Request Body (Simplified)

```json
{
  "productCode": "TS001", // Optional: Product code
  "productName": "Cotton T-Shirt", // Optional: Product name (full or partial)
  "quantity": 2 // Optional: Number of items (default: 1)
}
```

### Required Fields

- **Either** `productCode` OR `productName` is required
- The system will search the catalog and auto-populate all product details

### Field Details

- `productCode`: Exact product code from catalog (e.g., "TS001", "JN002")
- `productName`: Full or partial product name (e.g., "T-Shirt", "Jeans", "Coffee")
- `quantity`: Number of items to add (must be > 0, defaults to 1)

## Catalog Browsing

### Browse All Products

```
GET /api/catalog
```

### Search Products

```
GET /api/catalog?search=shirt
```

### Filter by Category

```
GET /api/catalog?category=Electronics
```

### Pagination

```
GET /api/catalog?limit=10&offset=0
```

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Item added to cart successfully",
  "cartItem": {
    "id": "cart_item_1693834567890",
    "userId": "auth0|user123",
    "productId": "TS001",
    "productName": "Classic Cotton T-Shirt",
    "price": 24.99,
    "quantity": 2,
    "totalPrice": 49.98,
    "addedAt": "2025-09-07T12:00:00.000Z",
    "imageUrl": "https://example.com/images/tshirt-classic.jpg",
    "description": "Comfortable 100% cotton t-shirt in various colors",
    "category": "Clothing"
  },
  "totalItems": 2
}
```

### Catalog Response (200 OK)

```json
{
  "success": true,
  "products": [
    {
      "code": "TS001",
      "name": "Classic Cotton T-Shirt",
      "price": 24.99,
      "description": "Comfortable 100% cotton t-shirt in various colors",
      "category": "Clothing",
      "imageUrl": "https://example.com/images/tshirt-classic.jpg",
      "inStock": true
    }
  ],
  "pagination": {
    "total": 20,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  },
  "categories": ["Clothing", "Electronics", "Home & Kitchen", "..."],
  "filters": {
    "category": null,
    "search": null
  }
}
```

### Error Responses

#### 401 Unauthorized

```json
{
  "error": "Missing or invalid authorization header"
}
```

#### 403 Forbidden

```json
{
  "error": "Missing required openid scope"
}
```

#### 400 Bad Request

```json
{
  "error": "Either productCode or productName is required"
}
```

```json
{
  "error": "quantity must be greater than 0"
}
```

```json
{
  "error": "Invalid JSON in request body"
}
```

#### 404 Not Found

```json
{
  "error": "Product not found: INVALID_CODE"
}
```

```json
{
  "error": "Product is currently out of stock: Product Name"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Internal server error"
}
```

## Health Check

You can check if the API is accessible using a GET request:

```
GET /api/add-to-cart
```

Response:

```json
{
  "status": "ok",
  "message": "Add to cart API is accessible",
  "timestamp": "2025-09-07T12:00:00.000Z",
  "requiredScope": "openid"
}
```

## Example Usage

### Using fetch API

```javascript
// First, browse the catalog to see available products
const browseCatalog = async () => {
  const response = await fetch('/api/catalog?search=shirt&limit=5');
  const catalog = await response.json();
  console.log('Available products:', catalog.products);
};

// Add item to cart using product code
const addToCartByCode = async accessToken => {
  try {
    const response = await fetch('/api/add-to-cart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productCode: 'TS001', // Classic Cotton T-Shirt
        quantity: 2,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      console.log('Item added to cart:', result);
    } else {
      console.error('Failed to add item:', result.error);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
};

// Add item to cart using product name
const addToCartByName = async accessToken => {
  try {
    const response = await fetch('/api/add-to-cart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        productName: 'Jeans', // Will match "Slim Fit Jeans"
        quantity: 1,
      }),
    });

    const result = await response.json();
    console.log('Result:', result);
  } catch (error) {
    console.error('Request failed:', error);
  }
};
```

### Using curl

```bash
# Browse catalog
curl http://localhost:3000/api/catalog

# Search for products
curl "http://localhost:3000/api/catalog?search=electronics&limit=10"

# Add item to cart by product code
curl -X POST http://localhost:3000/api/add-to-cart \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productCode": "TS001",
    "quantity": 2
  }'

# Add item to cart by product name
curl -X POST http://localhost:3000/api/add-to-cart \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productName": "Cotton T-Shirt",
    "quantity": 1
  }'
```

## LangChain Tool Integration

This API is available through two LangChain tools for use with AI agents:

### 1. Browse Catalog Tool (`browse_catalog`)

Helps users discover products before adding them to cart.

Example tool usage:

```json
{}  // Get all products
{"search": "shirt"}  // Search for shirts
{"category": "Electronics"}  // Get electronics
```

### 2. Add to Cart Tool (`add_to_cart`)

Adds items to cart using simplified input.

Example tool usage:

```json
{"productCode": "TS001", "quantity": 2}
{"productName": "Cotton T-Shirt", "quantity": 1}
```

## Available Products (Sample)

| Code  | Name                   | Price    | Category    | In Stock |
| ----- | ---------------------- | -------- | ----------- | -------- |
| TS001 | Classic Cotton T-Shirt | $24.99   | Clothing    | ✅       |
| JN002 | Slim Fit Jeans         | $79.99   | Clothing    | ✅       |
| SW003 | Cozy Wool Sweater      | $89.99   | Clothing    | ✅       |
| SN004 | Running Sneakers       | $129.99  | Footwear    | ✅       |
| BT005 | Leather Boots          | $199.99  | Footwear    | ✅       |
| HD006 | Wireless Headphones    | $149.99  | Electronics | ✅       |
| PH007 | Smartphone Case        | $29.99   | Electronics | ✅       |
| LT008 | Gaming Laptop          | $1299.99 | Electronics | ✅       |
| ...   | ... (12 more products) | ...      | ...         | ...      |

## Security Considerations

1. **Token Validation**: All requests are validated against Auth0's JWKS endpoint
2. **Scope Requirements**: Only users with the `openid` scope can access this API
3. **Input Validation**: All input is validated for required fields and proper types
4. **Error Handling**: Detailed error messages help with debugging while maintaining security

## Testing

A test script is available at `test-add-to-cart.js` that demonstrates:

- Health check functionality
- Successful cart item addition
- Authentication error handling
- Input validation error handling

To run tests:

1. Start the development server: `npm run dev`
2. Run the test script: `node test-add-to-cart.js`

## Environment Variables

Required environment variables:

- `AUTH0_ISSUER_BASE_URL`: Your Auth0 domain URL
- `NEXTAUTH_URL`: Your application URL (for internal API calls)

## Implementation Notes

- Cart items are currently returned as mock data
- In a production environment, integrate with a real database
- User identification is extracted from the JWT token's `sub` claim
- The API follows RESTful conventions and returns appropriate HTTP status codes
