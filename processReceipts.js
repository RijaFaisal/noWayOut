/**
 * Advanced Receipt Image Processing Script
 * 
 * This script processes receipt images stored in Supabase Storage,
 * extracts the total amount using Gemini Vision AI, and populates
 * the refund_requests table with the results.
 */
const SupabaseAgent = require('./mySupAgent');

async function main() {
  try {
    console.log('📝 Advanced Agent Task: Populate Refund Table Using Image Analysis');
    console.log('===============================================================\n');
    
    // Initialize the agent
    console.log('Initializing SupabaseAgent...');
    const agent = new SupabaseAgent();
    
    // Get command line arguments (receipt filenames)
    // Process arguments to handle cases where they might be passed with brackets
    const fileNames = process.argv.slice(2).map(arg => arg.replace(/[\[\]]/g, ''));
    console.log('File names to process:', fileNames);
    
    // If no arguments provided, run the interactive CLI
    if (fileNames.length === 0) {
      console.log('No filenames provided as command-line arguments. Starting interactive mode...\n');
      agent.runReceiptProcessorCLI();
      return;
    }
    
    // Process the provided filenames
    console.log(`Processing ${fileNames.length} receipt images...`);
    
    // Check each filename and verbose logging
    for (const fileName of fileNames) {
      console.log(`\nPreparing to process: ${fileName}`);
      try {
        // Test access to the file URL
        const url = await agent.getReceiptUrl(fileName);
        console.log(`✅ Found receipt URL: ${url}`);
      } catch (err) {
        console.error(`❌ Error retrieving URL for ${fileName}: ${err.message}`);
      }
    }
    
    // Process all images with detailed error handling
    const results = await agent.processReceiptImages(fileNames);
    
    // Display summary
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

// Run the main function
main(); 