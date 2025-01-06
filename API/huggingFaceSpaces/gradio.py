import gradio as gr
# from huggingface_hub import InferenceClient
from transformers import AutoModelForSequenceClassification, AutoConfig, AutoTokenizer
import torch
import numpy as np


MODEL_NAME = "URaBOT2024/debertaV3_FullFeature"

# Load pre-trained models and tokenizers
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels = 2)
config = AutoConfig.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

# Set hardware target for model
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
model.to(device)
model.eval()    # Set model to evaluation mode



def verify(psudo_id, username, display_name, tweet_content, is_verified, likes):
    '''
    Main Endpoint for URaBOT, a POST request that takes in a tweet's data and returns a "bot" score

    Returns: JSON object {"percent": double} 
    
    payload:
        "psudo_id": the temporary id of the tweet (as assigned in local HTML from Twitter)
        "username": the profile's username (@tag)
        "display_name": the profiles display name
        "tweet_content": the text content of the tweet
    '''

    # #========== Error codes ==========#

    # # Confirm that full payload was sent
    # if 'username' not in request.form:
    #     return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No username provided"}), 400)
        
    # if 'display_name' not in request.form:
    #     return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No display_name provided"}), 400)
        
    # if 'tweet_content' not in request.form:
    #     return make_response(jsonify({"error": "Invalid request parameters.", "message" : "No tweet_content provided"}), 400)
        
    # # Prevent multiple requests for the same tweet
    # if request.form["psudo_id"] in processed_tweets:
    #     return make_response(jsonify({"error": "Conflict, tweet is already being/has been processed"}), 409)


    # #========== Resolve Multiple Requests ==========#

    # # Add tweet to internal (backend) process list
    # processed_tweets.append(request.form["psudo_id"])


    #========== Return Classification ==========#

    # Process the tweet through the model
    # input = request.form["tweet_content"] + tokenizer.sep_token + request.form["display_name"] + tokenizer.sep_token +  request.form["is_verified"] + tokenizer.sep_token +  request.form["likes"]
   
    input = tweet_content + tokenizer.sep_token + display_name + tokenizer.sep_token + is_verified + tokenizer.sep_token + likes
    tokenized_input = tokenizer(input, return_tensors='pt', padding=True, truncation=True).to(device)
    with torch.no_grad():
        outputs = model(**tokenized_input)
    
    # Determine classification
    sigmoid = (1 / (1 + np.exp(-outputs.logits.detach().numpy()))).tolist()[0]

    # Apply Platt Scaling
    # if USE_PS:
    #     sigmoid = [(1/(1+ math.exp(-(A * x + B)))) for x in sigmoid] 
    
    # Find majority class
    label = np.argmax(outputs.logits.detach().numpy(), axis=-1).item()


    # Return sigmoid-ish value for classification. Can instead return label for strict 0/1 binary classification
    if label == 0:
        return 1 -  sigmoid[0]
    else:
        return sigmoid[1]



"""
For information on how to customize the ChatInterface, peruse the gradio docs: https://www.gradio.app/docs/chatinterface
"""
# Set up the Gradio Interface
iface = gr.Interface(
    fn=verify,              # Function to process input
    inputs=[gr.Textbox(label= "Text 1"), gr.Textbox(label= "Text 2"), gr.Textbox(label= "Text"), gr.Textbox(label= "Text 4")],    # Input type (Textbox for text)
    outputs=gr.Textbox(),   # Output type (Textbox for generated text)
    live=True                        # Optional: To update the result as you type
)

# Launch the API on a specific port


if __name__ == "__main__":
    iface.launch(share=True)  # share=True will give you a public URL to use the API

    # demo.launch()