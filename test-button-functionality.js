#!/usr/bin/env node
/**
 * Simple test to verify the Ausführen button functionality
 * This simulates the frontend API calls to test the complete flow
 */

const testAppleCompany = async () => {
  console.log('🧪 Testing Apple Company API call...\n');

  try {
    // Test the API endpoint directly
    const response = await fetch('http://localhost:3001/api/company', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company: 'Apple Inc' }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error || response.status}`);
    }

    const data = await response.json();
    
    console.log('✅ API Response received successfully!\n');
    console.log('📊 Company Data:');
    console.log(`   🏢 Company: ${data.company}`);
    console.log(`   🌐 Website: ${data.website || 'N/A'}`);
    console.log(`   📍 Headquarters: ${data.headquarters || 'N/A'}`);
    console.log(`   📞 Phone: ${data.contacts?.phones?.[0] || 'N/A'}`);
    console.log(`   📧 Email: ${data.contacts?.emails?.[0] || 'N/A'}`);
    console.log(`   👤 CEO: ${data.executives?.ceo?.name || 'N/A'}`);
    console.log(`   🤝 Cofounders: ${data.executives?.cofounders?.map(c => c.name).join(', ') || 'N/A'}`);
    
    console.log('\n🎉 Test PASSED - Button functionality should work correctly!');
    console.log('💡 You can now use the "Echter Test (Perplexity)" button in the UI');
    
  } catch (error) {
    console.error('❌ Test FAILED:', error.message);
    console.log('\n🔧 Make sure:');
    console.log('   1. Development server is running (pnpm dev)');
    console.log('   2. PERPLEXITY_API_KEY is set in .env');
    console.log('   3. Network connection is available');
  }
};

// Run the test
testAppleCompany();