import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CompanyData = {
  company_name: string;
  url: string;
  phone?: string;
  country?: string;
  city?: string;
};

const BASE_URL = "https://dev.swfinstitute.org";
const TARGET_URL = "https://dev.swfinstitute.org/profiles/wealth-manager/europe";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchHTML(url: string): Promise<string> {
  const response = await fetch(url, { 
    headers: HEADERS,
    next: { revalidate: 3600 } // Cache for 1 hour
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.text();
}

function parseCompanyUrls(html: string): Array<{ company_name: string; url: string }> {
  const companies: Array<{ company_name: string; url: string }> = [];
  const seen = new Set<string>();
  
  // Simple regex-based parsing (equivalent to BeautifulSoup logic)
  const listGroupRegex = /<div[^>]*class="[^"]*list-group list-group-wrap[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const listGroupMatch = html.match(listGroupRegex);
  
  if (!listGroupMatch) {
    return companies;
  }
  
  const listGroupContent = listGroupMatch[1];
  
  // Find all anchor tags with href containing /profile/
  const anchorRegex = /<a[^>]+href="([^"]*\/profile\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  
  while ((match = anchorRegex.exec(listGroupContent)) !== null) {
    const href = match[1];
    const anchorContent = match[2];
    
    // Extract company name from strong.list-group-item-title or fallback to anchor text
    const titleRegex = /<strong[^>]*class="[^"]*list-group-item-title[^"]*"[^>]*>(.*?)<\/strong>/i;
    const titleMatch = anchorContent.match(titleRegex);
    
    let companyName = '';
    if (titleMatch) {
      companyName = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    } else {
      // Fallback to anchor text content
      companyName = anchorContent.replace(/<[^>]*>/g, '').trim();
    }
    
    if (!companyName) continue;
    
    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    
    if (fullUrl && !seen.has(fullUrl)) {
      seen.add(fullUrl);
      companies.push({
        company_name: companyName,
        url: fullUrl
      });
    }
  }
  
  return companies;
}

async function fetchProfileAttributes(url: string): Promise<{ phone?: string; country?: string; city?: string }> {
  try {
    const html = await fetchHTML(url);
    
    // Look for the table in the profile section
    const tableRegex = /<div[^>]*class="[^"]*table-responsive[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
    const tableMatch = html.match(tableRegex);
    
    if (!tableMatch) {
      return {};
    }
    
    const tableContent = tableMatch[1];
    const result: { phone?: string; country?: string; city?: string } = {};
    
    // Extract table rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const rowContent = rowMatch[1];
      
      // Extract cells
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim().replace(':', '');
        cells.push(cellText);
      }
      
      if (cells.length === 2) {
        const key = cells[0].toLowerCase();
        const value = cells[1];
        
        if (key === 'phone' && value) {
          result.phone = value;
        } else if (key === 'country' && value) {
          result.country = value;
        } else if (key === 'city' && value) {
          result.city = value;
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error(`Error fetching profile attributes for ${url}:`, error);
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { fetchDetails = false, limit = 5 } = body;
    
    console.log('Fetching company list from:', TARGET_URL);
    
    // Fetch the main page
    const html = await fetchHTML(TARGET_URL);
    
    // Parse company URLs
    const companies = parseCompanyUrls(html);
    console.log(`Found ${companies.length} companies`);
    
    if (!fetchDetails) {
      // Return just the company list
      return NextResponse.json({ 
        companies: companies.slice(0, Math.min(limit, companies.length)),
        total: companies.length 
      });
    }
    
    // Fetch detailed attributes for each company (limited by user input)
    const detailedCompanies: CompanyData[] = [];
    const actualLimit = Math.min(limit, companies.length);
    
    for (let i = 0; i < actualLimit; i++) {
      const company = companies[i];
      console.log(`Fetching details for: ${company.company_name}`);
      
      const attributes = await fetchProfileAttributes(company.url);
      
      detailedCompanies.push({
        ...company,
        ...attributes
      });
      
      // Add delay to be respectful to the server
      if (i < actualLimit - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return NextResponse.json({ 
      companies: detailedCompanies,
      total: companies.length 
    });
    
  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Scraping failed' 
    }, { status: 500 });
  }
}