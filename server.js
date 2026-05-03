import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { Groq } from 'groq-sdk';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize clients
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

let pc;
let index;
let documents = []; // Store document metadata

// Initialize Pinecone
async function initializePinecone() {
  try {
    pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    index = pc.Index(process.env.PINECONE_INDEX_NAME || 'rag-chatbot');
    console.log('Pinecone initialized');
  } catch (error) {
    console.error('Pinecone initialization error:', error);
  }
}

initializePinecone();

// Routes

// Upload and process PDF
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);

    // Extract text from PDF
    const pdfData = await pdfParse(fileBuffer);
    const text = pdfData.text;

    // Split text into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const chunks = await splitter.splitText(text);

    // Generate embeddings and store in Pinecone
    const documentId = Date.now().toString();
    const vectors = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embeddings.embedQuery(chunk);
      
      vectors.push({
        id: `${documentId}-chunk-${i}`,
        values: embedding,
        metadata: {
          text: chunk,
          documentId,
          chunkIndex: i,
          fileName: req.file.originalname,
        },
      });
    }

    // Upsert vectors to Pinecone
    if (index && vectors.length > 0) {
      await index.upsert(vectors);
    }

    // Store document metadata
    documents.push({
      id: documentId,
      fileName: req.file.originalname,
      uploadedAt: new Date(),
      chunkCount: chunks.length,
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      documentId,
      fileName: req.file.originalname,
      chunkCount: chunks.length,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get documents list
app.get('/api/documents', (req, res) => {
  res.json(documents);
});

// Delete document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const documentId = req.params.id;

    // Delete vectors from Pinecone
    if (index) {
      const vectors = await index.listPaginated({ prefix: `${documentId}-` });
      if (vectors.vectors && vectors.vectors.length > 0) {
        await index.deleteMany(vectors.vectors.map(v => v.id));
      }
    }

    // Remove from documents list
    documents = documents.filter(doc => doc.id !== documentId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint - RAG pipeline
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Retrieve relevant context from Pinecone
    const queryEmbedding = await embeddings.embedQuery(message);
    let context = '';

    if (index) {
      try {
        const queryResult = await index.query({
          vector: queryEmbedding,
          topK: 3,
          includeMetadata: true,
        });

        context = queryResult.matches
          .map(match => match.metadata?.text || '')
          .filter(text => text)
          .join('\n---\n');
      } catch (queryError) {
        console.warn('Query error:', queryError.message);
      }
    }

    // Prepare system prompt
    const systemPrompt = `You are a helpful AI assistant. Use the provided context to answer questions accurately. 
If the context doesn't contain relevant information, say so.

Context:
${context || 'No context available'}`;

    // Prepare messages for Groq
    const messages = [
      ...conversationHistory,
      {
        role: 'user',
        content: message,
      },
    ];

    // Call Groq LLaMA 3
    const response = await groq.chat.completions.create({
      model: 'mixtral-8x7b-32768',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const assistantMessage = response.choices[0].message.content;

    res.json({
      message: assistantMessage,
      context: context ? context.substring(0, 500) + '...' : 'No context',
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server
app.listen(PORT, () => {
  console.log(`RAG Chatbot server running on port ${PORT}`);
});
