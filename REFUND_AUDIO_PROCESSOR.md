# Refund Audio Processor

This module processes audio recordings from refund requests in the database. It performs the following operations:

1. **Fetches data**: Queries the `refund_requests` table for rows that have an `audio_url` but no `summary`.
2. **Downloads audio**: Downloads the audio file from each URL.
3. **Transcribes content**: Uses OpenAI Whisper to transcribe the speech to text.
4. **Generates summary**: Uses Llama 3 (via Groq API) to generate a concise summary of what the person described in the audio.
5. **Updates database**: Updates the `summary` field in the database with both the transcription and summary.

## Requirements

The following environment variables need to be set in your `.env` file:

```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
GROQ_API_KEY=your_groq_api_key
```

## Database Schema

The script expects the `refund_requests` table to have the following fields:
- `id` (primary key)
- `name` (customer name)
- `audio_url` (URL to the audio recording)
- `summary` (field to store transcription and summary results)

## Running the Processor

Run the script with:

```bash
npm run process-refund-audio
```

## Process Flow

1. Script fetches all refund requests with audio URLs but no summary
2. For each request:
   - Downloads the audio file
   - Transcribes it with Whisper
   - Summarizes with Llama 3
   - Updates the database
   - Cleans up temporary files
   - Adds delays between operations to avoid API rate limits

## Error Handling

- The script includes error handling for API rate limits and network issues
- If one record fails, the script continues with the next one
- Errors are logged to the console

## Fallbacks

- If OpenAI rate limits are hit, a placeholder transcription is used
- If Groq rate limits are hit, a placeholder summary is used

## Output Format

The summary field in the database will contain:
```
TRANSCRIPTION:
[Full text transcription from audio]

SUMMARY:
[Concise summary of the key points]
``` 