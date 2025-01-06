import requests
import json
import time

url = "https://mreidy3-urabot.hf.space/gradio_api/call/predict"
data = {"data": ["12312", "username", "dispname", "This is a tweet", "true", "213"]}
headers = {"Content-Type": "application/json"}

response = requests.post(url, headers=headers, data=json.dumps(data))

# Check if the response was successful (status code 200)
if response.status_code == 200:
    # Extract event_id from the response JSON
    event_id = response.json().get('event_id')
    print(f"Event ID: {event_id}")
else:
    print("Error in POST request:", response.status_code, response.text)


# Step 2: Use the event_id to get the result
if event_id:
    result_url = f"{url}/{event_id}"
    
    result_response = requests.get(result_url)
    
    if result_response.status_code == 200:
        # result = result_response.json()
        print(result_response.content.decode().splitlines()[1][len("data:"):].strip())

  