require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const OpenAI = require('openai');
const ImageAnalyzer = require('./functions/imageAnalyzer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * AI Agent to interact with Supabase database and storage
 */
class SupabaseAgent {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    this.bucketName = 'receipts.nowayout';
    
    // Validate credentials
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.error('Error: Missing Supabase credentials in .env file');
      console.error('Please make sure SUPABASE_URL and SUPABASE_ANON_KEY are set');
      process.exit(1);
    }
    
    // Initialize Supabase client
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
    
    // Initialize OpenAI client with Groq API key for chat completions
    if (!process.env.GROQ_API_KEY) {
      console.error('Error: Missing Groq API key in .env file');
      console.error('Please make sure GROQ_API_KEY is set');
      process.exit(1);
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1', // Use Groq's API endpoint
    });
    
    // Initialize OpenAI client for audio transcription
    if (!process.env.OPENAI_API_KEY) {
      console.error('Error: Missing OpenAI API key in .env file');
      console.error('Please make sure OPENAI_API_KEY is set');
      process.exit(1);
    }
    
    this.openaiAudio = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // No baseURL means using OpenAI's default endpoint
    });
    
    // The system prompt that instructs the LLM how to interpret natural language queries
    this.SYSTEM_PROMPT = `
You are an AI assistant that converts natural language queries about database tables into Supabase JavaScript queries.
You will ONLY return the JavaScript code snippet that would run the query, with no explanation or additional text.

The database has the following tables:

1. "employees" table with columns:
- id (integer, primary key)
- name (text)
- age (numeric)
- salary (numeric)

2. "refund_requests" table with columns:
- id (integer, primary key)
- name (text)
- amount (numeric)
- image_url (text)
- audio_url (text)
- summary (text)

You should detect which table the user is referring to in their query. If the query mentions "refund", "request", or similar terms, use the "refund_requests" table. If it mentions "employee", "staff", "worker", or similar terms, use the "employees" table. If the table isn't clear, default to the "employees" table.

IMPORTANT: For update operations, pay special attention to the row ID. If the user specifies a row number or ID, make sure to use that exact ID in the update condition.

Here are some examples of natural language queries and their corresponding Supabase queries:

// READ (SELECT) Operations - Employees Table
Natural Language Query: "Get all employees"
Supabase Query: supabase.from('employees').select('*')

Natural Language Query: "Show employee with ID 5"
Supabase Query: supabase.from('employees').select('*').eq('id', 5)

Natural Language Query: "List employees who earn 1000"
Supabase Query: supabase.from('employees').select('*').eq('salary', 1000)

Natural Language Query: "Who has the highest salary?"
Supabase Query: supabase.from('employees').select('*').order('salary', { ascending: false }).limit(1)

Natural Language Query: "Employees over 30"
Supabase Query: supabase.from('employees').select('*').gt('age', 30)

Natural Language Query: "Names starting with J"
Supabase Query: supabase.from('employees').select('*').ilike('name', 'J%')

// READ (SELECT) Operations - Refund Requests Table
Natural Language Query: "Get all refund requests"
Supabase Query: supabase.from('refund_requests').select('*')

Natural Language Query: "Show refund request with ID 3"
Supabase Query: supabase.from('refund_requests').select('*').eq('id', 3)

Natural Language Query: "List refund requests with amount over 100"
Supabase Query: supabase.from('refund_requests').select('*').gt('amount', 100)

Natural Language Query: "Get refund requests ordered by amount"
Supabase Query: supabase.from('refund_requests').select('*').order('amount', { ascending: false })

Natural Language Query: "Refund requests with summaries"
Supabase Query: supabase.from('refund_requests').select('*').not('summary', 'is', null)

// CREATE (INSERT) Operations
Natural Language Query: "Add a new employee named John Doe, age 30, salary 50000"
Supabase Query: (async () => {
  const { data: maxId } = await supabase.from('employees').select('id').order('id', { ascending: false }).limit(1);
  const nextId = (maxId && maxId.length > 0) ? maxId[0].id + 1 : 1;
  return supabase.from('employees').insert([{ id: nextId, name: 'John Doe', age: 30, salary: 50000 }]);
})()

Natural Language Query: "Create a new refund request for Alice Johnson with amount 75.50"
Supabase Query: (async () => {
  const { data: maxId } = await supabase.from('refund_requests').select('id').order('id', { ascending: false }).limit(1);
  const nextId = (maxId && maxId.length > 0) ? maxId[0].id + 1 : 1;
  return supabase.from('refund_requests').insert([{ id: nextId, name: 'Alice Johnson', amount: 75.50 }]);
})()

// UPDATE Operations
Natural Language Query: "Update employee with ID 5 to have age 35"
Supabase Query: supabase.from('employees').update({ age: 35 }).eq('id', 5)

Natural Language Query: "Change John Doe's salary to 60000"
Supabase Query: supabase.from('employees').update({ salary: 60000 }).eq('name', 'John Doe')

Natural Language Query: "Update row 11, make John's age 100"
Supabase Query: supabase.from('employees').update({ age: 100 }).eq('id', 11)

Natural Language Query: "Update refund request with ID 3 to have amount 125.75"
Supabase Query: supabase.from('refund_requests').update({ amount: 125.75 }).eq('id', 3)

// DELETE Operations
Natural Language Query: "Delete employee with ID 5"
Supabase Query: supabase.from('employees').delete().eq('id', 5)

Natural Language Query: "Remove refund request with ID 7"
Supabase Query: supabase.from('refund_requests').delete().eq('id', 7)

When generating the query, only return the exact JavaScript code to execute the query, nothing else.
No markdown, no comments, just the executable code.
`;
  }

  /**
   * Check if the employees table has data, and populate it with sample data if empty
   */
  async checkAndPopulateEmployeesTable() {
    try {
      // Check if employees table has data
      const { data, error } = await this.supabase
        .from('employees')
        .select('*')
        .limit(1);
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      // If no data, populate with sample data
      if (!data || data.length === 0) {
        console.log('Employees table is empty. Adding sample data...');
        
        const sampleEmployees = [
          { name: 'John Smith', age: 35, salary: 75000 },
          { name: 'Jane Doe', age: 28, salary: 85000 },
          { name: 'Michael Johnson', age: 42, salary: 95000 },
          { name: 'Emily Williams', age: 31, salary: 72000 },
          { name: 'David Brown', age: 45, salary: 110000 },
          { name: 'Jessica Davis', age: 27, salary: 68000 },
          { name: 'Robert Wilson', age: 38, salary: 88000 },
          { name: 'Sarah Martinez', age: 33, salary: 79000 },
          { name: 'James Taylor', age: 29, salary: 71000 },
          { name: 'Jennifer Garcia', age: 36, salary: 82000 }
        ];
        
        const { error: insertError } = await this.supabase
          .from('employees')
          .insert(sampleEmployees);
        
        if (insertError) {
          throw new Error(`Error populating employees table: ${insertError.message}`);
        }
        
        console.log('Sample employee data added successfully!');
      }
    } catch (error) {
      console.error('Error checking/populating employees table:', error.message);
    }
  }

  /**
   * Check if the refund_requests table has data, and populate it with sample data if empty
   */
  async checkAndPopulateRefundRequestsTable() {
    try {
      // Check if refund_requests table has data
      const { data, error } = await this.supabase
        .from('refund_requests')
        .select('*')
        .limit(1);
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      // If no data, populate with sample data
      if (!data || data.length === 0) {
        console.log('Refund requests table is empty. Adding sample data...');
        
        // Get the image URLs for the sample data
        const receiptUrls = [];
        for (let i = 0; i < 5; i++) {
          try {
            const url = await this.getReceiptUrl(`refund_req${i}.png`);
            receiptUrls.push(url);
          } catch (e) {
            receiptUrls.push(''); // Use empty string if URL cannot be retrieved
          }
        }
        
        const sampleRefundRequests = [
          { 
            name: 'Alice Johnson', 
            amount: 125.99, 
            image_url: receiptUrls[0] || '', 
            audio_url: '' 
          },
          { 
            name: 'Bob Smith', 
            amount: 89.50, 
            image_url: receiptUrls[1] || '', 
            audio_url: '' 
          },
          { 
            name: 'Charlie Davis', 
            amount: 250.00, 
            image_url: receiptUrls[2] || '', 
            audio_url: '' 
          },
          { 
            name: 'Diana Wilson', 
            amount: 75.25, 
            image_url: receiptUrls[3] || '', 
            audio_url: '' 
          },
          { 
            name: 'Edward Brown', 
            amount: 199.99, 
            image_url: receiptUrls[4] || '', 
            audio_url: '' 
          }
        ];
        
        const { error: insertError } = await this.supabase
          .from('refund_requests')
          .insert(sampleRefundRequests);
        
        if (insertError) {
          throw new Error(`Error populating refund requests table: ${insertError.message}`);
        }
        
        console.log('Sample refund request data added successfully!');
      }
    } catch (error) {
      console.error('Error checking/populating refund requests table:', error.message);
    }
  }

  /**
   * Get the public URL of a file from Supabase Storage
   * @param {string} fileName - The name of the file (e.g., refund_req0.png)
   * @returns {Promise<string>} - The public URL of the file
   */
  async getReceiptUrl(fileName) {
    try {
      const { data, error } = await this.supabase
        .storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      if (error) {
        throw new Error(`Error getting public URL: ${error.message}`);
      }

      if (!data || !data.publicUrl) {
        throw new Error('No public URL found for this file');
      }

      // Fix the URL to include double slash before the filename
      const correctUrl = data.publicUrl.replace(`/${this.bucketName}/`, `/${this.bucketName}//`);
      return correctUrl;
    } catch (error) {
      console.error('Error retrieving file URL:', error.message);
      throw error;
    }
  }
  
  /**
   * Converts a natural language query to a Supabase query using LLM
   * @param {string} naturalLanguageQuery - The user's query in natural language
   * @returns {Promise<string>} - The generated Supabase query string
   */
  async convertToSupabaseQuery(naturalLanguageQuery) {
    try {
      const response = await this.openai.chat.completions.create({
        messages: [
          { role: "system", content: this.SYSTEM_PROMPT },
          { role: "user", content: naturalLanguageQuery }
        ],
        model: "llama3-70b-8192", // Using Llama 3 70B model for better accuracy
        temperature: 0.2, // Lower temperature for more deterministic output
        max_tokens: 200,
      });

      // Get the generated Supabase query
      const generatedQuery = response.choices[0].message.content.trim();
      console.log("AI generated Supabase query:", generatedQuery);
      return generatedQuery;
    } catch (error) {
      console.error("Error generating Supabase query:", error);
      throw error;
    }
  }

  /**
   * Executes a Supabase query generated from natural language
   * @param {string} naturalLanguageQuery - The user's query in natural language
   * @returns {Promise<Object>} - The result of the Supabase query
   */
  async executeNaturalLanguageQuery(naturalLanguageQuery) {
    try {
      // Generate Supabase query using LLM
      const generatedQuery = await this.convertToSupabaseQuery(naturalLanguageQuery);
      
      // Extract table name from the generated query
      let tableName = 'employees'; // Default
      const tableMatch = generatedQuery.match(/from\('([^']+)'\)/);
      if (tableMatch && tableMatch[1]) {
        tableName = tableMatch[1];
      }
      
      // Safe extraction of operation type
      let operationType = 'select'; // default
      if (generatedQuery.includes('.insert(')) {
        operationType = 'insert';
      } else if (generatedQuery.includes('.update(')) {
        operationType = 'update';
        
        // For update operations, log detailed information
        console.log("UPDATE OPERATION DETECTED:");
        
        // Try to extract what's being updated and the condition
        const updateMatch = generatedQuery.match(/update\(([^)]+)\)/);
        const conditionMatch = generatedQuery.match(/eq\('([^']+)',\s*([^)]+)\)/);
        
        if (updateMatch) {
          console.log("Update values:", updateMatch[1]);
        }
        
        if (conditionMatch) {
          console.log("Update condition field:", conditionMatch[1]);
          console.log("Update condition value:", conditionMatch[2]);
        }
      } else if (generatedQuery.includes('.delete(')) {
        operationType = 'delete';
      }
      
      // Execute the query directly
      console.log("Executing query:", generatedQuery);
      const queryFunction = new Function('supabase', `return ${generatedQuery}`);
      const result = await queryFunction(this.supabase);
      console.log("Query result:", result);
      
      if (result.error) {
        console.error("Query error:", result.error);
        throw result.error;
      }
      
      // Format the response based on the operation type
      let message = '';
      switch (operationType) {
        case 'insert':
          message = '✅ Insert operation successful';
          break;
        case 'update':
          message = '✅ Update operation completed successfully';
          break;
        case 'delete':
          message = '✅ Delete operation completed successfully';
          break;
        case 'select':
          // We'll just set a minimal message here as the actual count will be displayed in the UI
          message = ''; // The number of records will be displayed directly from the data
          break;
      }
      
      return {
        data: result.data,
        error: null,
        message,
        operationType,
        table: tableName,
        generatedQuery // Return the generated query for debugging
      };
    } catch (error) {
      return {
        data: null,
        error,
        message: `Error: ${error.message}`,
        operationType: null,
        table: null,
        generatedQuery // Return the generated query even if there's an error
      };
    }
  }

  /**
   * Process receipt images with delay between requests to avoid rate limiting
   * @param {string[]} fileNames - Array of receipt filenames to process
   * @param {number} delayMs - Delay between API calls in milliseconds
   * @returns {Promise<Array>} - Array of processing results
   */
  async processReceiptImagesWithDelay(fileNames, delayMs = 2000) {
    const results = [];
    const imageAnalyzer = new ImageAnalyzer();

    // Helper function to add delay
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    for (const fileName of fileNames) {
      try {
        console.log(`Processing ${fileName}...`);
        
        // Extract the numeric ID from the filename (e.g., refund_req1.png → 1)
        const fileIdMatch = fileName.match(/refund_req(\d+)\.png/);
        const fileId = fileIdMatch ? parseInt(fileIdMatch[1]) : null;
        
        // Get the public URL of the receipt
        const receiptUrl = await this.getReceiptUrl(fileName);
        console.log(`Retrieved URL: ${receiptUrl}`);
        
        // Add delay before API call to avoid rate limiting
        if (results.length > 0) {
          console.log(`Waiting ${delayMs/1000} seconds to avoid rate limits...`);
          await delay(delayMs);
        }
        
        // Analyze the image using Gemini Vision AI with retry logic
        console.log(`Analyzing image with Gemini Vision AI...`);
        let analysis;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            analysis = await imageAnalyzer.extractTotalFromReceipt(receiptUrl);
            break; // Success, exit the retry loop
          } catch (error) {
            retryCount++;
            if (error.message.includes('quota') || error.message.includes('429') || error.message.includes('rate limit')) {
              console.log(`Rate limit hit, retry ${retryCount}/${maxRetries} after delay...`);
              if (retryCount <= maxRetries) {
                await delay(delayMs * 2); // Double the delay for retries
              } else {
                throw error; // Max retries reached, propagate the error
              }
            } else {
              throw error; // Not a rate limit error, propagate immediately
            }
          }
        }
        
        // Extract the total amount from the analysis
        const amount = this.extractAmountFromAnalysis(analysis);
        console.log(`Extracted amount: $${amount}`);
        
        // Handle duplicate URL errors by checking if a record with this URL already exists
        let updateResult;
        try {
          if (fileId !== null) {
            console.log(`Updating refund_requests table at row ID ${fileId} with amount $${amount} and URL`);
            updateResult = await this.supabase
              .from('refund_requests')
              .update({ amount, image_url: receiptUrl })
              .eq('id', fileId);
          } else {
            // Fallback to using image_url if we couldn't extract a numeric ID
            console.log(`Updating refund_requests table using image_url match with amount $${amount}`);
            updateResult = await this.supabase
              .from('refund_requests')
              .update({ amount })
              .eq('image_url', receiptUrl);
          }
          
          if (updateResult.error) {
            // If we get a unique constraint error, try updating without the image_url
            if (updateResult.error.message.includes('unique constraint') || 
                updateResult.error.message.includes('duplicate key value')) {
              console.log('Detected duplicate URL, updating only the amount...');
              updateResult = await this.supabase
                .from('refund_requests')
                .update({ amount })
                .eq('id', fileId);
                
              if (updateResult.error) throw updateResult.error;
            } else {
              throw updateResult.error;
            }
          }
        } catch (dbError) {
          console.error(`Database error: ${dbError.message}`);
          throw dbError;
        }
        
        results.push({
          fileName,
          success: true,
          amount,
          fileId
        });
      } catch (error) {
        console.error(`Error processing ${fileName}:`, error.message);
        results.push({
          fileName,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Extract amount from Gemini Vision AI analysis
   * @param {string|number} analysis - The analysis result from Gemini Vision AI
   * @returns {number} - The extracted amount
   */
  extractAmountFromAnalysis(analysis) {
    console.log(`Extracting amount from analysis:`, analysis);
    
    // If analysis is already a number, return it directly
    if (typeof analysis === 'number') {
      return analysis;
    }
    
    // If analysis is a string that can be directly parsed as a number
    if (typeof analysis === 'string' && !isNaN(parseFloat(analysis))) {
      return parseFloat(analysis);
    }
    
    // Otherwise, try to extract a numeric pattern from the string
    if (typeof analysis === 'string') {
      // Look for patterns like $XX.XX or XX.XX
      const amountMatch = analysis.match(/\$?\d+\.\d{2}/);
      if (amountMatch) {
        return parseFloat(amountMatch[0].replace('$', ''));
      }
    }
    
    throw new Error('Could not extract amount from receipt');
  }

  /**
   * Process audio files to generate transcriptions and summaries
   * @param {boolean} processSingleFile - Whether to process only a single file (for testing/recovery)
   * @returns {Promise<Array>} - Array of processing results
   */
  async processAudioFiles(processSingleFile = false) {
    try {
      // Get all records with audio_url but without summary
      const { data: records, error } = await this.supabase
        .from('refund_requests')
        .select('id, name, audio_url, summary')
        .not('audio_url', 'is', null)
        .not('audio_url', 'eq', '')
        .is('summary', null);

      if (error) {
        throw error;
      }

      if (!records || records.length === 0) {
        console.log('No audio files found to process');
        return [];
      }

      console.log(`Found ${records.length} audio files to process`);
      
      // If processSingleFile is true, only process the first record
      const recordsToProcess = processSingleFile ? [records[0]] : records;
      if (processSingleFile) {
        console.log('Processing only a single file for testing/recovery purposes');
      }
      
      // Set up to use either the process_audio module or direct processing
      let processAudioModule;
      try {
        processAudioModule = require('./process_audio');
        console.log('Using external process_audio module');
      } catch (moduleError) {
        console.log('External audio processing module not available, using direct processing');
      }
      
      let results = [];
      
      if (processAudioModule && processAudioModule.processAudioFiles) {
        // Use the module if available
        results = await processAudioModule.processAudioFiles(recordsToProcess);
      } else {
        // Direct processing logic
        results = await this._directProcessAudioFiles(recordsToProcess);
      }
      
      return results;
    } catch (error) {
      console.error('Error processing audio files:', error.message);
      throw error;
    }
  }
  
  /**
   * Internal method to directly process audio files without using the external module
   * @param {Array} records - Array of records to process
   * @returns {Promise<Array>} - Array of processing results
   * @private
   */
  async _directProcessAudioFiles(records) {
    const results = [];
    let delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    for (const record of records) {
      try {
        console.log(`\nProcessing audio for ID: ${record.id}, Name: ${record.name}`);
        
        if (!record.audio_url) {
          console.log(`No audio URL found for ID: ${record.id}, skipping...`);
          results.push({
            id: record.id,
            name: record.name,
            success: false,
            error: 'No audio URL found'
          });
          continue;
        }
        
        // Download the audio file
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir);
        }
        
        // Fix common URL issues
        const fixedUrl = record.audio_url.replace(/\/+/g, '/').replace('https:/', 'https://');
        
        console.log(`Downloading audio from URL: ${fixedUrl}`);
        const response = await axios({
          method: 'get',
          url: fixedUrl,
          responseType: 'stream',
          timeout: 30000
        });
        
        const filePath = path.join(tempDir, `audio_${record.id}.mp3`);
        const writer = fs.createWriteStream(filePath);
        
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        console.log(`Downloaded audio file to: ${filePath}`);
        
        // Transcribe the audio using OpenAI
        console.log(`Transcribing audio file with OpenAI Whisper...`);
        
        // Add a slight delay to avoid rate limits
        await delay(1000);
        
        // Create a readstream for the file
        const fileStream = fs.createReadStream(filePath);
        
        // Call OpenAI Whisper API
        const transcriptionResponse = await this.openaiAudio.audio.transcriptions.create({
          file: fileStream,
          model: "whisper-1"
        });
        
        if (!transcriptionResponse || !transcriptionResponse.text) {
          throw new Error('Empty response from OpenAI Whisper API');
        }
        
        const transcription = transcriptionResponse.text;
        console.log(`Transcription successful: ${transcription.substring(0, 50)}...`);
        
        // Add delay before next API call
        await delay(1000);
        
        // Generate summary using Groq (Llama)
        console.log(`Generating summary with Llama model...`);
        const summaryResponse = await this.openai.chat.completions.create({
          model: "llama3-70b-8192",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that summarizes audio transcriptions into concise summaries. Focus on the key points and maintain the original meaning."
            },
            {
              role: "user",
              content: `Please summarize this audio transcription:\n\n${transcription}`
            }
          ],
          temperature: 0.3,
          max_tokens: 300
        });
        
        if (!summaryResponse || !summaryResponse.choices || summaryResponse.choices.length === 0) {
          throw new Error('Empty response from Groq LLM API');
        }
        
        const summary = summaryResponse.choices[0].message.content;
        console.log(`Summary generated: ${summary.substring(0, 50)}...`);
        
        // Format the result
        const combinedText = `TRANSCRIPTION:\n${transcription}\n\nSUMMARY:\n${summary}`;
        
        // Update the database
        const { error: updateError } = await this.supabase
          .from('refund_requests')
          .update({ summary: combinedText })
          .eq('id', record.id);
        
        if (updateError) {
          throw updateError;
        }
        
        console.log(`✅ Successfully processed audio for ID: ${record.id}`);
        results.push({
          id: record.id,
          name: record.name,
          success: true,
          transcriptionLength: transcription.length,
          summaryLength: summary.length
        });
        
        // Clean up the temporary file
        fs.unlinkSync(filePath);
        console.log(`Deleted temporary file: ${filePath}`);
        
        // Add delay before processing next file to avoid rate limits
        await delay(2000);
      } catch (error) {
        console.error(`❌ Error processing audio for ID ${record.id}:`, error.message);
        results.push({
          id: record.id,
          name: record.name,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Run the receipt processor CLI
   */
  runReceiptProcessorCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('🤖 Supabase AI Agent - Advanced Image Processing');
    console.log('This agent will process receipt images and update the refund requests table.\n');
    
    rl.question('Enter receipt filenames, separated by commas (e.g., receipt1.png,receipt2.png): ', async (input) => {
      const fileNames = input.split(',').map(name => name.trim());
      
      if (fileNames.length === 0 || (fileNames.length === 1 && fileNames[0] === '')) {
        console.log('No filenames provided. Exiting...');
        rl.close();
        return;
      }
      
      console.log(`\nProcessing ${fileNames.length} receipt images...`);
      
      try {
        const results = await this.processReceiptImagesWithDelay(fileNames);
        
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
        console.error('Error in batch processing:', error.message);
      }
      
      rl.close();
    });
    
    // Handle graceful exit
    rl.on('close', () => {
      console.log('\nThank you for using the Supabase AI Agent. Goodbye!');
      process.exit(0);
    });
  }

  /**
   * Helper function to parse natural language queries into structured data
   * @param {string} query - Natural language query
   * @returns {Object} Parsed query structure
   */
  parseQuery(query) {
    const parsed = {
      operation: null,
      table: 'employees', // Default table
      conditions: [],
      fields: ['*'], // Default to all fields
      values: null,
      limit: null
    };

    // Convert query to lowercase for easier matching
    const lowerQuery = query.toLowerCase();
    
    // Determine the table name based on keywords
    if (lowerQuery.includes('refund') || lowerQuery.includes('request')) {
      parsed.table = 'refund_requests';
    }

    // Determine operation type
    if (lowerQuery.includes('get') || lowerQuery.includes('show') || lowerQuery.includes('list') || lowerQuery.includes('find')) {
      parsed.operation = 'select';
    } else if (lowerQuery.includes('add') || lowerQuery.includes('insert') || lowerQuery.includes('new') || lowerQuery.includes('create')) {
      parsed.operation = 'insert';
    } else if (lowerQuery.includes('update') || lowerQuery.includes('change') || lowerQuery.includes('modify')) {
      parsed.operation = 'update';
    } else if (lowerQuery.includes('delete') || lowerQuery.includes('remove') || lowerQuery.includes('erase')) {
      parsed.operation = 'delete';
    }

    // Parse ID-based operations
    const idMatch = query.match(/(?:id|row|record)\s+(\d+)/i);
    if (idMatch) {
      parsed.conditions.push({ field: 'id', operator: 'eq', value: parseInt(idMatch[1]) });
    }

    // Parse conditions based on the table
    if (parsed.table === 'employees') {
      // For employees table
      if (lowerQuery.includes('salary is exactly')) {
        const salary = query.match(/salary is exactly (\d+)/i)?.[1];
        if (salary) parsed.conditions.push({ field: 'salary', operator: 'eq', value: parseInt(salary) });
      } else if (lowerQuery.includes('highest salary')) {
        parsed.conditions.push({ field: 'salary', operator: 'order', value: { ascending: false } });
        parsed.limit = 1;
      } else if (lowerQuery.includes('age is greater than')) {
        const age = query.match(/age is greater than (\d+)/i)?.[1];
        if (age) parsed.conditions.push({ field: 'age', operator: 'gt', value: parseInt(age) });
      } else if (lowerQuery.includes('starting with')) {
        const letter = query.match(/starting with (\w)/i)?.[1];
        if (letter) parsed.conditions.push({ field: 'name', operator: 'ilike', value: `${letter}%` });
      }
      
      // Parse values for employees
      if (parsed.operation === 'insert' || parsed.operation === 'update') {
        const nameMatch = query.match(/named (\w+)/i);
        const salaryMatch = query.match(/salary (\d+)/i);
        const ageMatch = query.match(/age (\d+)/i);
        
        parsed.values = {};
        if (nameMatch) parsed.values.name = nameMatch[1];
        if (salaryMatch) parsed.values.salary = parseInt(salaryMatch[1]);
        if (ageMatch) parsed.values.age = parseInt(ageMatch[1]);
      }
    } else if (parsed.table === 'refund_requests') {
      // For refund_requests table
      if (lowerQuery.includes('amount is exactly')) {
        const amount = query.match(/amount is exactly (\d+(\.\d+)?)/i)?.[1];
        if (amount) parsed.conditions.push({ field: 'amount', operator: 'eq', value: parseFloat(amount) });
      } else if (lowerQuery.includes('highest amount')) {
        parsed.conditions.push({ field: 'amount', operator: 'order', value: { ascending: false } });
        parsed.limit = 1;
      } else if (lowerQuery.includes('amount is greater than')) {
        const amount = query.match(/amount is greater than (\d+(\.\d+)?)/i)?.[1];
        if (amount) parsed.conditions.push({ field: 'amount', operator: 'gt', value: parseFloat(amount) });
      } else if (lowerQuery.includes('with summary')) {
        parsed.conditions.push({ field: 'summary', operator: 'not_is_null' });
      }
      
      // Parse values for refund_requests
      if (parsed.operation === 'insert' || parsed.operation === 'update') {
        const nameMatch = query.match(/named (\w+)/i);
        const amountMatch = query.match(/amount (\d+(\.\d+)?)/i);
        
        parsed.values = {};
        if (nameMatch) parsed.values.name = nameMatch[1];
        if (amountMatch) parsed.values.amount = parseFloat(amountMatch[1]);
      }
    }

    return parsed;
  }

  /**
   * Handle natural language queries for Supabase operations
   * @param {string} query - Natural language query
   * @returns {Promise<Object>} Query result
   */
  async handleSupabaseQuery(query) {
    try {
      const parsed = this.parseQuery(query);
      let result;

      switch (parsed.operation) {
        case 'select':
          let queryBuilder = this.supabase.from(parsed.table).select(parsed.fields);
          
          // Apply conditions
          for (const condition of parsed.conditions) {
            switch (condition.operator) {
              case 'eq':
                queryBuilder = queryBuilder.eq(condition.field, condition.value);
                break;
              case 'gt':
                queryBuilder = queryBuilder.gt(condition.field, condition.value);
                break;
              case 'ilike':
                queryBuilder = queryBuilder.ilike(condition.field, condition.value);
                break;
              case 'order':
                queryBuilder = queryBuilder.order(condition.field, condition.value);
                break;
              case 'not_is_null':
                queryBuilder = queryBuilder.not(condition.field, 'is', null);
                break;
            }
          }
          
          if (parsed.limit) {
            queryBuilder = queryBuilder.limit(parsed.limit);
          }
          
          result = await queryBuilder;
          break;

        case 'insert':
          if (!parsed.values) {
            throw new Error('No values provided for insert operation');
          }
          result = await this.supabase.from(parsed.table).insert([parsed.values]);
          break;

        case 'update':
          if (!parsed.values) {
            throw new Error('No values provided for update operation');
          }
          let updateBuilder = this.supabase.from(parsed.table).update(parsed.values);
          
          // Apply conditions
          for (const condition of parsed.conditions) {
            switch (condition.operator) {
              case 'eq':
                updateBuilder = updateBuilder.eq(condition.field, condition.value);
                break;
              case 'gt':
                updateBuilder = updateBuilder.gt(condition.field, condition.value);
                break;
              case 'ilike':
                updateBuilder = updateBuilder.ilike(condition.field, condition.value);
                break;
            }
          }
          
          result = await updateBuilder;
          break;

        case 'delete':
          let deleteBuilder = this.supabase.from(parsed.table).delete();
          
          // Apply conditions
          for (const condition of parsed.conditions) {
            switch (condition.operator) {
              case 'eq':
                deleteBuilder = deleteBuilder.eq(condition.field, condition.value);
                break;
              case 'gt':
                deleteBuilder = deleteBuilder.gt(condition.field, condition.value);
                break;
              case 'ilike':
                deleteBuilder = deleteBuilder.ilike(condition.field, condition.value);
                break;
            }
          }
          
          result = await deleteBuilder;
          break;

        default:
          throw new Error('Unsupported operation type');
      }

      if (result.error) {
        throw new Error(result.error.message);
      }

      return {
        success: true,
        data: result.data,
        message: `Operation ${parsed.operation} completed successfully on table ${parsed.table}`,
        table: parsed.table // Include the table name in the response
      };

    } catch (error) {
      console.error('Error executing query:', error);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }

  /**
   * Determines the intent of a user's natural language query
   * @param {string} query - The user's query in natural language
   * @returns {Promise<Object>} - The determined intent and parameters
   */
  async determineQueryIntent(query) {
    try {
      const lowercaseQuery = query.toLowerCase();
      let intent = { type: 'database_query' }; // Default intent
      
      // Special case for the specific receipt task from 1-10
      if (lowercaseQuery.includes('get all the urls from the storage') &&
          (lowercaseQuery.includes('refund_req1.png') || lowercaseQuery.includes('refund_req 1')) &&
          lowercaseQuery.includes('10') &&
          lowercaseQuery.includes('update the respective rows')) {
        // This is the special task for processing all receipts from 1-10
        console.log('Identified special receipt processing task 1-10');
        const fileNames = [];
        for (let i = 1; i <= 10; i++) {
          fileNames.push(`refund_req${i}.png`);
        }
        return { type: 'receipt_processing', fileNames };
      }
      
      // Regular checks
      // Check for receipt processing intent - improved pattern matching
      if (lowercaseQuery.includes('process receipt') || 
          lowercaseQuery.includes('analyze receipt') || 
          lowercaseQuery.includes('extract from receipt') ||
          (lowercaseQuery.includes('process') && lowercaseQuery.includes('image')) ||
          (lowercaseQuery.includes('get') && lowercaseQuery.includes('urls') && lowercaseQuery.includes('storage')) ||
          (lowercaseQuery.includes('update') && lowercaseQuery.includes('refund') && lowercaseQuery.includes('image')) ||
          (lowercaseQuery.includes('refund_req') && lowercaseQuery.includes('png') && lowercaseQuery.includes('read')) ||
          (lowercaseQuery.includes('receipt') && lowercaseQuery.includes('total') && lowercaseQuery.includes('update'))) {
          
        // Extract receipt file names from the query
        let fileNames = [];
        
        // If query contains a range like "refund_req1.png through refund_req10.png"
        if (lowercaseQuery.includes('through') || lowercaseQuery.includes('till') || lowercaseQuery.includes('to')) {
          const rangeMatches = lowercaseQuery.match(/refund_req(\d+)\.png.*(?:through|till|to).*refund_req(\d+)\.png/);
          if (rangeMatches && rangeMatches.length >= 3) {
            const start = parseInt(rangeMatches[1]);
            const end = parseInt(rangeMatches[2]);
            for (let i = start; i <= end; i++) {
              fileNames.push(`refund_req${i}.png`);
            }
          } else {
            // Try to extract numbers directly
            const numbers = lowercaseQuery.match(/\d+/g);
            if (numbers && numbers.length >= 2) {
              const start = Math.min(...numbers.map(n => parseInt(n)));
              const end = Math.max(...numbers.map(n => parseInt(n)));
              for (let i = start; i <= end; i++) {
                fileNames.push(`refund_req${i}.png`);
              }
            }
          }
        }
        
        // Try to extract specific receipt numbers (refund_req1.png, etc.)
        const receiptMatches = lowercaseQuery.match(/refund_req\d+\.png/g);
        if (receiptMatches && receiptMatches.length > 0) {
          fileNames = receiptMatches;
        } 
        // If specific filenames not found and no range detected, check for number ranges
        else if (fileNames.length === 0 && lowercaseQuery.includes('receipt') && lowercaseQuery.match(/\d+/)) {
          // Extract all numbers from the query
          const numbers = lowercaseQuery.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            // Handle individual numbers
            numbers.forEach(num => {
              fileNames.push(`refund_req${num}.png`);
            });
          }
        }
        
        // Process receipts 1 through 10 if mentions batch processing
        if (fileNames.length === 0 && 
            (lowercaseQuery.includes('all') || 
             lowercaseQuery.includes('batch') || 
             lowercaseQuery.includes('multiple') ||
             lowercaseQuery.includes('refund_req1.png through refund_req10') ||
             lowercaseQuery.includes('refund_req1.png till refund_req10') ||
             lowercaseQuery.includes('refund_req1.png to refund_req10') ||
             (lowercaseQuery.includes('1') && lowercaseQuery.includes('10')))) {
          for (let i = 1; i <= 10; i++) {
            fileNames.push(`refund_req${i}.png`);
          }
        }
        
        // If we're dealing with getting URLs from storage and processing receipts,
        // this is definitely a receipt processing task
        if (lowercaseQuery.includes('urls') && lowercaseQuery.includes('storage') && 
            (lowercaseQuery.includes('refund_req') || lowercaseQuery.includes('receipt'))) {
          // Default to processing all receipts
          if (fileNames.length === 0) {
            for (let i = 1; i <= 10; i++) {
              fileNames.push(`refund_req${i}.png`);
            }
          }
          return { type: 'receipt_processing', fileNames };
        }
        
        if (fileNames.length > 0) {
          return { type: 'receipt_processing', fileNames };
        }
      }
      
      // Check for audio processing intent
      if (lowercaseQuery.includes('process audio') || 
          lowercaseQuery.includes('transcribe audio') || 
          lowercaseQuery.includes('process all audio') ||
          lowercaseQuery.includes('analyze audio')) {
        return { type: 'audio_processing' };
      }
      
      // Check for audio summary intent
      if (lowercaseQuery.includes('show audio summary') || 
          lowercaseQuery.includes('get audio summary') || 
          lowercaseQuery.includes('view summary') ||
          lowercaseQuery.includes('show summary') ||
          lowercaseQuery.includes('get summary') ||
          lowercaseQuery.includes('list summary') ||
          lowercaseQuery.includes('audio summary') ||
          lowercaseQuery.includes('generate summary') ||
          lowercaseQuery.includes('summarize audio') ||
          lowercaseQuery.includes('transcribe and summarize') ||
          lowercaseQuery.includes('process audio') && (
            lowercaseQuery.includes('summarize') || 
            lowercaseQuery.includes('summary')
          )) {
        return { type: 'audio_summary' };
      }
      
      // Check for receipt URL intent
      if ((lowercaseQuery.includes('get url') || lowercaseQuery.includes('get receipt url')) && 
          lowercaseQuery.match(/refund_req\d+\.png/)) {
        const fileMatch = lowercaseQuery.match(/refund_req\d+\.png/);
        if (fileMatch) {
          return { type: 'receipt_url', fileName: fileMatch[0] };
        }
      }
      
      // Use more sophisticated intent detection for ambiguous queries
      if (!intent.type || intent.type === 'database_query') {
        // For complex queries, use the LLM to help determine intent
        if (lowercaseQuery.length > 15 && 
            !(lowercaseQuery.includes('get') || 
              lowercaseQuery.includes('show') || 
              lowercaseQuery.includes('list') || 
              lowercaseQuery.includes('find') ||
              lowercaseQuery.includes('delete') ||
              lowercaseQuery.includes('update') ||
              lowercaseQuery.includes('add'))) {
          
          // Use the LLM to help classify the intent
          const intentPrompt = `
Determine the intent of this query. Return one of:
- database_query: For queries about getting, updating, or deleting database records
- receipt_processing: For processing receipt images
- audio_processing: For processing audio files
- audio_summary: For retrieving audio summaries
- receipt_url: For getting URLs of receipt images

Query: "${query}"

Intent:`;
          
          const response = await this.openai.chat.completions.create({
            messages: [{ role: "user", content: intentPrompt }],
            model: "llama3-70b-8192", // Using Llama 3 70B model
            temperature: 0.1,
            max_tokens: 10,
          });
          
          const aiIntent = response.choices[0].message.content.trim().toLowerCase();
          
          if (aiIntent.includes('database')) {
            intent.type = 'database_query';
          } else if (aiIntent.includes('receipt_processing')) {
            // If we couldn't extract file names earlier but the AI thinks it's receipt processing
            // Default to processing all receipts
            const fileNames = [];
            for (let i = 0; i < 10; i++) {
              fileNames.push(`refund_req${i}.png`);
            }
            intent = { type: 'receipt_processing', fileNames };
          } else if (aiIntent.includes('audio_processing')) {
            intent.type = 'audio_processing';
          } else if (aiIntent.includes('audio_summary')) {
            intent.type = 'audio_summary';
          } else if (aiIntent.includes('receipt_url')) {
            // If we need a URL but don't know which file, default to the first one
            intent = { type: 'receipt_url', fileName: 'refund_req0.png' };
          }
        }
      }
      
      return intent;
    } catch (error) {
      console.error('Error determining query intent:', error.message);
      // Default to database query if there's an error
      return { type: 'database_query' };
    }
  }
}

// Export the agent class
module.exports = SupabaseAgent;
