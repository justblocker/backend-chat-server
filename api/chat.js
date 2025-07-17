const { OpenAI } = require('openai');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
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
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    try {
      let thread;
      if (!threadId || threadId === 'undefined') {
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
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      while (runStatus.status !== 'completed') {
        console.log('Run status:', runStatus.status);
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Polling run status for thread:', thread.id, 'run:', run.id);
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      }

      const messages = await openai.beta.threads.messages.list(thread.id);
      console.log('Full messages data:', messages.data.map(m => ({ id: m.id, role: m.role, content: m.content[0]?.text?.value || 'Non-text content' }))); // Enhanced logging for debug
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