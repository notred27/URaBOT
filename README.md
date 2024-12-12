# URaBot: A Real-Time Bot Detector for Twitter (a.k.a. X)

## Introduction

With the recent rise in artificially generated content, social media websites have been overrun with bots. This poses
a threat as these bots are known to spread dangerous information and detract from a user’s online experience. Previous 
work has applied deep-learning techniques such as MLPs, SVMs, and random forests to features generated by asocial media 
user with high accuracy. More recently, transformer encoders have also been used with high levels of accuracy. However,
despite this research, there is still a lack of user-friendly bot detectors for many social media sites. Furthermore,
sites like Twitter (a.k.a. X) that employ built-in bot detectors often still let through large amounts
of artificially generated content. Through our work, we introduce URaBot: an application that operates in real-time
to detect bot-generated content on the browser version of Twitter. Our application consists of fine-tuned deep learning 
classifiers (MLP, DeBERTa, distilBERT), and a Chromium extension that can access our model and make corresponding changes to 
HTML in the browser

## How to Run

### Loading the Application:
The base Chrome extension can be enabled by **loading the unpacked extension** that is found in the [Extension](Extension) directory at [<nobr>chrome://extensions/</nobr>](chrome://extensions/). Ensure that `Developer mode` has been enabled.

For more help, check out additional information about loading a custom extension [here.](https://knowledge.workspace.google.com/kb/load-unpacked-extensions-000005962)

### Locally Hosting the API:


To host the API locally, navigate into the [API](API) directory and run the following Python script:
```bash
    python -m flask run
```

- Ensure that the requirements from `requirements.txt` are met

Additionally, you can adjust the environmental variables found in the [.env](API/.env) to run a specific version of our model or enable Platt Scaling. The Hugging Face labels for our models are:

- URaBOT2024/debertaV3_FullFeature

- URaBOT2024/debertaV3xsmall_FullFeature

- URaBOT2024/distilledbert_FullFeature



## Dataset and Models

### Dataset:

- [HF Human vs Bot Dataset](https://huggingface.co/datasets/airt-ml/twitter-human-bots): A dataset containing over **21,450** English tweets which are labeled as either a human or a bot.

### Encoder Models:

- [microsoft/deberta-v3-base](https://huggingface.co/microsoft/deberta-v3-base): The base version of Microsoft's DebertaV3

- [MoritzLaurer/DeBERTa-v3-xsmall-mnli-fever-anli-ling-binary](https://huggingface.co/MoritzLaurer/DeBERTa-v3-xsmall-mnli-fever-anli-ling-binary): A small version of DebertaV3 that has been fine-tuned for binary classification

- [distilbert/distilbert-base-uncased](https://huggingface.co/distilbert/distilbert-base-uncased): A small BERT model intended for fine-tuning on sequence classification that is not case-sensitive

## Methods

## Tasks
**Main Tasks**
- [x] Gather and pre-process data
- [x] Build base models
- [x] Test metrics on models and fine-tune (confidence intervals)
- [x] Perform Platt-Scaling to calibrate our models 
- [x] Deploy models in API endpoint
- [x] Build extension base
- [x] Build RESTful API endpoint


**Future Tasks**
- [ ] Extend functionality to other social media sites (Instagram, BlueSky, Facebook, etc.)
- [ ] Permanently host API endpoint
- [ ] Create an adjusted version of the extension to run on Mozilla (Firefox)


