const express = require('express');
const { OpenAI } = require('openai');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // Use environment variable
const assistantId = process.env.ASSISTANT_ID;

app.post('/chat', async (req, res) => {
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
    let runStatus = await openai.beta.threads.runs.retrieve(run.id, { threadId: thread.id });
    while (runStatus.status !== 'completed') {
      console.log('Run status:', runStatus.status);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Polling run status for thread:', thread.id, 'run:', run.id);
      runStatus = await openai.beta.threads.runs.retrieve(run.id, { threadId: thread.id });
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    console.log('Messages retrieved:', messages.data);
    const latestMessage = messages.data[0].content[0].text.value;

    res.json({ response: latestMessage, threadId: thread.id });
  } catch (error) {
    console.error('Error in /chat endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server running on port ${port}`));