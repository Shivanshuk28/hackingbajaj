const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const pdfParse = require('pdf-parse');
require('dotenv').config(); // ✅ load env variables

const app = express();
app.use(express.json());

app.post('/ask', async (req, res) => {
  try {
    const { documents, questions } = req.body;

    if (!documents || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Invalid input format.' });
    }

    const pdfResponse = await axios.get(documents, {
      responseType: 'arraybuffer'
    });

    const pdfData = await pdfParse(pdfResponse.data);
    const extractedText = pdfData.text;

    let prompt = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Context:\n${extractedText}\n\nCompress the following text while keeping all important details.
Make it shorter and information-dense but do not miss any information, only shorten all the sentences by removing the unnecessary part of that sentence, return the result in a paragraph form`
            }
          ]
        }
      ]
    };

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // ✅ from .env

    const textSummary = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      prompt,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    prompt = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Context:\n${textSummary.data.candidates?.[0]?.content?.parts?.[0]?.text}\n\nAnswer these:\n` +
                questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
            }
          ]
        }
      ]
    };

    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      prompt,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const output = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

    const answers = output.split(/\n(?=\d+\.\s)/)
      .map(line =>
        line.replace(/^\d+\.\s*/, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\(\d+\.\d+\)/g, '')
          .trim()
      )
      .filter(Boolean);

    res.json({ answers });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Something went wrong', detail: err.message });
  }
});

module.exports = app;
module.exports.handler = serverless(app);
