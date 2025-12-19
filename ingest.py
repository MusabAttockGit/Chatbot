"""
COMPLETE Batch Ingestion Script for Irish Immigration Chatbot
Loads CSV Q&A data into Pinecone vector database
"""

import os
import sys
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm
import warnings
import time
warnings.filterwarnings('ignore')

# Load environment
load_dotenv()

# Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX = os.getenv("PINECONE_INDEX", "musab-chatbot")
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "llama-3.3-70b-versatile"

# Data file path - Update this to your CSV location
DATA_FILE = r"C:\Users\Musab\Downloads\ChatBotMusab\run\data\documents.csv"

# You can also use relative path:
# DATA_FILE = os.path.join("data", "documents.csv")

BATCH_SIZE = 50

print("="*80)
print("  🚀 MUSAB AI - DATA INGESTION SYSTEM")
print("="*80)
print()

# Validate environment
if not GROQ_API_KEY:
    print("❌ ERROR: GROQ_API_KEY not found in .env file!")
    print("   Add: GROQ_API_KEY=gsk_your_key_here")
    sys.exit(1)

if not PINECONE_API_KEY:
    print("❌ ERROR: PINECONE_API_KEY not found in .env file!")
    print("   Add: PINECONE_API_KEY=your_key_here")
    sys.exit(1)

print("✅ Environment variables loaded")
print(f"   📊 Pinecone Index: {PINECONE_INDEX}")
print(f"   🤖 LLM Model: {LLM_MODEL}")
print(f"   🔤 Embedding Model: {EMBED_MODEL}")
print()

# Import required libraries
try:
    from llama_index.core import Document, VectorStoreIndex, Settings
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding
    from llama_index.llms.groq import Groq
    from llama_index.vector_stores.pinecone import PineconeVectorStore
    from llama_index.core.storage import StorageContext
    from pinecone import Pinecone
    print("✅ All required libraries imported successfully")
except ImportError as e:
    print(f"❌ ERROR: Missing required library: {e}")
    print("\n   Run: pip install -r requirements.txt")
    sys.exit(1)

print()
print("-"*80)
print("STEP 1: INITIALIZING MODELS")
print("-"*80)

# Initialize embedding model
try:
    print("📥 Loading embedding model (this may take a minute)...")
    embed_model = HuggingFaceEmbedding(
        model_name=EMBED_MODEL,
        trust_remote_code=True
    )
    print("✅ Embedding model loaded")
except Exception as e:
    print(f"❌ Error loading embedding model: {e}")
    sys.exit(1)

# Initialize LLM
try:
    print("🤖 Initializing LLM...")
    llm = Groq(
        model=LLM_MODEL,
        api_key=GROQ_API_KEY,
        temperature=0.1
    )
    Settings.llm = llm
    Settings.embed_model = embed_model
    print("✅ LLM initialized")
except Exception as e:
    print(f"❌ Error initializing LLM: {e}")
    sys.exit(1)

print()
print("-"*80)
print("STEP 2: CONNECTING TO PINECONE")
print("-"*80)

# Connect to Pinecone
try:
    print("🔌 Connecting to Pinecone...")
    pc = Pinecone(api_key=PINECONE_API_KEY)
    
    # List available indexes
    indexes = pc.list_indexes()
    index_names = [idx.name for idx in indexes]
    
    print(f"📋 Available indexes: {index_names}")
    
    # Check if our index exists
    if PINECONE_INDEX not in index_names:
        print(f"⚠️  WARNING: Index '{PINECONE_INDEX}' not found!")
        print(f"   Available: {index_names}")
        print("\n   Create index at: https://app.pinecone.io")
        print(f"   Name: {PINECONE_INDEX}")
        print("   Dimensions: 384 (for all-MiniLM-L6-v2)")
        print("   Metric: cosine")
        sys.exit(1)
    
    pinecone_index = pc.Index(PINECONE_INDEX)
    print(f"✅ Connected to index: {PINECONE_INDEX}")
    
except Exception as e:
    print(f"❌ Pinecone connection error: {e}")
    sys.exit(1)

# Clear old data (optional)
print()
clear_choice = input("🗑️  Clear existing data in Pinecone? (yes/no): ").lower()
if clear_choice in ['yes', 'y']:
    try:
        print("⏳ Clearing old vectors...")
        pinecone_index.delete(delete_all=True)
        print("✅ Old data cleared")
        time.sleep(2)  # Wait for deletion to propagate
    except Exception as e:
        print(f"⚠️  Warning: Could not clear data - {e}")
else:
    print("📌 Keeping existing data")

# Setup vector store
vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
storage_context = StorageContext.from_defaults(vector_store=vector_store)

print()
print("-"*80)
print("STEP 3: LOADING DATA FILE")
print("-"*80)

print(f"📂 Looking for file: {DATA_FILE}")

# Check if file exists
if not os.path.exists(DATA_FILE):
    print(f"\n❌ ERROR: File not found!")
    print(f"   Expected: {DATA_FILE}")
    print(f"\n   Please ensure documents.csv is in the correct location.")
    print(f"   Current directory: {os.getcwd()}")
    
    # Try to find the file
    print("\n🔍 Searching for CSV files...")
    for root, dirs, files in os.walk("."):
        for file in files:
            if file.endswith(".csv"):
                print(f"   Found: {os.path.join(root, file)}")
    
    sys.exit(1)

# Read CSV
try:
    print("📖 Reading CSV file...")
    try:
        df = pd.read_csv(DATA_FILE, encoding='utf-8')
    except UnicodeDecodeError:
        print("⚠️  UTF-8 encoding failed, trying latin-1...")
        df = pd.read_csv(DATA_FILE, encoding='latin-1')
    
    print(f"\n📊 CSV Information:")
    print(f"   Total rows: {df.shape[0]}")
    print(f"   Columns: {df.shape[1]}")
    print(f"   Column names: {list(df.columns)}")
    
except Exception as e:
    print(f"❌ Error reading CSV: {e}")
    sys.exit(1)

# Validate columns
required_cols = ['question', 'answer']
missing = [col for col in required_cols if col not in df.columns]
if missing:
    print(f"\n❌ ERROR: Missing required columns: {missing}")
    print(f"   Found columns: {list(df.columns)}")
    print("\n   CSV must have 'question' and 'answer' columns")
    sys.exit(1)

print(f"✅ Required columns found: {required_cols}")

# Clean data
initial_count = len(df)
df = df.dropna(subset=['question', 'answer'])
dropped = initial_count - len(df)

if dropped > 0:
    print(f"⚠️  Dropped {dropped} rows with missing data")

# Remove duplicates
df = df.drop_duplicates(subset=['question'])
duplicates = initial_count - len(df)
if duplicates > dropped:
    print(f"⚠️  Removed {duplicates - dropped} duplicate questions")

actual_rows = len(df)
print(f"\n✅ Ready to ingest: {actual_rows} clean rows")

print()
print("-"*80)
print("STEP 4: CREATING DOCUMENT OBJECTS")
print("-"*80)

documents = []

print(f"🔄 Processing {actual_rows} rows...")
for i, row in tqdm(df.iterrows(), total=len(df), desc="Creating documents"):
    question = str(row['question']).strip()
    answer = str(row['answer']).strip()
    source = str(row.get('source', 'Unknown')).strip() if pd.notna(row.get('source')) else "Unknown"
    
    # Optimal format for RAG
    text = f"Question: {question}\n\nAnswer: {answer}"
    
    documents.append(Document(
        text=text,
        metadata={
            "question": question,
            "source": source,
            "row_id": i,
            "type": "immigration_qa"
        }
    ))

print(f"✅ Created {len(documents)} document objects")

print()
print("-"*80)
print("STEP 5: INGESTING TO PINECONE")
print("-"*80)

total_docs = len(documents)
successful_batches = 0
failed_batches = 0
total_vectors = 0

print(f"📤 Uploading in batches of {BATCH_SIZE}...")
print(f"   Total batches: {(total_docs + BATCH_SIZE - 1) // BATCH_SIZE}")
print()

for i in tqdm(range(0, total_docs, BATCH_SIZE), desc="Uploading batches"):
    batch = documents[i:i+BATCH_SIZE]
    batch_num = i//BATCH_SIZE + 1
    
    try:
        index = VectorStoreIndex.from_documents(
            batch,
            storage_context=storage_context,
            show_progress=False
        )
        successful_batches += 1
        total_vectors += len(batch)
        
        end_row = min(i+BATCH_SIZE, total_docs)
        tqdm.write(f"   ✅ Batch {batch_num}: Rows {i+1}-{end_row} uploaded")
        
    except Exception as e:
        failed_batches += 1
        tqdm.write(f"   ❌ Batch {batch_num} FAILED: {str(e)[:80]}")

print()
print(f"📊 Ingestion Summary:")
print(f"   Successful batches: {successful_batches}")
print(f"   Failed batches: {failed_batches}")
print(f"   Vectors uploaded: {total_vectors}")

print()
print("-"*80)
print("STEP 6: VERIFYING UPLOAD")
print("-"*80)

print("⏳ Waiting for Pinecone to finish indexing (5 seconds)...")
time.sleep(5)

try:
    stats = pinecone_index.describe_index_stats()
    final_count = stats.total_vector_count
    
    print(f"\n📊 Pinecone Index Stats:")
    print(f"   Total vectors: {final_count}")
    print(f"   Expected: ~{total_docs * 2}")  # Each doc may create ~2 chunks
    
    if final_count >= total_docs:
        print(f"\n✅ SUCCESS! All data ingested successfully!")
    elif final_count > 0:
        missing = total_docs - final_count
        print(f"\n⚠️  Partial success: {missing} vectors may still be indexing")
        print("   Wait 1-2 minutes and check /api/health")
    else:
        print(f"\n❌ ERROR: No vectors found in index!")
        
except Exception as e:
    print(f"⚠️  Could not verify: {e}")

print()
print("-"*80)
print("STEP 7: TESTING RETRIEVAL")
print("-"*80)

try:
    print("🧪 Running test query...")
    
    index = VectorStoreIndex.from_vector_store(vector_store)
    query_engine = index.as_query_engine(similarity_top_k=3)
    
    test_query = "What is a work permit?"
    print(f"   Query: '{test_query}'")
    
    response = query_engine.query(test_query)
    answer = str(response)[:200]
    
    print(f"\n   Response preview:")
    print(f"   {answer}...")
    print(f"\n✅ Retrieval test successful!")
    
except Exception as e:
    print(f"❌ Test query failed: {e}")
    print("   Documents ingested but retrieval needs checking")

print()
print("="*80)
print("  ✅ INGESTION COMPLETE!")
print("="*80)
print()
print("Next steps:")
print("  1. Start the server: python app.py")
print("  2. Open browser: http://localhost:7860")
print("  3. Start a voice call and test!")
print()
print("="*80)
print()