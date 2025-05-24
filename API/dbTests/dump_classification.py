import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Get Mongo URI
MONGO_URI = "mongodb://localhost:27017/urabot"

# Connect to MongoDB
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)

db = client.get_database()  # Defaults to the DB name in URI or first DB listed
collection = db.classifications

# Fetch and print all entries
print("Classifications in DB:")
for doc in collection.find():
    print(f"psudo_id: {doc.get('psudo_id')} | percent: {doc.get('percent')}")
