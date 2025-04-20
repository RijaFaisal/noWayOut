# GenAI-NoWayOut

A Node.js application that processes refund requests using various AI tools including OpenAI Whisper for audio transcription, Llama (via Groq) for summarization, and Gemini for image analysis.

## Repository Organization

```
GenAI-NoWayOut/
├── api.js                 # API server for handling HTTP requests
├── serve.js               # Web server for the UI
├── index.js               # Main application entry point
├── mySupAgent.js          # Supabase agent for database operations
├── process_audio.js       # Legacy audio processing script
├── refund_audio_processor.js # New refund request audio processor
├── processReceipts.js     # Script for processing receipt images
├── functions/             # Utility functions directory
│   └── audio_processor.js # Audio processing utilities
├── temp/                  # Temporary directory for downloaded files
├── test-fetch.js          # Testing utility for fetch operations
├── test-imageUrl.js       # Testing utility for image URLs
└── node_modules/          # Node.js dependencies
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- Supabase account
- API keys for OpenAI, Groq, and Google Gemini

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/GenAI-NoWayOut.git
   cd GenAI-NoWayOut
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```
   # Supabase credentials
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_key
   
   # OpenAI API key
   OPENAI_API_KEY=your_openai_api_key
   
   # Groq API key (for Llama models)
   GROQ_API_KEY=your_groq_api_key
   
   # Gemini API key
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. Create required database tables:
   ```bash
   npm run setup-db
   ```

## Database Schema

The main table is `refund_requests` with the following columns:

- `id` (primary key): Unique identifier for each request
- `name`: Customer name
- `audio_url`: URL to the audio recording of the refund request
- `image_url`: URL to the receipt image
- `amount`: Refund amount (extracted from receipt)
- `summary`: Transcription and summary of the audio content

## Available Scripts

- `npm start`: Start the main application
- `npm run process-audio`: Process audio files using the legacy script
- `npm run process-refund-audio`: Process refund request audio files with the new processor
- `npm run process-receipts`: Process receipt images to extract refund amounts
- `npm run serve`: Start the web server for UI
- `npm run api`: Start the API server
- `npm run test-image`: Test image URL functionality

## Custom Tools and Scripts

### 1. Refund Audio Processor

The `refund_audio_processor.js` script processes audio files from refund requests:

- Fetches records from the database with audio_url but no summary
- Downloads audio files from URLs
- Transcribes audio using OpenAI Whisper
- Summarizes content using Llama 3 via Groq API
- Updates the database with both transcription and summary
- Includes robust error handling, retries, and fallbacks

Usage:
```bash
npm run process-refund-audio
```

For more details, see [REFUND_AUDIO_PROCESSOR.md](REFUND_AUDIO_PROCESSOR.md).

### 2. Receipt Image Processor

The `processReceipts.js` script analyzes receipt images to extract refund amounts:

- Fetches receipts from storage
- Uses Google's Gemini Vision AI to extract total amounts
- Updates the database with the amount and image URL

Usage:
```bash
npm run process-receipts
```

### 3. API Integration

The application includes API endpoints for:

- Processing refund requests
- Fetching refund data
- Managing images and audio files

## Error Handling and Resilience

- All scripts include robust error handling
- Retry mechanisms with exponential backoff
- Fallback mechanisms for API failures
- Detailed logging for troubleshooting

## Development Guidelines

1. Run scripts with the `--no-deprecation` flag to suppress Node.js deprecation warnings
2. Add proper error handling for all API calls
3. Use exponential backoff for retries
4. Clean up temporary files after processing

## License

ISC 