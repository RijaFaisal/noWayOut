const SupabaseAgent = require('./mySupAgent');
const agent = new SupabaseAgent();
async function testGetImageUrl(fileName) {
  try {
    const url = await agent.getReceiptUrl(fileName);
    console.log(`Public URL for ${fileName}:`, url);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
const testFileName = 'refund_req0.png'; 
console.log('Testing image URL retrieval for:', testFileName);
testGetImageUrl(testFileName);
