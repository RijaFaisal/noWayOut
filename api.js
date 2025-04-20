const SupabaseAgent = require('./mySupAgent');
const http = require('http');
const url = require('url');

// Initialize the agent
const agent = new SupabaseAgent();

// Attempt to import the CLI helper functions from index.js if available
let cliHelpers = {};
try {
  const indexModule = require('./index.js');
  // Extract the functions that might be needed
  if (typeof indexModule.handleReceiptProcessing === 'function') {
    cliHelpers.handleReceiptProcessing = indexModule.handleReceiptProcessing;
  }
  if (typeof indexModule.handleAudioProcessing === 'function') {
    cliHelpers.handleAudioProcessing = indexModule.handleAudioProcessing;
  }
  if (typeof indexModule.handleAudioSummary === 'function') {
    cliHelpers.handleAudioSummary = indexModule.handleAudioSummary;
  }
  console.log('Successfully imported CLI helper functions:', Object.keys(cliHelpers));
} catch (error) {
  console.log('Could not import CLI helper functions:', error.message);
}

// Create the API server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Only handle POST requests to /api/query
  if (req.method === 'POST' && req.url === '/api/query') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        // Parse the request body
        const { query } = JSON.parse(body);
        
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Query is required' }));
          return;
        }
        
        console.log(`Processing query: ${query}`);
        
        // Process the query using the existing agent functionality
        const intent = await agent.determineQueryIntent(query);
        let result;
        
        // Handle different intents based on the query
        switch (intent.type) {
          case 'database_query':
            console.log('Executing database query:', query);
            result = await agent.executeNaturalLanguageQuery(query);
            // Log the result for debugging
            console.log('Query result:', {
              operationType: result.operationType,
              table: result.table,
              error: result.error ? result.error.message : null,
              dataLength: result.data ? (Array.isArray(result.data) ? result.data.length : 'not array') : 'no data'
            });
            break;
            
          case 'receipt_processing':
            console.log('Processing receipts with fileNames:', intent.fileNames);
            // Always use the CLI method for processing receipts
            try {
              // Import the processReceiptImagesWithDelay method from index.js
              console.log('Using direct method agent.processReceiptImagesWithDelay');
              
              // Use the same method that works in CLI
              const delayMs = 2000; // Same delay used in CLI
              const results = await agent.processReceiptImagesWithDelay(intent.fileNames, delayMs);
              
              console.log('Receipt processing results:', results);
              
              result = {
                success: true,
                message: `Processed ${intent.fileNames.length} receipt${intent.fileNames.length > 1 ? 's' : ''} successfully.`,
                data: results
              };
            } catch (error) {
              console.error('Error using direct receipt processing:', error);
              result = {
                success: false,
                error: error.message,
                message: 'Failed to process receipts'
              };
            }
            break;
            
          case 'audio_processing':
            // Try to use the CLI helper function if available
            if (cliHelpers.handleAudioProcessing) {
              console.log('Using CLI handleAudioProcessing function');
              try {
                await cliHelpers.handleAudioProcessing();
                result = {
                  success: true,
                  message: 'Processed audio files successfully using CLI function'
                };
              } catch (error) {
                console.error('Error using CLI audio processing:', error);
                // Fall back to our implementation
                result = await handleAudioProcessing();
              }
            } else {
              result = await handleAudioProcessing();
            }
            break;
            
          case 'audio_summary':
            // Try to use the CLI helper function if available
            if (cliHelpers.handleAudioSummary) {
              console.log('Using CLI handleAudioSummary function');
              try {
                await cliHelpers.handleAudioSummary();
                result = {
                  success: true,
                  message: 'Retrieved audio summaries successfully using CLI function'
                };
              } catch (error) {
                console.error('Error using CLI audio summary:', error);
                // Fall back to our implementation
                result = await handleAudioSummary();
              }
            } else {
              result = await handleAudioSummary();
            }
            break;
            
          case 'receipt_url':
            result = await handleReceiptUrl(intent.fileName);
            break;
            
          default:
            // Default to database query for any unhandled intents
            result = await agent.executeNaturalLanguageQuery(query);
        }
        
        // Send the result back to the client
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const responseJSON = JSON.stringify({
          ...result,
          intent: intent.type // Include the detected intent in the response
        });
        res.end(responseJSON);
        
      } catch (error) {
        console.error('Error processing query:', error);
        
        // Send error response
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: error.message,
          success: false
        }));
      }
    });
  } else {
    // Handle 404 for all other routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Handle receipt processing
async function handleReceiptProcessing(fileNames) {
  try {
    const results = [];
    console.log(`Processing ${fileNames.length} receipts...`);
    
    // Import ImageAnalyzer for actual image analysis - with better error handling
    let ImageAnalyzer;
    try {
      ImageAnalyzer = require('./functions/imageAnalyzer');
      console.log('Successfully imported ImageAnalyzer');
    } catch (importError) {
      console.error('Error importing ImageAnalyzer:', importError);
      throw new Error(`Cannot import ImageAnalyzer: ${importError.message}`);
    }
    
    const analyzer = new ImageAnalyzer();
    
    for (const fileName of fileNames) {
      // Since we've seen the CLI output, we know these are the functions being used successfully
      console.log(`Processing ${fileName}...`);
      
      try {
        // Try to get the URL directly from the agent's supabase instance
        console.log(`Getting URL for ${fileName}...`);
        let receiptUrl;
        
        if (typeof agent.getImageUrlFromStorage === 'function') {
          receiptUrl = await agent.getImageUrlFromStorage(fileName);
        } else if (typeof agent.getReceiptUrl === 'function') {
          receiptUrl = await agent.getReceiptUrl(fileName);
        } else {
          // Direct Supabase access if helper methods aren't available
          const { data, error } = await agent.supabase
            .storage
            .from('receipts.nowayout')
            .getPublicUrl(fileName);
          
          if (error) throw error;
          receiptUrl = data.publicUrl;
        }
        
        console.log(`Retrieved URL: ${receiptUrl}`);
        
        // Process the receipt image with actual image analysis
        console.log(`Analyzing image with Gemini Vision AI...`);
        let total;
        
        try {
          // Attempt to extract total from receipt using Gemini Vision AI
          total = await analyzer.extractTotalFromReceipt(receiptUrl);
          console.log(`Successfully extracted total: $${total} from receipt`);
        } catch (analysisError) {
          console.error(`Error analyzing receipt: ${analysisError.message}`);
          throw new Error(`Failed to extract total from receipt: ${analysisError.message}`);
        }
        
        // Construct receipt data
        const receiptData = { 
          total: total,
          date: new Date().toISOString().split('T')[0],
          merchant: "Receipt Analysis" 
        };
        
        console.log(`Receipt data: ${JSON.stringify(receiptData)}`);
        
        // Update the database with receipt data
        console.log(`Updating refund_requests table with receipt data...`);
        let updateResult;
        
        // Extract ID from filename (e.g., refund_req1.png -> 1)
        const idMatch = fileName.match(/refund_req(\d+)\.png/);
        const id = idMatch ? parseInt(idMatch[1]) : null;
        
        if (id === null) {
          throw new Error(`Could not extract ID from filename: ${fileName}`);
        }
        
        // Update the row directly with Supabase
        const { data, error } = await agent.supabase
          .from('refund_requests')
          .update({ 
            amount: receiptData.total,
            image_url: receiptUrl
          })
          .eq('id', id);
        
        if (error) {
          console.error(`Database update error: ${error.message}`);
          throw error;
        }
        
        updateResult = { success: true, data };
        
        results.push({
          fileName,
          receiptUrl,
          receiptData,
          updateResult
        });
        
        // Wait briefly to avoid rate limits
        console.log(`Waiting briefly to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        results.push({
          fileName,
          error: error.message
        });
      }
    }
    
    return {
      success: true,
      message: `Processed ${fileNames.length} receipt${fileNames.length > 1 ? 's' : ''} successfully.`,
      data: results
    };
  } catch (error) {
    console.error('Error processing receipts:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to process receipts'
    };
  }
}

// Handle audio processing
async function handleAudioProcessing() {
  try {
    // Process all audio files
    const results = await agent.processAudioFiles();
    
    return {
      success: true,
      message: 'Processed audio files successfully.',
      data: results
    };
  } catch (error) {
    console.error('Error processing audio:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to process audio files'
    };
  }
}

// Handle audio summary
async function handleAudioSummary() {
  try {
    // Get summaries for all audio files
    const summaries = await agent.getAudioSummaries();
    
    return {
      success: true,
      message: 'Retrieved audio summaries successfully.',
      data: summaries
    };
  } catch (error) {
    console.error('Error getting audio summaries:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to retrieve audio summaries'
    };
  }
}

// Handle receipt URL retrieval
async function handleReceiptUrl(fileName) {
  try {
    // Get the URL for the receipt image
    const url = await agent.getFileUrlFromStorage(fileName);
    
    return {
      success: true,
      message: `Retrieved URL for ${fileName} successfully.`,
      data: { fileName, url }
    };
  } catch (error) {
    console.error('Error getting receipt URL:', error);
    return {
      success: false,
      error: error.message,
      message: `Failed to get URL for ${fileName}`
    };
  }
}

const API_PORT = process.env.API_PORT || 3001;

server.listen(API_PORT, '0.0.0.0', () => {
  console.log(`API server running at http://localhost:${API_PORT}/`);
}); 