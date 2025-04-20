require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Service to analyze receipt images using Google's Gemini API with enhanced reliability
 */
class ImageAnalyzer {
  constructor() {
    // Initialize Gemini API client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    // Settings for error handling and retries
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
  }

  /**
   * Sleep/delay function for rate limiting
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after the delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch an image from a URL and convert it to base64, with retry mechanism
   * @param {string} imageUrl - URL of the image to analyze
   * @returns {Promise<string>} - Base64 encoded image
   */
  async fetchImageAsBase64(imageUrl) {
    let currentRetry = 0;
    
    while (currentRetry <= this.maxRetries) {
      try {
        // Fix double slash issue in URL if present
        const fixedUrl = imageUrl.replace(/\/+/g, '/').replace('https:/', 'https://');
        console.log(`Fetching image from URL: ${fixedUrl}`);
        
        // Use a direct HTTP request instead of fetch
        const https = require('https');
        
        return new Promise((resolve, reject) => {
          const req = https.get(fixedUrl, (response) => {
            if (response.statusCode === 429) {
              reject(new Error(`API rate limit reached (429): Try again later`));
              return;
            }
            
            if (response.statusCode !== 200) {
              reject(new Error(`Failed to fetch image: ${response.statusCode} ${response.statusMessage}`));
              return;
            }
            
            console.log(`Response status: ${response.statusCode}`);
            console.log(`Content type: ${response.headers['content-type']}`);
            
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
              const buffer = Buffer.concat(chunks);
              console.log(`Data received: ${buffer.length} bytes`);
              
              if (buffer.length === 0) {
                reject(new Error('Empty response received when fetching image'));
                return;
              }
              
              const base64Data = buffer.toString('base64');
              resolve(base64Data);
            });
          });
          
          // Set timeout for the request
          req.setTimeout(10000, () => {
            req.abort();
            reject(new Error('Request timed out when fetching image'));
          });
          
          req.on('error', (err) => {
            console.error('Error during HTTP request:', err);
            reject(err);
          });
        });
      } catch (error) {
        currentRetry++;
        console.error(`Error fetching image (attempt ${currentRetry}/${this.maxRetries + 1}):`, error.message);
        
        // If it's a rate limit error or we've reached max retries, throw the error
        if (error.message.includes('429') || error.message.includes('rate limit') || currentRetry > this.maxRetries) {
          throw error;
        }
        
        // Otherwise wait and retry
        console.log(`Retrying in ${this.retryDelay / 1000} seconds...`);
        await this.sleep(this.retryDelay);
        // Increase delay for next retry (exponential backoff)
        this.retryDelay *= 1.5;
      }
    }
    
    throw new Error(`Failed to fetch image after ${this.maxRetries + 1} attempts`);
  }

  /**
   * Analyze a receipt image to extract the total amount with improved error handling
   * @param {string} imageUrl - URL of the receipt image
   * @returns {Promise<number>} - The extracted total amount
   */
  async extractTotalFromReceipt(imageUrl) {
    let currentRetry = 0;
    
    while (currentRetry <= this.maxRetries) {
      try {
        // Fetch and encode the image
        const base64Image = await this.fetchImageAsBase64(imageUrl);
        console.log('Successfully encoded image to base64');
        
        // Prepare the image part for the Gemini model
        const imagePart = {
          inlineData: {
            data: base64Image,
            mimeType: 'image/jpeg', // Default MIME type
          },
        };
        
        // Create prompt for the model - improved prompt for better extraction
        const prompt = "Please analyze this receipt image and extract ONLY the total amount. Return just the numeric value (e.g., 125.99) with no additional text, currency symbols, or explanations. Look for words like 'Total', 'Amount Due', 'Balance', or similar indicators.";
        
        console.log('Sending image to Gemini for analysis...');
        
        // Generate content with Gemini Vision model
        const result = await this.model.generateContent([prompt, imagePart]);
        
        if (!result || !result.response) {
          throw new Error('Empty response from Gemini API');
        }
        
        const text = result.response.text().trim();
        console.log(`Raw Gemini response: "${text}"`);
        
        if (!text) {
          throw new Error('Empty text response from Gemini API');
        }
        
        // Try to extract a numeric value from the response
        const amountMatch = text.match(/\d+(\.\d+)?/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[0]);
          console.log(`Extracted amount from regex: ${amount}`);
          return amount;
        }
        
        // If no clear number pattern found but response looks like a number
        if (!isNaN(parseFloat(text))) {
          const amount = parseFloat(text);
          console.log(`Extracted amount from direct parse: ${amount}`);
          return amount;
        }
        
        throw new Error('Could not extract a valid total amount from the receipt');
      } catch (error) {
        currentRetry++;
        console.error(`Error analyzing receipt (attempt ${currentRetry}/${this.maxRetries + 1}):`, error.message);
        
        // Handle rate limit errors specifically
        if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('rate limit')) {
          console.log('Rate limit hit. This is a quota or rate limiting issue.');
          
          // If we've reached max retries, throw a more specific error
          if (currentRetry > this.maxRetries) {
            throw new Error('API rate limit exceeded. Please try again later with fewer requests.');
          }
          
          // Wait longer for rate limit errors
          const rateLimitDelay = this.retryDelay * 2;
          console.log(`Waiting ${rateLimitDelay / 1000} seconds before retrying due to rate limit...`);
          await this.sleep(rateLimitDelay);
        } else if (currentRetry > this.maxRetries) {
          // We've reached max retries for non-rate-limit errors
          throw error;
        } else {
          // Standard retry for other errors
          console.log(`Retrying in ${this.retryDelay / 1000} seconds...`);
          await this.sleep(this.retryDelay);
        }
        
        // Increase delay for next retry (exponential backoff)
        this.retryDelay *= 1.5;
      }
    }
    
    throw new Error(`Failed to analyze receipt after ${this.maxRetries + 1} attempts`);
  }
}

module.exports = ImageAnalyzer; 