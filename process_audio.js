require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Initialize Groq client for text operations
const groqClient = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1', // Use Groq's API endpoint
});

// Initialize OpenAI client specifically for audio transcription
const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // No baseURL means using OpenAI's default endpoint
});

// Config for retries and rate limiting
const config = {
    maxRetries: 3,
    baseDelay: 2000, // 2 seconds
    maxDelay: 30000, // 30 seconds
    timeout: 60000,  // 60 seconds
};

/**
 * Delay/sleep function for rate limiting
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Promise that resolves after the delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff time
 * @param {number} retry - Current retry attempt
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoff(retry, baseDelay = config.baseDelay, maxDelay = config.maxDelay) {
    const delay = Math.min(baseDelay * Math.pow(1.5, retry), maxDelay);
    // Add some jitter to prevent synchronized retries
    return delay + (Math.random() * 1000);
}

/**
 * Download audio file with retry mechanism
 * @param {string} url - URL of the audio file
 * @param {number} id - ID of the record
 * @returns {Promise<string>} - Path to the downloaded file
 */
async function downloadAudioFile(url, id) {
    let retryCount = 0;
    
    while (retryCount <= config.maxRetries) {
        try {
            console.log(`Downloading audio from URL: ${url} (attempt ${retryCount + 1}/${config.maxRetries + 1})`);
            
            // Fix common URL issues
            const fixedUrl = url.replace(/\/+/g, '/').replace('https:/', 'https://');
            console.log(`Using fixed URL: ${fixedUrl}`);
            
            const response = await axios({
                method: 'get',
                url: fixedUrl,
                responseType: 'stream',
                timeout: config.timeout
            });

            const filePath = path.join(tempDir, `audio_${id}.mp3`);
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`Downloaded audio file to: ${filePath}`);
                    resolve(filePath);
                });
                writer.on('error', (err) => {
                    console.error(`Error writing file: ${err.message}`);
                    reject(err);
                });
            });
        } catch (error) {
            retryCount++;
            console.error(`Error downloading audio file for ID ${id} (attempt ${retryCount}/${config.maxRetries + 1}):`, error.message);
            
            // Check if we've reached max retries
            if (retryCount > config.maxRetries) {
                throw new Error(`Failed to download audio after ${config.maxRetries + 1} attempts: ${error.message}`);
            }
            
            // Add exponential backoff delay before retrying
            const delayMs = calculateBackoff(retryCount);
            console.log(`Retrying in ${Math.round(delayMs / 1000)} seconds...`);
            await sleep(delayMs);
        }
    }
}

/**
 * Transcribe audio with retry mechanism
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudio(filePath) {
    let retryCount = 0;
    
    while (retryCount <= config.maxRetries) {
        try {
            console.log(`Transcribing audio file with OpenAI: ${filePath} (attempt ${retryCount + 1}/${config.maxRetries + 1})`);
            
            // Create a readstream for the file
            const fileStream = fs.createReadStream(filePath);
            
            // Call OpenAI Whisper API using the OpenAI client (not Groq)
            const response = await openaiClient.audio.transcriptions.create({
                file: fileStream,
                model: "whisper-1"
            });
            
            if (!response || !response.text) {
                throw new Error('Empty response from OpenAI Whisper API');
            }
            
            console.log(`Transcription successful: ${response.text.substring(0, 50)}...`);
            return response.text;
        } catch (error) {
            retryCount++;
            console.error(`Whisper API Error (attempt ${retryCount}/${config.maxRetries + 1}):`, error.response?.data || error.message);
            
            // Handle rate limit errors specifically
            if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('quota')) {
                console.log('Rate limit hit. This is a quota or rate limiting issue.');
                
                // If we've reached max retries, throw a more specific error
                if (retryCount > config.maxRetries) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                }
                
                // Wait longer for rate limit errors
                const delayMs = calculateBackoff(retryCount, config.baseDelay * 2);
                console.log(`Waiting ${Math.round(delayMs / 1000)} seconds before retrying due to rate limit...`);
                await sleep(delayMs);
            } else if (retryCount > config.maxRetries) {
                // We've reached max retries for non-rate-limit errors
                throw error;
            } else {
                // Standard retry for other errors
                const delayMs = calculateBackoff(retryCount);
                console.log(`Retrying in ${Math.round(delayMs / 1000)} seconds...`);
                await sleep(delayMs);
            }
        }
    }
}

/**
 * Summarize text with retry mechanism
 * @param {string} text - Text to summarize
 * @returns {Promise<string>} - Summarized text
 */
async function summarizeText(text) {
    let retryCount = 0;
    
    while (retryCount <= config.maxRetries) {
        try {
            console.log(`Summarizing text of length: ${text.length} characters (attempt ${retryCount + 1}/${config.maxRetries + 1})`);
            
            // Call Groq API for summarization (Llama model)
            const response = await groqClient.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful assistant that summarizes audio transcriptions into concise summaries. Focus on the key points and maintain the original meaning."
                    },
                    {
                        role: "user",
                        content: `Please summarize this audio transcription:\n\n${text}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 300
            });

            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message.content) {
                throw new Error('Empty or invalid response from Groq API');
            }

            const summary = response.choices[0].message.content;
            console.log(`Summary generated: ${summary.substring(0, 50)}...`);
            return summary;
        } catch (error) {
            retryCount++;
            console.error(`Summarization Error (attempt ${retryCount}/${config.maxRetries + 1}):`, error.response?.data || error.message);
            
            // Handle rate limit errors specifically
            if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('quota')) {
                console.log('Rate limit hit. This is a quota or rate limiting issue.');
                
                // If we've reached max retries, throw a more specific error
                if (retryCount > config.maxRetries) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                }
                
                // Wait longer for rate limit errors
                const delayMs = calculateBackoff(retryCount, config.baseDelay * 2);
                console.log(`Waiting ${Math.round(delayMs / 1000)} seconds before retrying due to rate limit...`);
                await sleep(delayMs);
            } else if (retryCount > config.maxRetries) {
                // We've reached max retries for non-rate-limit errors
                throw error;
            } else {
                // Standard retry for other errors
                const delayMs = calculateBackoff(retryCount);
                console.log(`Retrying in ${Math.round(delayMs / 1000)} seconds...`);
                await sleep(delayMs);
            }
        }
    }
}

/**
 * Process audio files with improved error handling and rate limiting
 */
async function processAudioFiles() {
    console.log('Starting audio file processing with enhanced reliability...');
    
    try {
        // Get all records with audio_url but without summary
        const { data: records, error } = await supabase
            .from('refund_requests')
            .select('id, name, audio_url, summary')
            .not('audio_url', 'is', null)
            .not('audio_url', 'eq', '')
            .is('summary', null);

        if (error) {
            throw error;
        }

        console.log(`Found ${records.length} audio files to process`);
        
        // Process records with delay between them to avoid rate limits
        const results = [];
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            
            // Add delay between processing records to avoid rate limits
            if (i > 0) {
                const delayMs = 2000; // 2 seconds between records
                console.log(`Waiting ${delayMs/1000} seconds before processing next record to avoid rate limits...`);
                await sleep(delayMs);
            }
            
            try {
                console.log(`\nProcessing audio for ID: ${record.id}, Name: ${record.name} (${i+1}/${records.length})`);
                console.log(`Audio URL: ${record.audio_url}`);

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
                const filePath = await downloadAudioFile(record.audio_url, record.id);
                
                // Transcribe the audio using OpenAI directly
                const transcription = await transcribeAudio(filePath);
                
                // Add delay between API calls to avoid rate limits
                await sleep(1000);
                
                // Generate summary using Groq
                const summary = await summarizeText(transcription);
                
                // Format the result
                const combinedText = `TRANSCRIPTION:\n${transcription}\n\nSUMMARY:\n${summary}`;

                // Update the database
                const { error: updateError } = await supabase
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
            } catch (error) {
                console.error(`❌ Error processing audio for ID ${record.id}:`, error.message);
                results.push({
                    id: record.id,
                    name: record.name, 
                    success: false,
                    error: error.message
                });
                // Continue with next record even if this one fails
            }
        }

        console.log('\n✅ Audio processing completed');
        return results;
    } catch (error) {
        console.error('❌ Error in processAudioFiles:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// If running directly (not imported as a module)
if (require.main === module) {
    processAudioFiles()
        .then(results => {
            console.log(`Processed ${results.length} audio files.`);
            const successful = results.filter(r => r.success).length;
            console.log(`${successful} successful, ${results.length - successful} failed.`);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
} else {
    // Export for use as a module
    module.exports = { processAudioFiles };
} 