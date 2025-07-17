const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log('API Key:', process.env.OPENAI_API_KEY ? 'set' : 'unset');
  console.log('Assistant ID:', process.env.ASSISTANT_ID ? 'set' : 'unset');

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY environment variable is not set' });
    return;
  }

  if (!process.env.ASSISTANT_ID) {
    res.status(500).json({ error: 'ASSISTANT_ID environment variable is not set' });
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const assistantId = process.env.ASSISTANT_ID;

  if (req.method === 'GET') {
    const { threadId } = req.query;
    console.log('GET request for history - threadId:', JSON.stringify(threadId), 'type:', typeof threadId);
    
    if (!threadId || threadId === 'undefined' || threadId === 'null') {
      res.status(400).json({ error: 'Valid threadId is required' });
      return;
    }

    try {
      console.log('Fetching messages for thread:', threadId);
      const messages = await openai.beta.threads.messages.list(threadId);
      console.log('Messages fetched successfully, count:', messages.data.length);
      const history = messages.data.map(msg => ({
        role: msg.role,
        content: msg.content[0].text.value
      })).reverse(); // Reverse to chronological order (oldest first)
      res.json({ history });
    } catch (error) {
      console.error('Error fetching history:', error);
      res.status(500).json({ error: error.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const { message, threadId } = req.body;
    console.log('POST request received - message:', message ? 'present' : 'missing', 'threadId:', JSON.stringify(threadId), 'type:', typeof threadId);
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    try {
      let thread;
      if (!threadId || threadId === 'undefined' || threadId === 'null') {
        console.log('Creating new thread because threadId is:', JSON.stringify(threadId));
        try {
          thread = await openai.beta.threads.create();
          console.log('New thread created:', thread.id);
          console.log('Thread object:', JSON.stringify(thread));
        } catch (createError) {
          console.error('Error creating thread:', createError);
          throw createError;
        }
      } else {
        console.log('Using existing threadId:', JSON.stringify(threadId));
        
        // Validate the existing threadId format
        if (typeof threadId !== 'string' || !threadId.startsWith('thread_')) {
          throw new Error(`Invalid existing thread ID format: ${threadId} (expected string starting with 'thread_')`);
        }
        
        // Test that the thread actually exists before proceeding
        console.log('Validating existing thread exists...');
        try {
          const existingThread = await openai.beta.threads.retrieve(threadId);
          console.log('Existing thread validation successful:', !!existingThread);
          thread = { id: threadId };
        } catch (threadValidationError) {
          console.error('Failed to validate existing thread:', threadValidationError.message);
          throw new Error(`Cannot access existing thread ${threadId}: ${threadValidationError.message}`);
        }
        
        console.log('Using existing thread:', thread.id);
      }

      if (!thread || !thread.id) {
        throw new Error('Thread ID is undefined after creation');
      }

      console.log('About to create message with thread ID:', thread.id);
      try {
        await openai.beta.threads.messages.create(thread.id, {
          role: 'user',
          content: message
        });
      } catch (msgError) {
        console.error('Error creating message:', msgError);
        throw msgError;
      }

      let run;
      console.log('About to create run with thread ID:', thread.id);
      try {
        run = await openai.beta.threads.runs.create(thread.id, {
          assistant_id: assistantId
        });
        console.log('Run created:', run.id);
        console.log('Full run object:', JSON.stringify(run, null, 2));
      } catch (runError) {
        console.error('Error creating run:', runError);
        throw runError;
      }

      console.log('Retrieving initial run status for thread:', thread.id, 'run:', run.id);
      console.log('Types - thread.id type:', typeof thread.id, 'run.id type:', typeof run.id);
      console.log('Values - thread.id:', JSON.stringify(thread.id), 'run.id:', JSON.stringify(run.id));
      
      if (!thread.id || !run.id) {
        throw new Error(`Missing IDs - thread.id: ${thread.id}, run.id: ${run.id}`);
      }
      
      // Validate ID formats
      if (typeof thread.id !== 'string' || !thread.id.startsWith('thread_')) {
        throw new Error(`Invalid thread ID format: ${thread.id} (expected string starting with 'thread_')`);
      }
      
      if (typeof run.id !== 'string' || !run.id.startsWith('run_')) {
        throw new Error(`Invalid run ID format: ${run.id} (expected string starting with 'run_')`);
      }
      
      let runStatus;
      try {
        // Store in separate variables and ensure they're clean strings
        const currentThreadId = String(thread.id).trim();
        const currentRunId = String(run.id).trim();
        console.log('Making retrieve call with threadId:', currentThreadId, 'runId:', currentRunId);
        console.log('About to call: openai.beta.threads.runs.retrieve(', currentThreadId, ',', currentRunId, ')');
        // Debug the OpenAI client structure
        console.log('OpenAI client check:', {
          hasOpenAI: !!openai,
          hasBeta: !!openai?.beta,
          hasThreads: !!openai?.beta?.threads,
          hasRuns: !!openai?.beta?.threads?.runs,
          hasRetrieve: !!openai?.beta?.threads?.runs?.retrieve
        });
        
        console.log('Cleaned ID lengths - threadId:', currentThreadId.length, 'runId:', currentRunId.length);
        console.log('ID character codes - threadId first 5 chars:', currentThreadId.slice(0,5).split('').map(c => c.charCodeAt(0)));
        console.log('ID character codes - runId first 5 chars:', currentRunId.slice(0,5).split('').map(c => c.charCodeAt(0)));
        
        // Test that the OpenAI client is working by retrieving the thread first
        console.log('Testing OpenAI client by retrieving thread...');
        try {
          const testThread = await openai.beta.threads.retrieve(currentThreadId);
          console.log('Thread retrieval successful, thread exists:', !!testThread);
        } catch (testError) {
          console.error('Failed to retrieve thread:', testError.message);
          throw new Error(`Cannot retrieve thread ${currentThreadId}: ${testError.message}`);
        }
        
        // Try calling the method with explicit parameter names
        console.log('Calling retrieve with explicit parameters:', { threadId: currentThreadId, runId: currentRunId });
        
        // Use runs.list as primary method since retrieve has parameter issues
        console.log('Using runs.list as primary method...');
        const runsList = await openai.beta.threads.runs.list(currentThreadId);
        const targetRun = runsList.data.find(r => r.id === currentRunId);
        if (!targetRun) {
          throw new Error(`Run ${currentRunId} not found in thread ${currentThreadId}`);
        }
        runStatus = targetRun;
        console.log('Primary runs.list approach successful, found run status:', runStatus.status);
      } catch (retrieveError) {
        console.error('Error in initial retrieve:', retrieveError);
        throw retrieveError;
      }
      while (runStatus.status !== 'completed' && runStatus.status !== 'failed' && runStatus.status !== 'cancelled') {
        console.log('Run status:', runStatus.status);
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Polling run status for thread:', thread.id, 'run:', run.id);
        console.log('Polling - Types - thread.id type:', typeof thread.id, 'run.id type:', typeof run.id);
        console.log('Polling - Values - thread.id:', JSON.stringify(thread.id), 'run.id:', JSON.stringify(run.id));
        
        if (!thread.id || !run.id) {
          throw new Error(`Missing IDs in polling - thread.id: ${thread.id}, run.id: ${run.id}`);
        }
        
        // Validate ID formats in polling
        if (typeof thread.id !== 'string' || !thread.id.startsWith('thread_')) {
          throw new Error(`Invalid thread ID format in polling: ${thread.id} (expected string starting with 'thread_')`);
        }
        
        if (typeof run.id !== 'string' || !run.id.startsWith('run_')) {
          throw new Error(`Invalid run ID format in polling: ${run.id} (expected string starting with 'run_')`);
        }
        
        try {
          // Store in separate variables and ensure they're clean strings
          const currentThreadId = String(thread.id).trim();
          const currentRunId = String(run.id).trim();
          console.log('Making polling retrieve call with threadId:', currentThreadId, 'runId:', currentRunId);
          console.log('About to call polling: openai.beta.threads.runs.retrieve(', currentThreadId, ',', currentRunId, ')');
          console.log('Polling - calling retrieve with explicit parameters:', { threadId: currentThreadId, runId: currentRunId });
          
          // Use runs.list as primary method for polling too
          console.log('Using runs.list as primary method for polling...');
          const runsList = await openai.beta.threads.runs.list(currentThreadId);
          const targetRun = runsList.data.find(r => r.id === currentRunId);
          if (!targetRun) {
            throw new Error(`Run ${currentRunId} not found in thread ${currentThreadId} during polling`);
          }
          runStatus = targetRun;
          console.log('Polling runs.list approach successful, found run status:', runStatus.status);
        } catch (pollError) {
          console.error('Error in polling retrieve:', pollError);
          throw pollError;
        }
      }

      if (runStatus.status === 'failed') {
        throw new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      if (runStatus.status === 'cancelled') {
        throw new Error('Run was cancelled');
      }

      let messages;
      try {
        messages = await openai.beta.threads.messages.list(thread.id);
        console.log('Full messages data:', messages.data.map(m => ({ id: m.id, role: m.role, content: m.content[0]?.text?.value || 'Non-text content' })));
      } catch (listError) {
        console.error('Error listing messages:', listError);
        throw listError;
      }
      const latestAssistantMessage = messages.data.find(msg => msg.role === 'assistant');
      const latestMessage = latestAssistantMessage ? latestAssistantMessage.content[0].text.value : 'No response from assistant';

      res.json({ response: latestMessage, threadId: thread.id });
    } catch (error) {
      console.error('Error in /chat endpoint:', error);
      res.status(500).json({ error: error.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
};