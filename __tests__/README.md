# Testing Documentation

This project uses Jest and Supertest for comprehensive API testing of the Next.js App Router endpoints.

## Test Structure

```
__tests__/
├── e2e/           # End-to-end tests with real server setup
├── unit/          # Unit tests with mocked dependencies
├── integration/   # Integration tests with real API calls
└── README.md      # This file
```

## Test Types

### Unit Tests (`/unit/`)
- Test API logic with mocked Perplexity calls
- Fast execution, no external dependencies
- Validate input parsing, error handling, response formatting

### E2E Tests (`/e2e/`)
- Test complete HTTP request/response cycle
- Use real Next.js API routes with test server
- Can run with or without real Perplexity API key

### Integration Tests (`/integration/`)
- Test real Perplexity API integration
- Require valid `PERPLEXITY_API_KEY` environment variable
- Test with real companies like "apple company"
- Longer timeout for network requests

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only E2E tests
npm run test:e2e

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test company.test.ts

# Run integration tests (requires API key)
PERPLEXITY_API_KEY=your-key npm test integration
```

## Environment Setup

1. Copy `.env.test.example` to `.env.test`
2. Fill in your Perplexity API key for integration tests
3. Integration tests are automatically skipped if no API key is provided

## Test Examples

### Basic API Test
```typescript
test('should return 400 for missing company name', async () => {
  const response = await request(`http://localhost:${TEST_PORT}`)
    .post('/api/company')
    .send({});

  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('error');
});
```

### Real Perplexity Integration
```typescript
test('should fetch Apple company information', async () => {
  const response = await request(`http://localhost:${TEST_PORT}`)
    .post('/api/company')
    .send({ company: 'apple company' });

  expect(response.status).toBe(200);
  expect(response.body.company).toMatch(/apple/i);
});
```

## Expected API Response Structure

```json
{
  "company": "Apple Inc.",
  "website": "https://www.apple.com",
  "headquarters": "Cupertino, CA",
  "contacts": {
    "emails": ["info@apple.com"],
    "phones": ["+1-800-APL-CARE"]
  },
  "executives": {
    "ceo": {
      "name": "Tim Cook",
      "email": "tcook@apple.com"
    },
    "cofounders": [
      {
        "name": "Steve Jobs", 
        "email": "steve@apple.com"
      }
    ]
  },
  "sources": ["https://apple.com/about"]
}
```

## Common Issues

1. **Tests timeout**: Increase timeout for integration tests (default 30s)
2. **API rate limits**: Perplexity may rate limit requests during testing
3. **Missing API key**: Integration tests will be skipped automatically
4. **Network issues**: Use `--testTimeout=60000` for slow connections

## Debugging

```bash
# Run with verbose output
npm test -- --verbose

# Run single test with console logs
npm test -- --testNamePattern="apple company" --verbose
```

Console logs in integration tests show the actual API responses for debugging.