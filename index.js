const SupabaseAgent = require('./mySupAgent');
const readline = require('readline');
const agent = new SupabaseAgent();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const appState = {
  isProcessing: false,
  requestQueue: [],
  recentQueries: []
};
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
  await agent.checkAndPopulateEmployeesTable();
  await agent.checkAndPopulateRefundRequestsTable();
  startApplication();
  } catch (error) {
    console.error('Error initializing database:', error.message);
    console.log('Starting application with limited functionality. Some features may not work correctly.');
    startApplication();
  }
}
function startApplication() {
  console.log('\n🤖 Welcome to Supabaser');
  console.log('Ask me anything...');
  promptForQuery();
}
function promptForQuery() {
  if (appState.isProcessing) {
    return;
  }
  rl.question('> ', async (query) => {
    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      console.log('\nThank you for using Supabaser. Goodbye!');
      rl.close();
      return;
    }
    if (!query.trim()) {
      promptForQuery();
      return;
    }
    appState.recentQueries.push(query);
    if (appState.recentQueries.length > 5) {
      appState.recentQueries.shift(); 
    }
    appState.isProcessing = true;
    console.log('\nProcessing your request...');
    try {
      await processUserQuery(query);
    } catch (error) {
      console.log('❌ I encountered an unexpected error:');
      console.error(error.message);
    } finally {
      appState.isProcessing = false;
      if (appState.requestQueue.length > 0) {
        const nextQuery = appState.requestQueue.shift();
        console.log(`\nNow processing: "${nextQuery}"`);
        try {
          await processUserQuery(nextQuery);
        } catch (error) {
          console.log('❌ Error processing queued request:');
          console.error(error.message);
        } finally {
          appState.isProcessing = false;
          promptForQuery();
        }
      } else {
        promptForQuery();
      }
    }
  });
}
async function processUserQuery(query) {
  try {
    const intent = await agent.determineQueryIntent(query);
    switch (intent.type) {
      case 'database_query':
        await handleDatabaseQuery(query);
        break;
      case 'receipt_processing':
        await handleReceiptProcessing(intent.fileNames);
        break;
      case 'audio_processing':
        await handleAudioProcessing();
        break;
      case 'audio_summary':
        await handleAudioSummary();
        break;
      case 'receipt_url':
        await handleReceiptUrl(intent.fileName);
        break;
      default:
        await handleDatabaseQuery(query);
    }
  } catch (error) {
    if (isReceiptProcessingError(error)) {
      await recoverReceiptProcessing(error);
    } else if (isAudioProcessingError(error)) {
      await recoverAudioProcessing(error);
    } else {
      console.log('❌ I had trouble with that request:');
      console.error(error.message);
      console.log('Please try rephrasing or providing more details.');
    }
  }
}
function isReceiptProcessingError(error) {
  const errorMsg = error.message.toLowerCase();
  return errorMsg.includes('receipt') || 
         errorMsg.includes('image') || 
         errorMsg.includes('storage') || 
         errorMsg.includes('gemini') || 
         errorMsg.includes('vision') ||
         errorMsg.includes('extract') ||
         errorMsg.includes('quota') ||
         errorMsg.includes('rate limit');
}
function isAudioProcessingError(error) {
  const errorMsg = error.message.toLowerCase();
  return errorMsg.includes('audio') || 
         errorMsg.includes('transcribe') || 
         errorMsg.includes('whisper') || 
         errorMsg.includes('openai') ||
         errorMsg.includes('mp3');
}
async function recoverReceiptProcessing(error) {
  const errorMsg = error.message.toLowerCase();
  if (errorMsg.includes('quota') || errorMsg.includes('rate limit') || errorMsg.includes('429')) {
    console.log('⚠️ I hit a rate limit with the image processing API.');
    console.log('Processing receipts with delay to avoid rate limits...');
    try {
      const fileNames = ['refund_req1.png'];
      await agent.processReceiptImagesWithDelay(fileNames, 2000);
      console.log('Successfully processed one receipt with delay. You can process more receipts later.');
    } catch (retryError) {
      console.log('❌ Still experiencing rate limits. Please try again in a few minutes.');
    }
    return;
  }
  if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
    console.log('⚠️ I couldn\'t find some of the receipt images in storage.');
    console.log('Please check that the receipt files are correctly uploaded to Supabase storage.');
    return;
  }
  console.log('There was an issue processing receipt images. Trying with a different approach...');
  try {
    await handleReceiptProcessing(['refund_req1.png']);
  } catch (fallbackError) {
    console.log('❌ Still unable to process receipts. Error details:');
    console.error(fallbackError.message);
  }
}
async function recoverAudioProcessing(error) {
  const errorMsg = error.message.toLowerCase();
  if (errorMsg.includes('quota') || errorMsg.includes('rate limit') || errorMsg.includes('429')) {
    console.log('⚠️ I hit a rate limit with the audio processing API.');
    console.log('Please try again in a few minutes with fewer files.');
    return;
  }
  if (errorMsg.includes('not found') || errorMsg.includes('does not exist') || errorMsg.includes('404')) {
    console.log('⚠️ I couldn\'t find some of the audio files in storage.');
    console.log('Please check that the audio files are correctly uploaded to Supabase storage.');
    return;
  }
  if (errorMsg.includes('authentication') || errorMsg.includes('api key') || errorMsg.includes('unauthorized') || errorMsg.includes('auth')) {
    console.log('⚠️ There\'s an API authentication issue with the audio processing service.');
    console.log('Please check your API keys in the .env file.');
      return;
    }
  if (errorMsg.includes('summary') || errorMsg.includes('summaries')) {
    console.log('I\'ll try to generate audio summaries for you now...');
    try {
      const { data: unprocessedAudio, error: checkError } = await agent.supabase
        .from('refund_requests')
        .select('id, name, audio_url')
        .not('audio_url', 'is', null)
        .not('audio_url', 'eq', '')
        .is('summary', null);
      if (checkError) {
        throw new Error(`Error checking for audio files: ${checkError.message}`);
      }
      if (!unprocessedAudio || unprocessedAudio.length === 0) {
        console.log('No audio files found that need processing. Please check that audio URLs are properly set.');
        return;
      }
      console.log(`Found ${unprocessedAudio.length} audio files. Starting processing now...`);
      await handleAudioProcessing();
    } catch (retryError) {
      console.log('❌ Still unable to process audio files. Error details:');
      console.error(retryError.message);
    }
    return;
  }
  console.log('I ran into an issue processing audio files. Let me try a simpler approach...');
  try {
    console.log('Attempting to process a single audio file...');
    await agent.processAudioFiles(true); 
  } catch (fallbackError) {
    console.log('❌ Still unable to process audio. Error details:');
    console.error(fallbackError.message);
    console.log('This might be an issue with the audio file format or the API service.');
  }
}
async function handleDatabaseQuery(query) {
  try {
    const { data, error, operationType, table, generatedQuery } = await agent.executeNaturalLanguageQuery(query);
      if (error) {
      console.log('❌ I ran into an issue with that database query:');
      console.error(error.message);
      if (generatedQuery) {
        console.log('\nThis was the query I tried to run:');
        console.log(generatedQuery);
      }
      } else {
        if (operationType === 'select') {
          if (data && data.length > 0) {
          console.log(`Found ${data.length} record${data.length > 1 ? 's' : ''}:`);
            console.table(data);
          } else {
          console.log('No matching records found.');
          }
        } else if (operationType === 'update') {
        console.log(`✅ Updated the ${table} data successfully.`);
        } else if (operationType === 'insert') {
        console.log(`✅ Added new data to ${table} successfully.`);
        } else if (operationType === 'delete') {
        console.log(`✅ Removed data from ${table} successfully.`);
        } else {
        console.log(`✅ Operation completed successfully.`);
            if (Array.isArray(data) && data.length > 0) {
              console.table(data);
        }
      }
    }
  } catch (error) {
    if (isReceiptProcessingError(error)) {
      await recoverReceiptProcessing(error);
    } else if (isAudioProcessingError(error)) {
      await recoverAudioProcessing(error);
    } else {
      console.log('❌ I couldn\'t process that database query:');
      console.error(error.message);
    }
  }
}
async function handleReceiptProcessing(fileNames) {
  try {
    console.log(`Analyzing receipt images and updating database...`);
    const results = await agent.processReceiptImagesWithDelay(fileNames, 2000);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    console.log(`\n✅ Analysis complete!`);
    if (successful.length > 0) {
      console.log(`Successfully processed ${successful.length} of ${fileNames.length} receipt(s):`);
      const amountGroups = {};
      successful.forEach(result => {
        const amount = result.amount;
        if (!amountGroups[amount]) {
          amountGroups[amount] = [];
        }
        amountGroups[amount].push(result.fileName);
      });
      Object.entries(amountGroups).forEach(([amount, files]) => {
        if (files.length === 1) {
          console.log(`- Receipt ${files[0]}: $${amount}`);
        } else if (files.length <= 3) {
          console.log(`- Receipts ${files.join(', ')}: $${amount}`);
      } else {
          console.log(`- ${files.length} receipts: $${amount}`);
        }
      });
      console.log(`\nDatabase records have been updated with the extracted amounts.`);
    } else {
      console.log(`No receipts were successfully processed.`);
    }
    if (failed.length > 0) {
      console.log(`\nCouldn't process ${failed.length} receipt(s):`);
      const errorGroups = {};
      failed.forEach(result => {
        let error = result.error;
        if (error.includes('quota')) {
          error = 'API rate limit exceeded';
        } else if (error.includes('not found')) {
          error = 'Receipt not found in storage';
        }
        if (!errorGroups[error]) {
          errorGroups[error] = [];
        }
        errorGroups[error].push(result.fileName);
      });
      Object.entries(errorGroups).forEach(([error, files]) => {
        if (files.length === 1) {
          console.log(`- ${files[0]}: ${error}`);
        } else {
          console.log(`- ${files.length} receipts: ${error}`);
        }
      });
      if (errorGroups['API rate limit exceeded']) {
        console.log('\n⚠️ Hit API rate limits. Try again in a few minutes or process fewer receipts at once.');
      }
    }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    if (error.message.includes('quota') || error.message.includes('rate limit')) {
      console.log('⚠️ API rate limit reached. Please try again later or process fewer receipts at once.');
    }
  }
}
async function handleAudioProcessing() {
  console.log('\nProcessing audio files, please wait...');
  try {
    const results = await agent.processAudioFiles();
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
    console.log(`\n📊 Audio Processing Results:`);
      console.log(`Total files processed: ${results.length}`);
      console.log(`✅ Successfully processed: ${successful.length}`);
      console.log(`❌ Failed to process: ${failed.length}`);
      if (successful.length > 0) {
        console.log('\n✅ Successfully Processed Files:');
        successful.forEach((result, index) => {
          console.log(`${index + 1}. ID: ${result.id}, Name: ${result.name}`);
          if (result.status === 'Already processed') {
            console.log(`   Status: Already had summary`);
          } else {
            console.log(`   Transcription length: ${result.transcriptionLength} characters`);
            console.log(`   Summary length: ${result.summaryLength} characters`);
          }
        });
      }
      if (failed.length > 0) {
        console.log('\n❌ Failed Files:');
        failed.forEach((result, index) => {
          console.log(`${index + 1}. ID: ${result.id}, Name: ${result.name}`);
          console.log(`   Error: ${result.error}`);
        });
      }
    console.log('\n✅ Audio processing complete!');
  } catch (error) {
      console.error(`\n❌ Error processing audio files: ${error.message}`);
  }
}
async function handleAudioSummary() {
  console.log('\nChecking for audio summaries...');
  try {
    const { data: existingSummaries, error: checkError } = await agent.supabase
    .from('refund_requests')
    .select('id, name, summary')
      .not('summary', 'is', null);
    if (checkError) {
      console.error(`❌ Error checking for summaries: ${checkError.message}`);
      return;
    }
    if (!existingSummaries || existingSummaries.length === 0) {
      console.log('No existing summaries found. Checking for audio files to process...');
      const { data: unprocessedAudio, error: unprocessedError } = await agent.supabase
        .from('refund_requests')
        .select('id, name, audio_url')
        .not('audio_url', 'is', null)
        .not('audio_url', 'eq', '')
        .is('summary', null);
      if (unprocessedError) {
        console.error(`❌ Error checking for audio files: ${unprocessedError.message}`);
        return;
      }
      if (!unprocessedAudio || unprocessedAudio.length === 0) {
        console.log('No audio files found to process. Please check that audio URLs are properly set.');
        return;
      }
      console.log(`Found ${unprocessedAudio.length} audio files that need processing. Starting audio processing now...`);
      await handleAudioProcessing();
      const { data: newSummaries, error: newError } = await agent.supabase
        .from('refund_requests')
        .select('id, name, summary')
        .not('summary', 'is', null);
      if (newError) {
        console.error(`❌ Error fetching new summaries: ${newError.message}`);
        return;
      }
      if (!newSummaries || newSummaries.length === 0) {
        console.log('No summaries were generated. There may have been issues processing the audio files.');
        return;
      }
      console.log(`\nGenerated ${newSummaries.length} new summaries:\n`);
      newSummaries.forEach((record, index) => {
        console.log(`--- Summary ${index + 1} ---`);
        console.log(`🆔 ID: ${record.id}`);
        console.log(`👤 Name: ${record.name}`);
        let summaryText = record.summary;
        if (summaryText && summaryText.includes('SUMMARY:')) {
          summaryText = summaryText.split('SUMMARY:')[1].trim();
        }
        console.log(`📝 Summary: ${summaryText}`);
        console.log('------------------\n');
      });
      return;
    }
    console.log(`\nFound ${existingSummaries.length} audio summaries:\n`);
    existingSummaries.forEach((record, index) => {
      console.log(`--- Summary ${index + 1} ---`);
      console.log(`🆔 ID: ${record.id}`);
      console.log(`👤 Name: ${record.name}`);
      let summaryText = record.summary;
      if (summaryText && summaryText.includes('SUMMARY:')) {
        summaryText = summaryText.split('SUMMARY:')[1].trim();
      }
      console.log(`📝 Summary: ${summaryText}`);
      console.log('------------------\n');
    });
  } catch (error) {
    console.error(`❌ Error fetching summaries: ${error.message}`);
  }
}
async function handleReceiptUrl(fileName) {
  try {
    const url = await agent.getReceiptUrl(fileName);
    console.log(`\n🧾 Public URL for ${fileName}:`);
    console.log(url);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}
rl.on('close', () => {
  process.exit(0);
});
initializeDatabase(); 