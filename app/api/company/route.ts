import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Exec = { name: string; title: string };
type CompanyResult = {
  company: string;
  website?: string;
  headquarters?: string;
  addresses?: string[];
  contacts: {
    contact_page?: string;
    emails: string[];
    phones: string[];
  };
  executives: {
    ceo?: string;
    cofounders: string[];
    others?: Exec[];
  };
  summary?: string;
  sources: string[];
};

function schema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['company', 'contacts', 'executives', 'sources'],
    properties: {
      company: { type: 'string' },
      website: { type: 'string' },
      headquarters: { type: 'string' },
      addresses: { type: 'array', items: { type: 'string' } },
      contacts: {
        type: 'object',
        additionalProperties: false,
        required: ['emails', 'phones'],
        properties: {
          contact_page: { type: 'string' },
          emails: { type: 'array', items: { type: 'string' } },
          phones: { type: 'array', items: { type: 'string' } },
        },
      },
      executives: {
        type: 'object',
        additionalProperties: false,
        required: ['cofounders'],
        properties: {
          ceo: { type: 'string' },
          cofounders: { type: 'array', items: { type: 'string' } },
          others: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'title'],
              properties: { name: { type: 'string' }, title: { type: 'string' } },
            },
          },
        },
      },
      summary: { type: 'string' },
      sources: { type: 'array', items: { type: 'string' } },
    },
  } as const;
}

async function callPerplexity(company: string): Promise<CompanyResult> {
  const apiKey = process.env.PPLX_API_KEY || process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error('Missing PPLX_API_KEY (or PERPLEXITY_API_KEY)');
  }

  const messages = [
    {
      role: 'system',
      content:
        'You are a precise research assistant with web access. '\
        + 'Research the official company website and credible sources. '\
        + 'Return STRICT JSON that matches the provided schema. Include source URLs.'
    },
    {
      role: 'user',
      content:
        `Company: ${company}\n\n` +
        'Task:\n' +
        '- Identify the official website and address/headquarters.\n' +
        '- Find an official contact page and extract emails/phones if available.\n' +
        '- Identify CEO and co-founders; include other key executives if clear.\n' +
        '- Keep results concise and verifiable, with citations.\n' +
        'Output: STRICT JSON only, matching the provided schema.'
    }
  ];

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      temperature: 0,
      return_citations: true,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'company_profile', schema: schema(), strict: true },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Perplexity API ${res.status}: ${text}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  const raw: string = choice?.content ?? '';
  const citations: string[] = choice?.citations ?? data?.citations ?? [];

  let parsed: CompanyResult | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch {}
    }
  }
  if (!parsed) throw new Error('Failed to parse structured output');

  // Normalize minimal fields
  parsed.company ||= company;
  parsed.contacts ||= { emails: [], phones: [] } as any;
  parsed.contacts.emails ||= [];
  parsed.contacts.phones ||= [];
  parsed.executives ||= { cofounders: [] } as any;
  parsed.executives.cofounders ||= [];
  parsed.sources = Array.from(new Set([...(parsed.sources || []), ...citations]));

  return parsed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const company = (body.company || body.name || '').toString().trim();
    if (!company) {
      return NextResponse.json({ error: 'Body must include { "company": "<name>" }' }, { status: 400 });
    }
    const result = await callPerplexity(company);
    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

