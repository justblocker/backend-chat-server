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
    if (!threadId || threadId === 'undefined') {
      res.status(400).json({ error: 'Valid threadId is required' });
      return;
    }

    try {
      const messages = await openai.beta.threads.messages.list(threadId);
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
      if (!threadId || threadId === 'undefined') {
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
        thread = { id: threadId };
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
      
      let runStatus;
      try {
        console.log('Making retrieve call with threadId:', thread.id, 'runId:', run.id);
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
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
        
        try {
          console.log('Making polling retrieve call with threadId:', thread.id, 'runId:', run.id);
          runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
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