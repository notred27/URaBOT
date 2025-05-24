from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

try:
    # Connect to local MongoDB instance
    client = MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=5000)
    
    # Force a call to test connection
    client.admin.command('ping')
    
    print("✅ Successfully connected to MongoDB!")

    # Optional: Create a test database and collection
    db = client["test_db"]
    collection = db["test_collection"]
    test_doc = {"message": "Hello, MongoDB from Docker!"}
    
    result = collection.insert_one(test_doc)
    print(f"✅ Inserted document ID: {result.inserted_id}")


    query = {"message": "Hello, MongoDB from Docker!"}
    results = collection.find(query)

    print(results)

    # Clean up
    collection.delete_many({})
    print("🧹 Cleaned up test collection.")

except ConnectionFailure as e:
    print("❌ Could not connect to MongoDB:", e)
