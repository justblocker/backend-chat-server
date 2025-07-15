const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const assistantId = process.env.ASSISTANT_ID;
  const { message, threadId } = req.body;

  try {
    let thread;
    if (!threadId) {
      thread = await openai.beta.threads.create();
      console.log('New thread created:', thread.id);
    } else {
      thread = { id: threadId };
      console.log('Using existing thread:', thread.id);
    }

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId
    });
    console.log('Run created:', run.id);

    console.log('Retrieving initial run status for thread:', thread.id, 'run:', run.id);
    console.log('Debug - thread object:', thread);
    console.log('Debug - run object:', run);
    
    // Validate IDs before making the API call
    if (!thread.id) {
      throw new Error('Thread ID is undefined');
    }
    if (!run.id) {
      throw new Error('Run ID is undefined');
    }
    
    console.log('About to call retrieve with:', 'threadId:', thread.id, 'runId:', run.id);
    
    // Extract IDs as strings to ensure no reference issues
    const threadIdStr = String(thread.id);
    const runIdStr = String(run.id);
    
    console.log('String versions:', 'threadId:', threadIdStr, 'runId:', runIdStr);
    
    // Use raw HTTP approach to bypass SDK parameter issue
    const response = await fetch(`https://api.openai.com/v1/threads/${threadIdStr}/runs/${runIdStr}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    let runStatus = await response.json();
    while (runStatus.status !== 'completed') {
      console.log('Run status:', runStatus.status);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Polling run status for thread:', threadIdStr, 'run:', runIdStr);
      
      // Use raw HTTP for polling as well
      const pollResponse = await fetch(`https://api.openai.com/v1/threads/${threadIdStr}/runs/${runIdStr}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      
      if (!pollResponse.ok) {
        throw new Error(`HTTP error during polling! status: ${pollResponse.status}`);
      }
      
      runStatus = await pollResponse.json();
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    console.log('Messages retrieved:', messages.data);
    const latestMessage = messages.data[0].content[0].text.value;

    res.json({ response: latestMessage, threadId: thread.id });
  } catch (error) {
    console.error('Error in /chat endpoint:', error);
    res.status(500).json({ error: error.message });
  }
};