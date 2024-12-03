# Script to train a model specified in `MODEL_NAME` with the new dataset and all 4 features (Separated by [SEQ] tokens).


from datasets import load_dataset
from datasets import Dataset as DS
import evaluate
import numpy as np
import torch
from transformers import TrainingArguments, Trainer
from transformers import AutoModelForSequenceClassification, AutoConfig, AutoTokenizer
from sklearn.model_selection import train_test_split


MODEL_NAME = "microsoft/deberta-v3-base"



# Load pre-trained models and tokenizers
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels = 2)
config = AutoConfig.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)


# Process the dataset:
ds = load_dataset("airt-ml/twitter-human-bots")["train"]

# Func for changing label from string to int
def change_label(x) :
  if x["account_type"] == "human":
    x["account_type"] = 0
  else:
    x["account_type"] = 1

  x['description'] = x["description"] + tokenizer.sep_token + x["screen_name"] + tokenizer.sep_token + str(int(x["verified"])) + tokenizer.sep_token + str(x["favourites_count"])

  return x

# Filter out languages other than english
ds = ds.filter(lambda x: x["lang"] == "en")

# Remove extra columns
ds = ds.remove_columns(["Unnamed: 0", "created_at",'default_profile', 'default_profile_image','followers_count', 'friends_count', 'geo_enabled', 'id', 'lang', 'location','profile_background_image_url', 'profile_image_url','average_tweets_per_day', 'account_age_days','statuses_count'])

# Change labels from string to 0 (human) / 1 (bot)
ds = ds.map(change_label)

print(ds[0])

# Tokenize the data
def tokenize_function(examples):

    return tokenizer(examples, return_tensors='pt', padding=True, truncation=True) # FIXME: Arbitrary max_length

tokenized_dataset = tokenize_function(ds["description"])
tokenized_dataset["labels"] = torch.tensor(ds["account_type"])


# Send the data to a Dataset object that can be passed to the model
dataset = DS.from_dict(tokenized_dataset)

# Split the Dataset object into test and train objects
dataset_split = dataset.train_test_split(test_size=0.2, seed=42)
train_dataset = dataset_split['train']
test_dataset = dataset_split['test']

print(train_dataset[0])
print(test_dataset[0])




# Set hardware target
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
model.to(device)


# Make the evaluation function
metric = evaluate.combine(["accuracy"])
metric_f1 = evaluate.load("f1")

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    acc =  metric.compute(predictions=predictions, references=labels)
    f1 = metric_f1.compute(predictions=predictions, references=labels, average="macro")
    return {**acc, **f1}



# Set up the training arguments
training_args = TrainingArguments(output_dir=MODEL_NAME + "_3f",
                                  per_device_eval_batch_size=32,
                                  per_device_train_batch_size=32,
                                  num_train_epochs=10,
                                  eval_strategy="epoch",
                                  learning_rate=2e-5,  # Specify the learning rate here
                                  weight_decay=0.01,   # Regularization
                                  warmup_steps=500,    # Optional: Warmup steps for the learning rate scheduler
                                  )



trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=test_dataset,
    compute_metrics=compute_metrics,
    # optimizers=(optimizer, lr_scheduler)
)

trainer.train()

# Save the fine-tuned model and tokenizer
trainer.save_model(MODEL_NAME + "_4f")  # Specify your desired path
tokenizer.save_pretrained(MODEL_NAME + "_4f")  # Save the tokenizer


