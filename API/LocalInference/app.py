# API imports
import math
import time
from flask import Flask, request, make_response
from flask import jsonify
from flask_cors import CORS, cross_origin   # Import CORS module
import os
from dotenv import load_dotenv

# Model imports
from transformers import AutoModelForSequenceClassification, AutoConfig, AutoTokenizer
import numpy as np
import torch
from pymongo import MongoClient


# Load environmental vars
load_dotenv()



# Connect to db
MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client.get_database()
tweet_results = db.classifications
tweet_results.create_index("psudo_id", unique=True)



MODEL_NAME = os.getenv('MODEL_NAME')
USE_PS = os.getenv('USE_PLATT_SCALING') == "True"

# Platt Scaling Constants
A = float(os.getenv('A'))
B = float(os.getenv('B'))

print("Starting Flask backend with model:", MODEL_NAME, " using Platt Scaling?", USE_PS)

# Load pre-trained models and tokenizers
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels = 2)
config = AutoConfig.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)




# Set hardware target for model
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")

# Load model from HF
def load_model():
    global model, tokenizer, config

    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=2)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    config = AutoConfig.from_pretrained(MODEL_NAME)
    model.to(device)
    model.eval()
    print("Model loaded!")

load_model()

# Set up the Flask app
app = Flask(__name__)
# Set up CORS control (tmp for localhost)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})
app.config['CORS_HEADERS'] = 'Content-Type'


#TODO: Remove these?
# Test endpoint for GET requests
@app.route('/ping', methods=['GET'])
@cross_origin(origin='*',headers=['Content-Type','Authorization'])  # Account for CORS
def ping():
    return {"message": "pong"}

# Test endpoint for POST requests, returns whatever is sent to the endpoint (payload: {"message": message to return})
@app.route('/echo', methods=['POST','OPTIONS'])
@cross_origin(origin='*',headers=['Content-Type','Authorization'])  # Account for CORS
def echo():
    if 'message' not in request.form:
        return {"message" : "No message provided"}
    
    return {"message": request.form["message"]}



@app.route('/verify', methods=['POST','OPTIONS'])
@cross_origin(origin='*',headers=['Content-Type','Authorization'])  # Account for CORS
def verify():
    '''
    Main Endpoint for URaBOT, a POST request that takes in a tweet's data and returns a "bot" score

    Returns: JSON object {"percent": double} 
    
    payload:
        "psudo_id": the temporary id of the tweet (as assigned in local HTML from Twitter)
        "username": the profile's username (@tag)
        "display_name": the profiles display name
        "tweet_content": the text content of the tweet
    '''

    #========== Error codes ==========#

    # Confirm that full payload was sent
    if 'username' not in request.form:
        return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No username provided"}), 400)
        
    if 'display_name' not in request.form:
        return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No display_name provided"}), 400)
        
    if 'tweet_content' not in request.form:
        return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No tweet_content provided"}), 400)
        
    # Prevent multiple requests for the same tweet    
    psudo_id = request.form["psudo_id"]
    existing = tweet_results.find_one({"psudo_id": psudo_id})

    if existing:
        return jsonify({"percent": existing["percent"]})

    #========== Resolve Multiple Requests (Placeholder) ==========#
    tweet_results.insert_one({"psudo_id": psudo_id, "percent": -1})


    #========== Return Classification ==========#

    # Process the tweet through the model
    input = request.form["tweet_content"] + tokenizer.sep_token + request.form["display_name"] + tokenizer.sep_token +  request.form["is_verified"] + tokenizer.sep_token +  request.form["likes"]
    tokenized_input = tokenizer(input, return_tensors='pt', padding=True, truncation=True).to(device)
    with torch.no_grad():
        outputs = model(**tokenized_input)
    
    # Determine classification
    sigmoid = (1 / (1 + np.exp(-outputs.logits.detach().numpy()))).tolist()[0]

    # Apply Platt Scaling
    if USE_PS:
        sigmoid = [(1/(1+ math.exp(-(A * x + B)))) for x in sigmoid] 
    
    # Find majority class
    label = np.argmax(outputs.logits.detach().numpy(), axis=-1).item()


    # Return sigmoid-ish value for classification. Can instead return label for strict 0/1 binary classification
    if label == 0:
        tweet_results.update_one(
            {"psudo_id": psudo_id},
            {"$set": {"percent": 1 -  sigmoid[0]}},
            upsert=True
        )
        return jsonify({"percent": 1 -  sigmoid[0]})
    
    else:
        tweet_results.update_one(
            {"psudo_id": psudo_id},
            {"$set": {"percent": sigmoid[1]}},
            upsert=True
        )
        return jsonify({"percent": sigmoid[1] })

