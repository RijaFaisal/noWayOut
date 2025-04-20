/**
 * Simple script to test fetching an image from a URL
 */
const https = require('https');

// Test URL fetching with HTTPS
async function testFetch(url) {
  try {
    console.log(`Testing URL: ${url}`);
    
    // Use a direct HTTP request
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        console.log(`Response status: ${response.statusCode} ${response.statusMessage}`);
        
        if (response.statusCode !== 200) {
          console.log('Fetch failed with non-200 status code');
          return;
        }
        
        console.log(`Content type: ${response.headers['content-type']}`);
        
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          console.log(`Data received: ${buffer.length} bytes`);
          const base64 = buffer.toString('base64').substring(0, 50) + '...';
          console.log(`Base64 preview: ${base64}`);
          console.log('Fetch successful!');
          resolve();
        });
      }).on('error', (err) => {
        console.error('Error during HTTP request:', err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error during fetch:', error.message);
  }
}

// Get URL from command line args or use default test URL with double slash
const urlToTest = process.argv[2] || 'https://qtiefgfvybmhmujmcerl.supabase.co/storage/v1/object/public/receipts.nowayout//refund_req0.png';

// Run the test
testFetch(urlToTest); 