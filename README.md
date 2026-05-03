# RAG Chatbot - Document Intelligence AI

A powerful Retrieval-Augmented Generation (RAG) based AI chatbot that allows users to interact with custom PDF documents. The system extracts information from PDFs, generates embeddings, and uses vector search combined with LLM inference to provide accurate, context-aware answers.

## Features

- **PDF Upload & Processing**: Upload multiple PDF documents and automatically process them
- **Vector Search**: Fast semantic search using Pinecone vector database
- **Context-Aware Responses**: Retrieves relevant document sections before generating answers
- **Real-time Chat Interface**: Beautiful, responsive chat UI with document management
- **Document Management**: View, manage, and delete uploaded documents
- **Reduced Hallucination**: Answers grounded in actual document content

## Tech Stack

- **Backend**: Node.js + Express.js
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **RAG Pipeline**:
  - LangChain for text processing and embeddings
  - OpenAI Embeddings for semantic understanding
  - Pinecone for vector storage and retrieval
  - Groq LLaMA 3 for fast inference
- **Document Processing**: pdf-parse for PDF extraction

## Prerequisites

Before you begin, ensure you have the following API keys:

1. **OpenAI API Key**: For generating embeddings
   - Sign up at https://platform.openai.com
   - Generate API key from settings

2. **Pinecone API Key**: For vector database
   - Create account at https://www.pinecone.io
   - Create a serverless index with dimension 1536

3. **Groq API Key**: For LLaMA 3 inference
   - Get key from https://console.groq.com
   - Free tier available for testing

## Installation

1. **Clone or Download the Project**
   ```bash
   cd rag-chatbot
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Setup Environment Variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```
   PORT=5000
   OPENAI_API_KEY=sk-...
   GROQ_API_KEY=gsk-...
   PINECONE_API_KEY=your-key...
   PINECONE_INDEX_NAME=rag-chatbot
   ```

4. **Start the Server**
   ```bash
   npm run dev
   ```

5. **Open in Browser**
   Navigate to `http://localhost:5000`

## Usage

1. **Upload Documents**: Click "+ Upload PDF" in the sidebar to upload one or more PDF documents
2. **Wait for Processing**: The system will extract text, split into chunks, generate embeddings, and store in Pinecone
3. **Start Chatting**: Once documents are processed, type your question in the chat input
4. **View Context**: Click on context boxes to see which document sections were used for the answer
5. **Manage Documents**: Delete documents from the sidebar as needed

## How It Works

### RAG Pipeline

1. **PDF Upload**: User uploads PDF file
2. **Text Extraction**: pdf-parse extracts all text content
3. **Chunking**: RecursiveCharacterTextSplitter breaks text into 1000-char chunks with 200-char overlap
4. **Embeddings**: OpenAI generates vector embeddings (1536 dimensions) for each chunk
5. **Vector Storage**: Chunks and embeddings stored in Pinecone with metadata
6. **Query Processing**: User query converted to embedding
7. **Semantic Search**: Pinecone retrieves top 3 most similar chunks
8. **LLM Generation**: Groq LLaMA 3 generates response using retrieved context
9. **Response**: Answer displayed in chat with context preview

## API Endpoints

### Upload Document
```
POST /api/upload
- Accepts: multipart/form-data (PDF file)
- Returns: { success, documentId, fileName, chunkCount }
```

### Get Documents
```
GET /api/documents
- Returns: Array of document metadata
```

### Delete Document
```
DELETE /api/documents/:id
- Returns: { success: true }
```

### Chat
```
POST /api/chat
- Body: { message, conversationHistory }
- Returns: { message, context }
```

### Health Check
```
GET /api/health
- Returns: { status: 'healthy' }
```

## Configuration

### Text Chunking
Edit `server.js` to adjust chunking strategy:
```javascript
const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,      // Size of each chunk
    chunkOverlap: 200,    // Overlap between chunks
});
```

### Vector Search
Modify top-K results:
```javascript
const queryResult = await index.query({
    vector: queryEmbedding,
    topK: 3,  // Change number of results
    includeMetadata: true,
});
```

### LLM Parameters
Adjust in chat endpoint:
```javascript
const response = await groq.chat.completions.create({
    model: 'mixtral-8x7b-32768',  // Or 'llama-3.1-70b-versatile'
    temperature: 0.7,              // Lower = more focused, Higher = more creative
    max_tokens: 1024,              // Max response length
});
```

## Troubleshooting

### Server won't start
- Check if port 5000 is already in use
- Verify Node.js is installed: `node --version`
- Check environment variables are set correctly

### Documents not uploading
- Ensure file is valid PDF
- Check file size isn't too large
- Verify OPENAI_API_KEY is valid

### No responses from chat
- Check GROQ_API_KEY is set and valid
- Verify Pinecone connection (check dashboard)
- Check browser console for errors

### Slow responses
- Reduce `topK` in vector search
- Reduce `chunkSize` for more granular chunks
- Check API rate limits

## Performance Tips

1. **Batch Processing**: Upload multiple PDFs at once for efficiency
2. **Optimal Chunk Size**: 1000 chars works well; adjust based on document type
3. **Context Window**: Limiting conversation history improves response speed
4. **API Caching**: Consider caching frequent queries

## Deployment

### Vercel Deployment
1. Push code to GitHub
2. Connect to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Docker
```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 5000
CMD ["npm", "start"]
```

## Future Enhancements

- [ ] Support for multiple document formats (DOCX, TXT, etc.)
- [ ] Advanced RAG with re-ranking
- [ ] Persistent conversation storage
- [ ] User authentication
- [ ] Document summarization
- [ ] Multi-language support
- [ ] Custom LLM model selection
- [ ] Conversation export

## License

MIT License - feel free to use for personal or commercial projects

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review API key configurations
3. Check browser console for errors
4. Review server logs for detailed error messages

## Credits

Built with:
- OpenAI for embeddings
- Groq for fast LLM inference
- Pinecone for vector database
- LangChain for RAG utilities
