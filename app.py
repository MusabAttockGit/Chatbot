"""
Musab AI — COMPLETE Voice Call RAG Chatbot
Real-time voice-to-voice AI assistant with professional call interface
"""

import os
import json
import traceback
import time
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, send_from_directory, request, jsonify, render_template_string
from flask_cors import CORS
from flask_socketio import SocketIO, emit, disconnect
import warnings
warnings.filterwarnings("ignore")

# Voice Processing
import base64
from io import BytesIO

# RAG imports
try:
    from pinecone import Pinecone
    from llama_index.core import Settings, VectorStoreIndex, PromptTemplate
    from llama_index.llms.groq import Groq
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding
    from llama_index.vector_stores.pinecone import PineconeVectorStore
    from llama_index.core.schema import Document
    from llama_index.core.node_parser import SentenceSplitter
    RAG_AVAILABLE = True
except Exception as e:
    print(f"⚠️ RAG libraries not available: {e}")
    RAG_AVAILABLE = False

# Load environment variables
load_dotenv()

# Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX", "musab-chatbot")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 7860))

# Global variables
query_engine = None
pinecone_index_obj = None
vector_index = None
message_history = []
active_sessions = {}

SYSTEM_PROMPT = """You are Musab AI, an expert Irish immigration consultant assistant in a voice call.

VOICE CONVERSATION RULES:
1. Keep responses BRIEF and CONVERSATIONAL (2-4 sentences maximum)
2. Speak naturally - avoid bullet points, speak in flowing sentences
3. For lists, say "There are three main things: first... second... and third..."
4. If detailed info needed, offer to elaborate: "Would you like me to go into more detail?"
5. Use retrieved documents for accuracy
6. If you don't know, say so briefly: "I don't have that information, but I can help you find it"

RESPONSE STYLE:
- Warm and professional
- Concise and clear
- Natural speech patterns
- No markdown formatting (it's voice!)

Your expertise: Irish visas, work permits, citizenship, residency, immigration law.
"""


def initialize_rag():
    """Initialize RAG system with Pinecone and LLaMA Index"""
    global query_engine, pinecone_index_obj, vector_index
    
    if not RAG_AVAILABLE:
        print("❌ RAG libraries not available")
        return False
    
    if not GROQ_API_KEY:
        print("❌ GROQ_API_KEY not set in .env")
        return False
    
    if not PINECONE_API_KEY:
        print("❌ PINECONE_API_KEY not set in .env")
        return False
    
    try:
        print("🔧 Initializing RAG system...")
        
        # Setup LLM
        Settings.llm = Groq(
            model=LLM_MODEL,
            api_key=GROQ_API_KEY,
            temperature=0.3,
            max_tokens=1024  # Shorter for voice responses
        )
        print(f"✅ LLM initialized: {LLM_MODEL}")
        
        # Setup embeddings
        Settings.embed_model = HuggingFaceEmbedding(
            model_name=EMBED_MODEL,
            trust_remote_code=True
        )
        print(f"✅ Embeddings initialized: {EMBED_MODEL}")
        
        # Connect to Pinecone
        pc = Pinecone(api_key=PINECONE_API_KEY)
        pinecone_index_obj = pc.Index(PINECONE_INDEX_NAME)
        print(f"✅ Connected to Pinecone: {PINECONE_INDEX_NAME}")
        
        # Check index stats
        stats = pinecone_index_obj.describe_index_stats()
        vector_count = stats.total_vector_count
        print(f"📊 Vectors in index: {vector_count}")
        
        if vector_count == 0:
            print("⚠️ No vectors in index! Run ingest.py first.")
        
        # Create vector store
        vector_store = PineconeVectorStore(pinecone_index=pinecone_index_obj)
        vector_index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
        
        # Create custom prompt for voice
        custom_qa_prompt = PromptTemplate(
            "You are responding in a VOICE CALL. Keep it brief and conversational.\n\n"
            "Context from documents:\n"
            "---------------------\n"
            "{context_str}\n"
            "---------------------\n\n"
            "User's question: {query_str}\n\n"
            "Provide a concise, natural voice response (2-4 sentences). "
            "Speak naturally as if on a phone call. No bullet points or lists - use flowing sentences.\n"
            "Answer:"
        )
        
        # Create query engine
        query_engine = vector_index.as_query_engine(
            similarity_top_k=3,
            response_mode="compact",
            text_qa_template=custom_qa_prompt
        )
        
        print("✅ RAG system ready for voice calls!")
        return True
        
    except Exception as e:
        print(f"❌ RAG initialization failed: {e}")
        traceback.print_exc()
        return False


def get_rag_response(message: str, session_id: str = "default"):
    """Get response from RAG system"""
    global query_engine, message_history
    
    if not query_engine:
        return {
            "answer": "I'm sorry, my knowledge system is currently unavailable. Let me try to help with general information.",
            "used_rag": False,
            "error": "RAG not initialized"
        }
    
    try:
        user_query = message.strip()
        print(f"🎤 Query from session {session_id}: {user_query[:100]}...")
        
        # Add voice context
        enhanced_query = f"[Voice call - keep response very brief]\n{user_query}"
        
        # Query RAG
        response = query_engine.query(enhanced_query)
        rag_answer = str(response).strip()
        
        # Get source nodes
        source_nodes = getattr(response, "source_nodes", [])
        doc_count = len(source_nodes)
        
        print(f"📚 Retrieved {doc_count} documents")
        print(f"💬 Answer: {rag_answer[:150]}...")
        
        # Check if answer is good
        used_rag = True
        final_answer = rag_answer
        
        # Fallback if poor answer
        if len(rag_answer) < 30 or not source_nodes:
            print("⚠️ Using fallback LLM...")
            fallback_llm = Settings.llm
            fallback_prompt = (
                f"You are in a voice call. Answer this briefly (2-3 sentences): {user_query}\n"
                f"Topic: Irish immigration. Be conversational."
            )
            fallback_response = fallback_llm.complete(fallback_prompt)
            final_answer = str(fallback_response).strip()
            used_rag = False
        
        # Clean for voice (remove markdown)
        final_answer = final_answer.replace("**", "").replace("*", "").replace("#", "").replace("`", "")
        
        # Update history
        if session_id not in active_sessions:
            active_sessions[session_id] = []
        
        active_sessions[session_id].append({
            "role": "user",
            "content": user_query,
            "timestamp": datetime.now().isoformat()
        })
        active_sessions[session_id].append({
            "role": "assistant",
            "content": final_answer,
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep last 10 messages per session
        active_sessions[session_id] = active_sessions[session_id][-10:]
        
        return {
            "answer": final_answer,
            "used_rag": used_rag,
            "documents_found": doc_count,
            "session_id": session_id
        }
        
    except Exception as e:
        print(f"❌ Error getting RAG response: {e}")
        traceback.print_exc()
        return {
            "answer": "I'm having trouble processing that. Could you rephrase your question?",
            "used_rag": False,
            "error": str(e)
        }


def add_document_to_index(text: str):
    """Add new document to Pinecone index"""
    global vector_index, pinecone_index_obj
    
    if not vector_index:
        return {"error": "RAG system not initialized"}
    
    try:
        # Create document
        doc = Document(text=text)
        
        # Split into chunks
        parser = SentenceSplitter(chunk_size=512, chunk_overlap=50)
        nodes = parser.get_nodes_from_documents([doc])
        
        # Add to index
        vector_index.insert_nodes(nodes)
        
        print(f"✅ Added {len(nodes)} chunks to index")
        
        return {
            "success": True,
            "nodes_added": len(nodes)
        }
        
    except Exception as e:
        print(f"❌ Error adding document: {e}")
        return {"error": str(e)}


# Initialize Flask app
app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'musab-ai-voice-secret-key-2024')
app.config['JSON_SORT_KEYS'] = False

# Enable CORS
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Initialize SocketIO
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='threading',
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25
)


# ============= HTTP Routes =============

@app.route("/", methods=["GET"])
def index_page():
    """Serve main voice call interface"""
    try:
        return send_from_directory(".", "index.html")
    except:
        return "<h1>Error: index.html not found</h1><p>Make sure index.html is in the same directory as app.py</p>", 404


@app.route("/add_data", methods=["GET"])
def add_data_page():
    """Serve data management page"""
    try:
        return send_from_directory(".", "add_data.html")
    except:
        return "<h1>Error: add_data.html not found</h1>", 404


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    try:
        health_data = {
            "status": "ok",
            "timestamp": datetime.now().isoformat(),
            "rag_ready": query_engine is not None,
            "voice_enabled": True,
            "active_sessions": len(active_sessions)
        }
        
        # Get Pinecone stats
        if pinecone_index_obj:
            try:
                stats = pinecone_index_obj.describe_index_stats()
                health_data["vector_count"] = stats.total_vector_count
            except:
                health_data["vector_count"] = 0
        
        return jsonify(health_data)
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """REST API endpoint for chat (legacy support)"""
    try:
        data = request.get_json(force=True)
        message = data.get("message", "")
        session_id = data.get("session_id", "http_session")
        voice_mode = data.get("voice_mode", False)
        
        if not message.strip():
            return jsonify({"error": "Empty message"}), 400
        
        result = get_rag_response(message, session_id)
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Chat API error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/clear", methods=["POST"])
def api_clear():
    """Clear conversation history"""
    try:
        data = request.get_json(force=True) if request.data else {}
        session_id = data.get("session_id", "default")
        
        if session_id in active_sessions:
            active_sessions[session_id] = []
        
        return jsonify({"ok": True, "message": "History cleared"})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/add_data", methods=["POST"])
def api_add_data():
    """Add new document to knowledge base"""
    try:
        data = request.get_json(force=True)
        text = data.get("data", "")
        
        if not text or not text.strip():
            return jsonify({"error": "No data provided"}), 400
        
        if len(text.strip()) < 50:
            return jsonify({"error": "Document too short (minimum 50 characters)"}), 400
        
        result = add_document_to_index(text)
        
        if "error" in result:
            return jsonify(result), 500
        
        return jsonify({
            "ok": True,
            "nodes_added": result.get("nodes_added", 0),
            "message": "Document added successfully"
        })
        
    except Exception as e:
        print(f"❌ Add data error: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats", methods=["GET"])
def api_stats():
    """Get system statistics"""
    try:
        stats = {
            "sessions": len(active_sessions),
            "total_messages": sum(len(msgs) for msgs in active_sessions.values()),
            "rag_ready": query_engine is not None
        }
        
        if pinecone_index_obj:
            try:
                index_stats = pinecone_index_obj.describe_index_stats()
                stats["vector_count"] = index_stats.total_vector_count
            except:
                stats["vector_count"] = 0
        
        return jsonify(stats)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============= WebSocket Events =============

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    session_id = request.sid
    print(f"🔌 Client connected: {session_id}")
    
    active_sessions[session_id] = []
    
    emit('connection_status', {
        'status': 'connected',
        'session_id': session_id,
        'rag_ready': query_engine is not None
    })


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    session_id = request.sid
    print(f"🔌 Client disconnected: {session_id}")
    
    if session_id in active_sessions:
        del active_sessions[session_id]


@socketio.on('voice_input')
def handle_voice_input(data):
    """Handle incoming voice/text input"""
    session_id = request.sid
    
    try:
        text = data.get('text', '').strip()
        
        if not text:
            emit('error', {'message': 'Empty input'})
            return
        
        print(f"🎤 Voice input from {session_id}: {text[:100]}...")
        
        # Get response
        result = get_rag_response(text, session_id)
        
        # Send response back
        emit('voice_response', {
            'text': result['answer'],
            'used_rag': result['used_rag'],
            'documents_found': result.get('documents_found', 0),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Voice input error: {e}")
        traceback.print_exc()
        emit('error', {'message': 'Processing error', 'details': str(e)})


@socketio.on('ping')
def handle_ping():
    """Keep connection alive"""
    emit('pong', {'timestamp': datetime.now().isoformat()})


@socketio.on('clear_history')
def handle_clear_history():
    """Clear conversation history for this session"""
    session_id = request.sid
    
    if session_id in active_sessions:
        active_sessions[session_id] = []
    
    emit('history_cleared', {'success': True})


# ============= Error Handlers =============

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error"}), 500


# ============= Main =============

if __name__ == "__main__":
    print("\n" + "="*70)
    print("  🎤 MUSAB AI - Voice Call System")
    print("="*70)
    print(f"  📅 Starting at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  🌐 Host: {HOST}")
    print(f"  🔌 Port: {PORT}")
    print("="*70 + "\n")
    
    # Initialize RAG
    rag_success = initialize_rag()
    
    if rag_success:
        print("\n✅ All systems ready!")
    else:
        print("\n⚠️  RAG system unavailable - check API keys in .env")
        print("    Server will run but won't access documents.")
    
    print(f"\n🚀 Server running at: http://{HOST}:{PORT}")
    print(f"📱 Open in browser: http://localhost:{PORT}\n")
    print("Press Ctrl+C to stop\n")
    print("="*70 + "\n")
    
    # Start server
    try:
        socketio.run(
            app,
            host=HOST,
            port=PORT,
            debug=False,
            allow_unsafe_werkzeug=True,
            use_reloader=False
        )
    except KeyboardInterrupt:
        print("\n\n👋 Shutting down gracefully...")
        print("="*70 + "\n")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        traceback.print_exc()