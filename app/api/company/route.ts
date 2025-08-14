import { NextRequest, NextResponse } from 'next/server';
import { createPerplexity } from '@ai-sdk/perplexity';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';

const perplexity = createPerplexity({
  apiKey: process.env.PERPLEXITY_API_KEY ?? '',
});

function extractCompanyData(text: string, companyName: string): CompanyResult {
  console.log('Parsing contact info response...');
  
  // Initialize result with minimal required fields
  const result: CompanyResult = {
    company: companyName,
    contacts: { emails: [], phones: [] },
    executives: { cofounders: [] },
    sources: []
  };

  // Helper function to extract content after a label
  const extractAfterLabel = (label: string, defaultValue = ''): string => {
    const regex = new RegExp(`${label}:\\s*(.+?)(?:\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : defaultValue;
  };

  // Helper function to extract section content
  const extractSection = (sectionName: string): string => {
    const regex = new RegExp(`=== ${sectionName} ===([\\s\\S]*?)(?:=== |$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };

  // Extract contact info section (main focus)
  const contactInfoSection = extractSection('CONTACT INFO');
  if (contactInfoSection) {
    const homepage = extractAfterLabel('Homepage', '');
    if (homepage && homepage !== 'Not found') {
      result.homepage = homepage.replace(/^\[|\]$/g, '');
    }

    const contactPage = extractAfterLabel('Contact Page', '');
    if (contactPage && contactPage !== 'Not found') {
      result.contacts.contact_page = contactPage.replace(/^\[|\]$/g, '');
    }
  }


  console.log('Parsed contact result:', result);
  return result;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CompanyResult = {
  company: string;
  homepage?: string;
  contacts: {
    contact_page?: string;
    emails: string[];
    phones: string[];
  };
  executives: {
    cofounders: Array<{
      name: string;
      email?: string;
    }>;
  };
  sources: string[];
};


async function callPerplexity(company: string): Promise<CompanyResult> {
  try {
    const prompt = `Find the homepage and contact page for company: ${company}

Please provide only this information in the exact format shown:

=== CONTACT INFO ===
Homepage: [company's main website URL]
Contact Page: [contact page URL if found]

SEARCH STRATEGY:
1. Find the company's official website/homepage
2. Look for their contact page or contact us section

IMPORTANT: 
- Focus ONLY on homepage and contact page URLs
- Use exact format with === CONTACT INFO === header
- If not found, write "Not found"`;

    const { text, sources } = await generateText({
      model: perplexity('sonar-pro'),
      prompt,
      temperature: 0,
    });

    console.log('Sources:', sources);
    console.log('Raw text response:', text);

    // Extract data from text response using simple parsing
    const parsed = extractCompanyData(text, company);
    
    // Normalize minimal fields
    parsed.company ||= company;
    parsed.contacts ||= { emails: [], phones: [] };
    parsed.contacts.emails ||= [];
    parsed.contacts.phones ||= [];
    parsed.executives ||= { cofounders: [] };
    parsed.executives.cofounders ||= [];
    parsed.sources ||= [];

    // Include raw text for debugging and display
    (parsed as CompanyResult & { raw_text: string }).raw_text = text;

    return parsed;
  } catch (error) {
    throw new Error(`Perplexity API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Zod schema for executive information
const ExecutiveSchema = z.object({
  ceo: z.string().optional().describe('Name of the current CEO'),
  cofounders: z.array(z.string()).optional().describe('Names of the founders/cofounders')
});

type ExecutiveInfo = {
  ceo?: string | null;
  cofounders: string[];
  structured: boolean;
};

async function callPerplexityForExecutives(company: string, country?: string, city?: string): Promise<ExecutiveInfo> {
  try {
    const locationContext = country || city ? ` (located in ${[city, country].filter(Boolean).join(', ')})` : '';
    const prompt = `Find information about the CEO and founders/cofounders of the company: ${company}${locationContext}

Please provide accurate information about:
1. Current CEO name
2. Founders/cofounders names

SEARCH STRATEGY:
1. Look for current leadership information on the company's official website
2. Find founder and cofounder details from reliable sources
3. Verify information is current and accurate

IMPORTANT: 
- Focus on current CEO and original founders/cofounders
- Only include verified names, not job titles
- If not found, leave the field empty`;

    const { object } = await generateObject({
      model: perplexity('sonar-pro'),
      prompt,
      schema: ExecutiveSchema,
      temperature: 0,
    });

    console.log('Executive info response:', object);
    return {
      ceo: object.ceo || null,
      cofounders: object.cofounders || [],
      structured: true
    };
  } catch (error) {
    throw new Error(`Perplexity API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const company = (body.company || body.name || '').toString().trim();
    const enhance = body.enhance || false;
    
    if (!company) {
      return NextResponse.json({ error: 'Body must include { "company": "<name>" }' }, { status: 400 });
    }
    
    if (enhance) {
      // Handle executive enhancement request
      const country = body.country;
      const city = body.city;
      const result = await callPerplexityForExecutives(company, country, city);
      return NextResponse.json(result, { status: 200 });
    } else {
      // Handle normal company lookup
      const result = await callPerplexity(company);
      return NextResponse.json(result, { status: 200 });
    }
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}

