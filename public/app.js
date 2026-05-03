// Configuration
const API_BASE_URL = "";
let conversationHistory = [];
let hasDocuments = false;

// DOM Elements
const pdfUpload = document.getElementById("pdf-upload");
const documentsList = document.getElementById("documents-list");
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const statusElement = document.getElementById("status");
const contextContainer = document.getElementById("context-container");
const contextContent = document.getElementById("context-content");
const closeContextButton = document.getElementById("close-context");

// Event Listeners
pdfUpload.addEventListener("change", handleFileUpload);
sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
closeContextButton.addEventListener("click", () => {
  contextContainer.classList.add("hidden");
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadDocuments();
});

// File Upload Handler
async function handleFileUpload(event) {
  const files = Array.from(event.target.files);

  if (files.length === 0) return;

  for (const file of files) {
    // Accept both PDF and text files
    if (!file.type.includes("pdf") && !file.type.includes("text")) {
      showStatus(`❌ ${file.name} must be PDF or text file`, true);
      continue;
    }

    await uploadFile(file);
  }

  // Clear input
  pdfUpload.value = "";
}

async function uploadFile(file) {
  try {
    showStatus(`📤 Uploading ${file.name}...`, false);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.statusText} ${errorText}`);
    }

    const data = await response.json();

    showStatus(`✅ Processed ${file.name} (${data.chunkCount} chunks)`, false);

    // Reload documents
    await loadDocuments();

    // Enable chat
    enableChat();
  } catch (error) {
    console.error("Upload error:", error);
    showStatus(`❌ Error uploading ${file.name}: ${error.message}`, true);
  }
}

// Load Documents
async function loadDocuments() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/documents`);

    if (!response.ok) {
      throw new Error("Failed to load documents");
    }

    const documents = await response.json();
    renderDocuments(documents);

    hasDocuments = documents.length > 0;

    if (hasDocuments) {
      enableChat();
    }
  } catch (error) {
    console.error("Load documents error:", error);
  }
}

function renderDocuments(documents) {
  if (documents.length === 0) {
    documentsList.innerHTML =
      '<p class="empty-state">No documents uploaded yet</p>';
    return;
  }

  documentsList.innerHTML = documents
    .map(
      (doc) => `
        <div class="document-item">
            <div class="document-info">
                <div class="document-name">📄 ${escapeHtml(doc.fileName)}</div>
                <div class="document-meta">${doc.chunkCount} chunks • ${new Date(doc.uploadedAt).toLocaleDateString()}</div>
            </div>
            <button class="delete-button" data-id="${doc.id}">Delete</button>
        </div>
    `,
    )
    .join("");

  // Add delete event listeners
  document.querySelectorAll(".delete-button").forEach((btn) => {
    btn.addEventListener("click", () => deleteDocument(btn.dataset.id));
  });
}

async function deleteDocument(documentId) {
  if (!confirm("Are you sure you want to delete this document?")) return;

  try {
    showStatus("🗑️ Deleting document...", false);

    const response = await fetch(
      `${API_BASE_URL}/api/documents/${documentId}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      throw new Error("Delete failed");
    }

    showStatus("✅ Document deleted", false);
    await loadDocuments();

    if (!hasDocuments) {
      disableChat();
    }
  } catch (error) {
    console.error("Delete error:", error);
    showStatus(`❌ Error deleting document: ${error.message}`, true);
  }
}

// Chat Functions
function enableChat() {
  messageInput.disabled = false;
  sendButton.disabled = false;
  messageInput.placeholder = "Ask a question about your documents...";
}

function disableChat() {
  messageInput.disabled = true;
  sendButton.disabled = true;
  messageInput.placeholder = "Upload a document first...";
  conversationHistory = [];
}

async function sendMessage() {
  const message = messageInput.value.trim();

  if (!message) return;

  // Add user message to UI
  addMessageToChat(message, "user");
  messageInput.value = "";

  // Disable input while processing
  messageInput.disabled = true;
  sendButton.disabled = true;
  showStatus("🤔 Thinking...", false);

  try {
    // Add to conversation history
    conversationHistory.push({
      role: "user",
      content: message,
    });

    // Call API
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        conversationHistory: conversationHistory.slice(0, -1), // Exclude current message
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Add assistant message
    addMessageToChat(data.message, "assistant");

    // Add to conversation history
    conversationHistory.push({
      role: "assistant",
      content: data.message,
    });

    // Show context
    if (data.context && data.context !== "No context") {
      displayContext(data.context);
    }

    showStatus("✅ Ready", false);
  } catch (error) {
    console.error("Chat error:", error);
    addMessageToChat(
      `Sorry, I encountered an error: ${error.message}`,
      "assistant",
    );
    showStatus(`❌ Error: ${error.message}`, true);
  } finally {
    // Re-enable input
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
}

function addMessageToChat(text, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}-message`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  // Parse text and create paragraphs for better formatting
  const paragraphs = text.split("\n").filter((p) => p.trim());
  paragraphs.forEach((para) => {
    const p = document.createElement("p");
    p.textContent = para;
    contentDiv.appendChild(p);
  });

  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function displayContext(context) {
  contextContent.textContent = context;
  contextContainer.classList.remove("hidden");

  // Auto-hide context after 5 seconds
  setTimeout(() => {
    contextContainer.classList.add("hidden");
  }, 5000);
}

function showStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.className = isError ? "status error" : "status loading";
}

// Utility Functions
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Check health on load
async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (!response.ok) {
      console.warn("Server health check failed");
      showStatus("⚠️ Server connection issue", true);
    }
  } catch (error) {
    console.warn("Server health check error:", error);
    showStatus("⚠️ Cannot reach server", true);
  }
}

window.addEventListener("load", checkServerHealth);
