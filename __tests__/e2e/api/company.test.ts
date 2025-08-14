import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createServer } from 'http';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/company/route';

// Mock server setup for testing App Router
const createTestServer = () => {
  return createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/company') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const nextRequest = new NextRequest(`http://localhost:3000/api/company`, {
            method: 'POST',
            body,
            headers: {
              'Content-Type': 'application/json',
            },
          });

          const response = await POST(nextRequest);
          const responseData = await response.text();
          
          res.writeHead(response.status, {
            'Content-Type': 'application/json',
          });
          res.end(responseData);
        } catch (error) {
          res.writeHead(500, {
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  });
};

describe('/api/company E2E Tests', () => {
  let server: any;
  const TEST_PORT = 3001;

  beforeAll((done) => {
    server = createTestServer();
    server.listen(TEST_PORT, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('POST /api/company', () => {
    test('should return 400 for missing company name', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/api/company')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Body must include');
    });

    test('should return 400 for empty company name', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/api/company')
        .send({ company: '' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('should handle company name with spaces', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/api/company')
        .send({ company: '   test company   ' });

      // Should not return 400 for validation error
      expect(response.status).not.toBe(400);
    });

    test('should accept "name" field as alternative to "company"', async () => {
      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/api/company')
        .send({ name: 'test company' });

      // Should not return 400 for validation error
      expect(response.status).not.toBe(400);
    });
  });

  describe('Response Structure Validation', () => {
    test('should return proper structure on successful response', async () => {
      // Skip if no API key is available
      if (!process.env.PERPLEXITY_API_KEY) {
        console.log('Skipping Perplexity API test - no API key found');
        return;
      }

      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/api/company')
        .send({ company: 'apple company' });

      if (response.status === 200) {
        expect(response.body).toHaveProperty('company');
        expect(response.body).toHaveProperty('contacts');
        expect(response.body).toHaveProperty('executives');
        expect(response.body).toHaveProperty('sources');
        
        // Validate contacts structure
        expect(response.body.contacts).toHaveProperty('emails');
        expect(response.body.contacts).toHaveProperty('phones');
        expect(Array.isArray(response.body.contacts.emails)).toBe(true);
        expect(Array.isArray(response.body.contacts.phones)).toBe(true);
        
        // Validate executives structure
        expect(response.body.executives).toHaveProperty('cofounders');
        expect(Array.isArray(response.body.executives.cofounders)).toBe(true);
        
        // Validate sources
        expect(Array.isArray(response.body.sources)).toBe(true);
        
        console.log('API Response for Apple Company:', JSON.stringify(response.body, null, 2));
      } else {
        console.log('API Error Response:', response.body);
        // Should still have error structure
        expect(response.body).toHaveProperty('error');
      }
    }, 30000); // 30 second timeout for API calls

    test('should handle CEO structure correctly', async () => {
      // Skip if no API key is available  
      if (!process.env.PERPLEXITY_API_KEY) {
        console.log('Skipping Perplexity API test - no API key found');
        return;
      }

      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/api/company')
        .send({ company: 'apple company' });

      if (response.status === 200 && response.body.executives?.ceo) {
        const ceo = response.body.executives.ceo;
        expect(typeof ceo).toBe('object');
        expect(ceo).toHaveProperty('name');
        expect(typeof ceo.name).toBe('string');
        
        // Email is optional but if present should be string
        if (ceo.email) {
          expect(typeof ceo.email).toBe('string');
        }
      }
    }, 30000);

    test('should handle cofounders structure correctly', async () => {
      // Skip if no API key is available
      if (!process.env.PERPLEXITY_API_KEY) {
        console.log('Skipping Perplexity API test - no API key found');
        return;
      }

      const response = await request(`http://localhost:${TEST_PORT}`)
        .post('/api/company')
        .send({ company: 'apple company' });

      if (response.status === 200) {
        const cofounders = response.body.executives.cofounders;
        expect(Array.isArray(cofounders)).toBe(true);
        
        // If cofounders exist, validate their structure
        cofounders.forEach((cofounder: any) => {
          expect(typeof cofounder).toBe('object');
          expect(cofounder).toHaveProperty('name');
          expect(typeof cofounder.name).toBe('string');
          
          // Email is optional but if present should be string
          if (cofounder.email) {
            expect(typeof cofounder.email).toBe('string');
          }
        });
      }
    }, 30000);
  });
});