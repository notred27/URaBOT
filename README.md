
<div align="center">
<img src="Extension/icons/icon128.png" />

<h1>URaBOT</h1>

**A Chrome extension for real-time social media bot detection.**

![X](https://img.shields.io/badge/X-%23000000.svg?style=for-the-badge&logo=X&logoColor=white) ![Bluesky](https://img.shields.io/badge/Bluesky-0285FF?style=for-the-badge&logo=Bluesky&logoColor=white)

![Google Chrome](https://img.shields.io/badge/Google%20Chrome-4285F4?style=for-the-badge&logo=GoogleChrome&logoColor=white)


URaBOT is a Chrome extension that offers real-time detection of bot accounts on Twitter (X) and Bluesky. By leveraging fine-tuned machine learning models, it enhances user experience by identifying and flagging potential bot profiles directly within your browser.
</div>

## Features

- **Real-Time Detection**: Analyzes content as you browse, providing immediate feedback on potential bot accounts.
    
- **Machine Learning Models**: Utilizes trained models to assess the likelihood of an account being a bot based on various features.
    
- **Seamless Integration**: Operates within an application's web interface without disrupting the user experience.
    
- **User-Friendly Interface**: Displays clear indicators and information to help users make informed decisions about the accounts they interact with.
    

## Extension Installation

To install the Chrome Extension

1. **Clone the Repository**:

```
git clone https://github.com/notred27/URaBOT.git
```

2. Load the Extension

-  Navigate to `chrome://extensions/` in your Chrome browser.
- Toggle the switch in the top right corner to enable Developer Mode.
- Click on "Load unpacked" and select the cloned `URaBOT/Extension` directory.

After these steps, URaBOT should then appear as an installed extension on this page that you can enable.

> For more help, check out additional information about loading a custom extension [here.](https://knowledge.workspace.google.com/kb/load-unpacked-extensions-000005962)



## Model Installation
### Remote Model

To run the classifiers without local hosting, users can select the `Gradio API` option in the extension dropdown menu. While easiest for a user, this API can be slow and lead to poor extension performance.

> This Gradio API is hosted using Hugging Face Spaces [here.](https://huggingface.co/spaces/mreidy3/URaBot)

### Local Model

To improve extension performance and ensure privacy, you can host the machine learning models **locally** using Docker. This spins up a local server (containing a MongoDB database) that the URaBOT Chrome extension can directly communicate with for an improved user experience.

> This requires Docker. [Learn more about getting started with Docker.](https://www.docker.com/get-started/)


Pull the latest image of this project:
```
docker pull mreidy3/urabot-backend:latest
```

Then, build and run a new container with
```
docker-compose up --build -d
```

After this script, the server should be running, and you can enable the extension through its pop-up menu by clicking the extension badge. It may take a few minutes for this backend server to start (as models must first be downloaded in the container), but you can test your connection through the extension dropdown menu.

To stop the local container, run
```
docker-compose down
```



### Build Your Own Image

Alternatively, you can build your own image to test our different models.
> This is not required to run the extension, and is instead an optional path for more advanced users.

After cloning the main repository, navigate into `API/LocalInference`

You can adjust the environmental variables found in the [.env](API/LocalInference/.env) to run a specific version of our model, or enable Platt Scaling. The Hugging Face labels for our models are:

- `URaBOT2024/debertaV3_FullFeature`: A fine-tuned version of [Microsoft's DebertaV3 Base](https://huggingface.co/microsoft/deberta-v3-base).

- `URaBOT2024/debertaV3xsmall_FullFeature`: A fine-tuned model that extends a smaller version of [DebertaV3](https://huggingface.co/MoritzLaurer/DeBERTa-v3-xsmall-mnli-fever-anli-ling-binary) that specializes in binary classification.

- `URaBOT2024/distilledbert_FullFeature`: A fine-tuned model extending a [distilled BERT model](https://huggingface.co/distilbert/distilbert-base-uncased) intended for sequence classification, and is not case-sensitive.

After selecting a model and parameters, use the previous Docker commands to run/stop the model as before.



## Limitations

Currently, our models only assess the text content of each tweet. Future plans involve pre-training CNN's and other encoders, and testing multimodal BLIP models to include image classification into our design.
