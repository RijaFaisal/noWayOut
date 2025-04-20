# GenAI-NoWayOut

An intelligent API-powered smart assistant that understands and manipulates a Supabase-hosted database and storage using natural language commands.Itcombines natural language processing, audio transcription, and image analysis to streamline refund processing workflows.

## Core Features

### Natural Language Database Queries
The SupabaseAgent class allows you to query databases using natural language:

- **Query Translation**: Converts natural language queries to Supabase operations
- **Multiple Operations**: Supports SELECT, INSERT, UPDATE, and DELETE operations
- **Intent Recognition**: Automatically identifies the user's intent from queries
- **Table Detection**: Intelligently determines the target table based on query context

### Audio Processing
Process audio files with advanced AI capabilities:

- **Automatic Transcription**: Uses OpenAI Whisper to transcribe audio recordings
- **AI Summarization**: Summarizes transcriptions using Llama 3 (via Groq API)
- **Efficient Processing**: Manages multiple files with rate limiting and retries
- **Error Handling**: Robust handling of network and API errors

### Receipt Image Analysis
Analyze receipt images to extract refund information:

- **Total Extraction**: Uses Google Gemini Vision AI to identify total amounts
- **Database Integration**: Updates Supabase database with extracted information
- **Batch Processing**: Can process multiple receipts sequentially with delay

## Technologies Used

- **Supabase**: Database and storage backend
- **OpenAI Whisper**: Audio transcription API
- **Llama 3 (via Groq)**: Large language model for summarization and query processing
- **Gemini Vision AI**: Image analysis for receipt processing

## Repository Organization

```
GenAI-NoWayOut/
├── api.js                 # API server handling HTTP endpoints
├── serve.js               # Web server for the UI 
├── index.js               # Main application entry point
├── mySupAgent.js          # Core agent with AI processing capabilities
├── process_audio.js       # Audio processing implementation
├── refund_audio_processor.js # Specialized refund audio processor
├── processReceipts.js     # Receipt processing functionality
├── functions/             # Utility functions
├── temp/                  # Temporary directory for downloaded files
└── refund-requests.html   # Dashboard for viewing refund requests
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
   Create a `.env` file with:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_key
   OPENAI_API_KEY=your_openai_api_key
   GROQ_API_KEY=your_groq_api_key
   GEMINI_API_KEY=your_gemini_api_key
   ```

## Usage Examples

### Natural Language Query Examples

```javascript
// Get all employees
agent.executeNaturalLanguageQuery("Get all employees");

// Update a refund request amount
agent.executeNaturalLanguageQuery("Update refund request with ID 3 to have amount 125.75");

// Add a new employee
agent.executeNaturalLanguageQuery("Add a new employee named John Doe, age 30, salary 50000");

// Process audio files
agent.executeNaturalLanguageQuery("Process all audio files");

// Analyze receipt images
agent.executeNaturalLanguageQuery("Process receipts 1 through 5");
```

### Using the API

The API endpoints allow you to:

1. **Process Natural Language Queries**:
   ```
   POST /api/query
   Body: { "query": "Get all refund requests" }
   ```

2. **Fetch Refund Requests**:
   ```
   GET /api/refund-requests
   ```

3. **View the Dashboard**:
   ```
   GET /refund-requests
   ```

## Dashboard View

The application includes a dashboard for viewing refund requests at `/refund-requests`, which displays:

- Customer information
- Refund amounts
- Audio transcriptions and summaries
- Links to receipt images
- Processing status

## Running the Application

1. Start the API server:
   ```bash
   npm run api
   ```

2. Start the web server:
   ```bash
   npm run serve
   ```

3. Process refund audio files:
   ```bash
   npm run process-refund-audio
   ```

4. Process receipt images:
   ```bash
   npm run process-receipts
   ```

## Error Handling and Resilience

The SupabaseAgent includes robust error handling:

- Automatic retries for API calls
- Fallback mechanisms for API failures
- Detailed logging for troubleshooting
- Rate limiting to prevent API throttling

## License

ISC 