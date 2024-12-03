# API imports
from flask import Flask, request, make_response
from flask import jsonify
from flask_cors import CORS, cross_origin   # Import CORS module
import requests
import dotenv
import random
from rich import print

# Model imports
from transformers import AutoModelForSequenceClassification, AutoConfig, AutoTokenizer
import numpy as np
import torch

MODEL_NAME = "URaBOT2024/debertaV3_FT"


# Load pre-trained models and tokenizers
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels = 2)
config = AutoConfig.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)


# Set hardware target
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
model.to(device)






app = Flask(__name__)
# Set up CORS control (tmp for localhost)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})  # Target to allow trafic from
app.config['CORS_HEADERS'] = 'Content-Type'



@app.route('/')
def hello():
    return "Hello, World!"


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



# Main Endpoint for URaBOT, a POST request that takes in a tweet's data and returns a "bot" score
'''
payload:
         "username": the profile's username (@tag)
     "display_name": the profiles display name
    "tweet_content": the text content of the tweet
'''

@app.route('/verify', methods=['POST','OPTIONS'])
@cross_origin(origin='*',headers=['Content-Type','Authorization'])  # Account for CORS
def verify():

    # Confirm that full payload was sent
    if 'username' not in request.form:
        return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No username provided"}), 400)
        
    
    if 'display_name' not in request.form:
        return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No display_name provided"}), 400)
        
    
    if 'tweet_content' not in request.form:
        return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No tweet_content provided"}), 400)
        
    

    # TODO: Classify data here
    # print("[underline blue]" + request.form["display_name"] + " @ " + request.form["username"] + "[/underline blue]")
    # print("[blue]" + request.form["tweet_content"] + "[/blue]\n")

# x['description'] = x["description"] + tokenizer.sep_token + x["screen_name"] + tokenizer.sep_token + str(int(x["verified"])) + tokenizer.sep_token + str(x["favourites_count"])

    input = request.form["tweet_content"] + tokenizer.sep_token + request.form["display_name"]
    tokenized_input = tokenizer(input, return_tensors='pt', padding=True, truncation=True).to(device)

    outputs = model(**tokenized_input)
    
    label = np.argmax(outputs.logits.detach().numpy(), axis=-1).item()
    print("Classification: ", label)
    

    # FIXME: currently just returns a random value
    return jsonify({"percent":label })


if __name__ == '__main__':
    app.run(debug=True)