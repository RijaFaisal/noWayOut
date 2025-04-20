require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
class ImageAnalyzer {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    this.maxRetries = 3;
    this.retryDelay = 2000; 
  }
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async fetchImageAsBase64(imageUrl) {
    let currentRetry = 0;
    while (currentRetry <= this.maxRetries) {
      try {
        const fixedUrl = imageUrl.replace(/\/+/g, '/').replace('https:/', 'https:
        console.log(`Fetching image from URL: ${fixedUrl}`);
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
        if (error.message.includes('429') || error.message.includes('rate limit') || currentRetry > this.maxRetries) {
          throw error;
        }
        console.log(`Retrying in ${this.retryDelay / 1000} seconds...`);
        await this.sleep(this.retryDelay);
        this.retryDelay *= 1.5;
      }
    }
    throw new Error(`Failed to fetch image after ${this.maxRetries + 1} attempts`);
  }
  async extractTotalFromReceipt(imageUrl) {
    let currentRetry = 0;
    while (currentRetry <= this.maxRetries) {
      try {
        const base64Image = await this.fetchImageAsBase64(imageUrl);
        console.log('Successfully encoded image to base64');
        const imagePart = {
          inlineData: {
            data: base64Image,
            mimeType: 'image/jpeg', 
          },
        };
        const prompt = "Please analyze this receipt image and extract ONLY the total amount. Return just the numeric value (e.g., 125.99) with no additional text, currency symbols, or explanations. Look for words like 'Total', 'Amount Due', 'Balance', or similar indicators.";
        console.log('Sending image to Gemini for analysis...');
        const result = await this.model.generateContent([prompt, imagePart]);
        if (!result || !result.response) {
          throw new Error('Empty response from Gemini API');
        }
        const text = result.response.text().trim();
        console.log(`Raw Gemini response: "${text}"`);
        if (!text) {
          throw new Error('Empty text response from Gemini API');
        }
        const amountMatch = text.match(/\d+(\.\d+)?/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[0]);
          console.log(`Extracted amount from regex: ${amount}`);
          return amount;
        }
        if (!isNaN(parseFloat(text))) {
          const amount = parseFloat(text);
          console.log(`Extracted amount from direct parse: ${amount}`);
          return amount;
        }
        throw new Error('Could not extract a valid total amount from the receipt');
      } catch (error) {
        currentRetry++;
        console.error(`Error analyzing receipt (attempt ${currentRetry}/${this.maxRetries + 1}):`, error.message);
        if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('rate limit')) {
          console.log('Rate limit hit. This is a quota or rate limiting issue.');
          if (currentRetry > this.maxRetries) {
            throw new Error('API rate limit exceeded. Please try again later with fewer requests.');
          }
          const rateLimitDelay = this.retryDelay * 2;
          console.log(`Waiting ${rateLimitDelay / 1000} seconds before retrying due to rate limit...`);
          await this.sleep(rateLimitDelay);
        } else if (currentRetry > this.maxRetries) {
          throw error;
        } else {
          console.log(`Retrying in ${this.retryDelay / 1000} seconds...`);
          await this.sleep(this.retryDelay);
        }
        this.retryDelay *= 1.5;
      }
    }
    throw new Error(`Failed to analyze receipt after ${this.maxRetries + 1} attempts`);
  }
}
module.exports = ImageAnalyzer; 