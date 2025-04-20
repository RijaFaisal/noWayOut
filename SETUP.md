# Setup Guide for GenAI-NoWayOut

This guide provides detailed steps to set up the GenAI-NoWayOut project on your local machine.

## System Requirements

- Node.js (version 14.0.0 or higher)
- npm (version 6.0.0 or higher)
- Adequate disk space (at least 1GB for dependencies and temporary files)
- Internet connection for API access

## Creating Required Accounts

Before setting up the project, you'll need to create accounts and get API keys from the following services:

1. **Supabase**:
   - Go to [Supabase](https://supabase.com/) and sign up for an account
   - Create a new project
   - Get your project URL and anon key from the API settings

2. **OpenAI**:
   - Go to [OpenAI](https://platform.openai.com/) and sign up for an account
   - Generate an API key from your account dashboard

3. **Groq**:
   - Go to [Groq](https://console.groq.com/) and sign up for an account
   - Generate an API key from your account settings

4. **Google AI Studio (for Gemini)**:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey) and sign up
   - Create an API key for Gemini

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/GenAI-NoWayOut.git
cd GenAI-NoWayOut
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory with the following content:

```
# Supabase credentials
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI API key
OPENAI_API_KEY=your_openai_api_key

# Groq API key
GROQ_API_KEY=your_groq_api_key

# Gemini API key
GEMINI_API_KEY=your_gemini_api_key
```

Replace the placeholder values with your actual API keys and credentials.

### 4. Set Up Supabase Database

1. In your Supabase project, create a table called `refund_requests` with the following columns:

   | Column Name | Type | Description |
   |-------------|------|-------------|
   | id | int8 | Primary key, auto-increment |
   | name | text | Customer name |
   | amount | numeric | Refund amount |
   | image_url | text | URL to receipt image |
   | audio_url | text | URL to audio recording |
   | summary | text | Transcription and summary |
   | created_at | timestamptz | Creation timestamp |

2. Enable Storage:
   - Create a bucket called `receipts.nowayout` for receipt images
   - Create a bucket called `hackfest-resources` for audio files
   - Set appropriate permissions for these buckets

3. Run the database setup script:
   ```bash
   npm run setup-db
   ```

### 5. Create Required Directories

Create a temporary directory for file downloads:

```bash
mkdir -p temp
```

## Testing the Installation

1. Test the image URL functionality:
   ```bash
   npm run test-image
   ```

2. Test the application:
   ```bash
   npm start
   ```

## Running the Application

### Process Refund Audio Files

To process audio files from refund requests:

```bash
npm run process-refund-audio
```

This will:
- Fetch records from the database with audio_url but no summary
- Download and process audio files
- Transcribe and summarize the content
- Update the database

### Process Receipt Images

To process receipt images and extract amounts:

```bash
npm run process-receipts
```

### Start the Web Server

To start the web server for the UI:

```bash
npm run serve
```

The server will be available at http://localhost:3000 by default.

### Start the API Server

To start the API server:

```bash
npm run api
```

The API will be available at http://localhost:8000 by default.

## Troubleshooting

### Common Issues

1. **API Keys Not Working**:
   - Verify that your API keys are correct and have the necessary permissions
   - Check if the services are available and your account is in good standing

2. **Database Connection Issues**:
   - Verify your Supabase URL and anon key
   - Check if your IP is allowed to access the Supabase project

3. **Audio Processing Errors**:
   - Check if OpenAI Whisper API is available
   - Verify that audio files are accessible at the provided URLs

4. **Receipt Processing Errors**:
   - Check if Gemini API is working
   - Verify that image files are accessible and in a supported format

### Getting Help

If you encounter issues not covered in this guide, please:

1. Check the console logs for specific error messages
2. Look for similar issues in the repository's issue tracker
3. Create a new issue with detailed information about the problem 