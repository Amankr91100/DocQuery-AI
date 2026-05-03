import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import multer from "multer";
import { createRequire } from "module";
import { fileURLToPath } from "url";

dotenv.config();

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

const upload = multer({ storage: multer.memoryStorage() });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function rankChunksByRelevance(question, chunks) {
  const questionLower = (question || "").toLowerCase();
  const tokens = questionLower.match(/\b[a-z0-9]{3,}\b/g) || [];
  const uniqueTokens = [...new Set(tokens)];

  return chunks
    .map((chunk) => {
      const text = chunk.toLowerCase();
      let score = 0;

      // Exact phrase match (highest priority)
      if (text.includes(questionLower)) {
        score += 100;
      }

      // Token matches
      for (const token of uniqueTokens) {
        const matches = (text.match(new RegExp(`\\b${token}\\b`, "g")) || [])
          .length;
        score += matches * 10;
      }

      // Penalty if chunk is very short (likely noise)
      if (chunk.trim().length < 50) {
        score *= 0.5;
      }

      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function generateDocumentAnswer(question, context) {
  if (!OPENAI_API_KEY) {
    const lines = context
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 10);
    return lines.slice(0, 3).join("\n");
  }

  const messages = [
    {
      role: "system",
      content:
        "You are a precise assistant. ONLY answer using the exact text from the provided context. " +
        "If the answer is not directly stated in the context, respond with EXACTLY: 'Not found in document.' " +
        "Do not paraphrase, infer, or add any information not explicitly in the context. " +
        "Answer in 1-2 sentences maximum.",
    },
    {
      role: "user",
      content: `CONTEXT:\n${context}\n\nQUESTION: ${question}\n\nAnswer using ONLY text from the context above. If not found, say 'Not found in document.'`,
    },
  ];

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0,
      max_tokens: 200,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMessage = data.error?.message || response.statusText;
    throw new Error(`OpenAI request failed: ${errorMessage}`);
  }

  return (
    data.choices?.[0]?.message?.content?.trim() || "Not found in document."
  );
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html as root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// In-memory storage for documents and chat
let documents = [];
let documentChunks = {};
let conversationHistory = [];

// Routes

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Upload PDF or text file
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileName = file.originalname;
    let content = "";

    if (file.mimetype.includes("pdf")) {
      const pdfDocument = new PDFParse({ data: file.buffer });
      const pdfData = await pdfDocument.getText();
      content = pdfData.text || "";
    } else {
      content = file.buffer.toString("utf-8");
    }

    if (!content.trim()) {
      return res.status(400).json({
        error:
          "Unable to extract readable text from the uploaded file. Please upload a valid PDF or text file.",
      });
    }

    // Split content into chunks
    const chunkSize = 500;
    const chunks = [];
    for (let i = 0; i < content.length; i += chunkSize - 100) {
      chunks.push(content.substring(i, i + chunkSize));
    }

    const documentId = Date.now().toString();
    documents.push({
      id: documentId,
      fileName,
      uploadedAt: new Date(),
      chunkCount: chunks.length,
    });

    documentChunks[documentId] = chunks;

    res.json({
      success: true,
      documentId,
      fileName,
      chunkCount: chunks.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get documents
app.get("/api/documents", (req, res) => {
  res.json(documents);
});

// Delete document
app.delete("/api/documents/:id", (req, res) => {
  try {
    const documentId = req.params.id;

    // Remove document from list
    documents = documents.filter((doc) => doc.id !== documentId);

    // Remove chunks
    delete documentChunks[documentId];

    res.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationHistory: history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const allChunks = Object.values(documentChunks).flat();
    const rankedChunks = rankChunksByRelevance(message, allChunks);

    if (rankedChunks.length === 0 || rankedChunks[0].score === 0) {
      return res.json({
        message:
          "I could not find relevant information in the uploaded document. Please ask a different question or upload a document with the information.",
        context: "No specific context found",
      });
    }

    // Use top 5 chunks for better context, but filter by minimum relevance
    const minRelevanceScore = Math.max(10, rankedChunks[0].score * 0.3);
    const filteredChunks = rankedChunks
      .filter((item) => item.score >= minRelevanceScore)
      .slice(0, 5);

    const topChunks = filteredChunks.map((item) => item.chunk);
    const promptContext = topChunks.join("\n---\n");

    if (promptContext.length < 50) {
      return res.json({
        message:
          "Insufficient context found for this question. Please ask about information that is in the document.",
        context: "Low confidence match",
      });
    }

    const answer = await generateDocumentAnswer(message, promptContext);

    conversationHistory.push({
      role: "user",
      content: message,
    });

    conversationHistory.push({
      role: "assistant",
      content: answer,
    });

    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    res.json({
      message: answer,
      context: promptContext.substring(0, 300) + "...",
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`RAG Chatbot server running on http://localhost:${PORT}`);
  console.log("Open your browser and navigate to the URL above");
});
