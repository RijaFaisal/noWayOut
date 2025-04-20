const SupabaseAgent = require('./mySupAgent');
async function main() {
  try {
    console.log('📝 Advanced Agent Task: Populate Refund Table Using Image Analysis');
    console.log('===============================================================\n');
    console.log('Initializing SupabaseAgent...');
    const agent = new SupabaseAgent();
    const fileNames = process.argv.slice(2).map(arg => arg.replace(/[\[\]]/g, ''));
    console.log('File names to process:', fileNames);
    if (fileNames.length === 0) {
      console.log('No filenames provided as command-line arguments. Starting interactive mode...\n');
      agent.runReceiptProcessorCLI();
      return;
    }
    console.log(`Processing ${fileNames.length} receipt images...`);
    for (const fileName of fileNames) {
      console.log(`\nPreparing to process: ${fileName}`);
      try {
        const url = await agent.getReceiptUrl(fileName);
        console.log(`✅ Found receipt URL: ${url}`);
      } catch (err) {
        console.error(`❌ Error retrieving URL for ${fileName}: ${err.message}`);
      }
    }
    const results = await agent.processReceiptImages(fileNames);
    console.log('\n📊 Processing Summary:');
    let successCount = 0;
    for (const result of results) {
      if (result.success) {
        successCount++;
        console.log(`✓ ${result.fileName}: Extracted $${result.amount} and updated database`);
      } else {
        console.log(`✗ ${result.fileName}: Failed - ${result.error}`);
      }
    }
    console.log(`\nProcessed ${results.length} images: ${successCount} successful, ${results.length - successCount} failed`);
  } catch (error) {
    console.error('Error in main function:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}
main(); 