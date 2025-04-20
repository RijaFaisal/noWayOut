const SupabaseAgent = require('./mySupAgent');

// Initialize the agent
const agent = new SupabaseAgent();

// Function to test getting the image URL
async function testGetImageUrl(fileName) {
  try {
    const url = await agent.getReceiptUrl(fileName);
    console.log(`Public URL for ${fileName}:`, url);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Test with a sample receipt
const testFileName = 'refund_req0.png'; // Using the actual filename format in your bucket
console.log('Testing image URL retrieval for:', testFileName);
testGetImageUrl(testFileName);
