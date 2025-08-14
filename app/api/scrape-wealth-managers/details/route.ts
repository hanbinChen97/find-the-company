import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

async function fetchProfileAttributes(url: string): Promise<{ phone?: string; country?: string; city?: string }> {
  try {
    console.log(`Fetching profile data from: ${url}`);
    const html = await fetchHTML(url);
    
    // Look for the table in the profile section using a more specific selector
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    const result: { phone?: string; country?: string; city?: string } = {};
    
    // Try to find tables and parse them
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableContent = tableMatch[1];
      
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
          const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim().replace(/^:+|:+$/g, '');
          if (cellText) {
            cells.push(cellText);
          }
        }
        
        if (cells.length >= 2) {
          const key = cells[0].toLowerCase().trim();
          const value = cells[1].trim();
          
          console.log(`Found table row: "${key}" = "${value}"`);
          
          if ((key === 'phone' || key === 'telephone' || key === 'tel') && value && !result.phone) {
            result.phone = value;
          } else if (key === 'country' && value && !result.country) {
            result.country = value;
          } else if (key === 'city' && value && !result.city) {
            result.city = value;
          }
        }
      }
    }
    
    // Also try to find data in the profile section using CSS selector approach
    const profileSectionRegex = /<section[^>]*id="swfiProfileSingle"[^>]*>([\s\S]*?)<\/section>/i;
    const profileMatch = html.match(profileSectionRegex);
    
    if (profileMatch) {
      const profileContent = profileMatch[1];
      
      // Look for table-responsive div within the profile section
      const tableResponsiveRegex = /<div[^>]*class="[^"]*table-responsive[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
      const tableResponsiveMatch = profileContent.match(tableResponsiveRegex);
      
      if (tableResponsiveMatch) {
        const tableContent = tableResponsiveMatch[1];
        
        // Extract table rows from this specific section
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let rowMatch;
        
        while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
          const rowContent = rowMatch[1];
          
          // Extract cells
          const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          const cells: string[] = [];
          let cellMatch;
          
          while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim().replace(/^:+|:+$/g, '');
            if (cellText) {
              cells.push(cellText);
            }
          }
          
          if (cells.length >= 2) {
            const key = cells[0].toLowerCase().trim();
            const value = cells[1].trim();
            
            console.log(`Found profile table row: "${key}" = "${value}"`);
            
            if ((key === 'phone' || key === 'telephone' || key === 'tel') && value && !result.phone) {
              result.phone = value;
            } else if (key === 'country' && value && !result.country) {
              result.country = value;
            } else if (key === 'city' && value && !result.city) {
              result.city = value;
            }
          }
        }
      }
    }
    
    console.log(`Extracted profile data:`, result);
    return result;
  } catch (error) {
    console.error(`Error fetching profile attributes for ${url}:`, error);
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url } = body;
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    console.log(`Fetching profile details for: ${url}`);
    
    const attributes = await fetchProfileAttributes(url);
    
    return NextResponse.json(attributes, { status: 200 });
    
  } catch (error) {
    console.error('Profile details fetch error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch profile details' 
    }, { status: 500 });
  }
}