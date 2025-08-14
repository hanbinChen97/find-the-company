import { describe, test, expect } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/company/route';

describe('Perplexity Integration Tests', () => {
  // These tests require a real Perplexity API key
  const skipIfNoApiKey = process.env.PERPLEXITY_API_KEY ? test : test.skip;

  describe('Real Perplexity API Calls', () => {
    skipIfNoApiKey('should successfully fetch Apple company information', async () => {
      const request = new NextRequest('http://localhost:3000/api/company', {
        method: 'POST',
        body: JSON.stringify({ company: 'apple company' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      console.log('Apple Company API Response:', JSON.stringify(data, null, 2));

      expect(response.status).toBe(200);
      
      // Validate basic structure
      expect(data).toHaveProperty('company');
      expect(data).toHaveProperty('contacts');
      expect(data).toHaveProperty('executives');
      expect(data).toHaveProperty('sources');

      // Company name should be normalized
      expect(typeof data.company).toBe('string');
      expect(data.company.length).toBeGreaterThan(0);

      // Contacts validation
      expect(data.contacts).toHaveProperty('emails');
      expect(data.contacts).toHaveProperty('phones');
      expect(Array.isArray(data.contacts.emails)).toBe(true);
      expect(Array.isArray(data.contacts.phones)).toBe(true);

      // Executive validation
      expect(data.executives).toHaveProperty('cofounders');
      expect(Array.isArray(data.executives.cofounders)).toBe(true);

      // CEO validation (if present)
      if (data.executives.ceo) {
        expect(typeof data.executives.ceo).toBe('object');
        expect(data.executives.ceo).toHaveProperty('name');
        expect(typeof data.executives.ceo.name).toBe('string');
        expect(data.executives.ceo.name.length).toBeGreaterThan(0);

        // Email validation (if present)
        if (data.executives.ceo.email) {
          expect(typeof data.executives.ceo.email).toBe('string');
          expect(data.executives.ceo.email).toMatch(/\S+@\S+\.\S+/); // Basic email format
        }
      }

      // Cofounders validation
      data.executives.cofounders.forEach((cofounder: any, index: number) => {
        expect(typeof cofounder).toBe('object');
        expect(cofounder).toHaveProperty('name');
        expect(typeof cofounder.name).toBe('string');
        expect(cofounder.name.length).toBeGreaterThan(0);

        // Email validation (if present)
        if (cofounder.email) {
          expect(typeof cofounder.email).toBe('string');
          expect(cofounder.email).toMatch(/\S+@\S+\.\S+/); // Basic email format
        }

        console.log(`Cofounder ${index + 1}:`, cofounder);
      });

      // Sources validation
      expect(Array.isArray(data.sources)).toBe(true);

      // Validate that we got meaningful data for Apple
      const companyLower = data.company.toLowerCase();
      expect(companyLower).toMatch(/apple/i);

      // Website validation (if present)
      if (data.website) {
        expect(typeof data.website).toBe('string');
        expect(data.website).toMatch(/^https?:\/\//);
      }

      // Address validation (if present)
      if (data.headquarters) {
        expect(typeof data.headquarters).toBe('string');
        expect(data.headquarters.length).toBeGreaterThan(0);
      }

    }, 30000); // 30 second timeout

    skipIfNoApiKey('should handle different company name formats', async () => {
      const testCases = [
        'Apple Inc',
        'APPLE',
        'apple inc.',
        'Apple Computer',
      ];

      for (const companyName of testCases) {
        const request = new NextRequest('http://localhost:3000/api/company', {
          method: 'POST',
          body: JSON.stringify({ company: companyName }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        const data = await response.json();

        console.log(`Response for "${companyName}":`, data.company);

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('company');
        expect(typeof data.company).toBe('string');
        expect(data.company.length).toBeGreaterThan(0);
      }
    }, 60000); // 60 second timeout for multiple requests

    skipIfNoApiKey('should return valid data structure for any successful response', async () => {
      const request = new NextRequest('http://localhost:3000/api/company', {
        method: 'POST',
        body: JSON.stringify({ company: 'apple company' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      if (response.status === 200) {
        // Required fields validation
        const requiredFields = ['company', 'contacts', 'executives', 'sources'];
        requiredFields.forEach(field => {
          expect(data).toHaveProperty(field);
        });

        // Nested required fields validation
        expect(data.contacts).toHaveProperty('emails');
        expect(data.contacts).toHaveProperty('phones');
        expect(data.executives).toHaveProperty('cofounders');

        // Type validation
        expect(typeof data.company).toBe('string');
        expect(Array.isArray(data.contacts.emails)).toBe(true);
        expect(Array.isArray(data.contacts.phones)).toBe(true);
        expect(Array.isArray(data.executives.cofounders)).toBe(true);
        expect(Array.isArray(data.sources)).toBe(true);
      }
    }, 30000);
  });

  describe('Error Handling with Real API', () => {
    skipIfNoApiKey('should handle very obscure company names gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/company', {
        method: 'POST',
        body: JSON.stringify({ company: 'XYZ Nonexistent Company 12345' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      
      // Should either succeed with minimal data or fail gracefully
      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('company');
        expect(data).toHaveProperty('contacts');
        expect(data).toHaveProperty('executives');
      } else {
        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(response.status).toBe(500);
      }
    }, 30000);
  });

  describe('API without Key', () => {
    test('should handle missing API key gracefully', async () => {
      // Temporarily remove API key
      const originalApiKey = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;

      const request = new NextRequest('http://localhost:3000/api/company', {
        method: 'POST',
        body: JSON.stringify({ company: 'test company' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Perplexity API error');

      // Restore API key
      if (originalApiKey) {
        process.env.PERPLEXITY_API_KEY = originalApiKey;
      }
    });
  });
});