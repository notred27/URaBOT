import evaluate
from datasets import load_dataset
import numpy as np
from transformers import RobertaTokenizer, RobertaForSequenceClassification, get_scheduler
# from transformers import get_scheduler
from torch.utils.data import DataLoader, Dataset
from torch.optim import AdamW
import torch
from tqdm.auto import tqdm
import pandas as pd
from tqdm.auto import tqdm
from transformers import TrainingArguments, Trainer
from transformers import AutoModel, AutoModelForSequenceClassification, AutoConfig, AutoTokenizer

MODEL_NAME = 'microsoft/deberta-v3-base'

# Load pre-trained models and tokenizers
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels = 3)
config = AutoConfig.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)




def tokenize_function(examples):
    # 70 is an estimate for now
    return tokenizer(examples, return_tensors='pt', max_length = 70, truncation = True, padding = True) # FIXME: Arbitrary max_length

#  Load the train dataset 
df = pd.read_csv("CSC277Project\\train\\train_dataset.csv")

# Tokenize and reformat the data to be passed to pytorch trainer
train_dataset = df["Tweet"].tolist()
train_labels = df["Bot Label"].tolist()
tokenized_train_datasets = tokenize_function(train_dataset)

# Add labels to the inputs
tokenized_train_datasets["labels"] = torch.tensor(train_labels)


#  Load the test dataset 
df = pd.read_csv("CSC277Project\\test\\test_dataset.csv")

# Tokenize and reformat the data to be passed to pytorch trainer
test_dataset = df["Tweet"].tolist()
test_labels = df["Bot Label"].tolist()
tokenized_test_datasets = tokenize_function(test_dataset)

# Add labels to the inputs
tokenized_test_datasets["labels"] = torch.tensor(test_labels)



class TextDataset(Dataset):
    def __init__(self, inputs):
        self.inputs = inputs

    def __len__(self):
        return len(self.inputs["input_ids"])

    def __getitem__(self, idx):
        return {key: tensor[idx] for key, tensor in self.inputs.items()}


train_dataset = TextDataset(tokenized_train_datasets)
test_dataset = TextDataset(tokenized_test_datasets)





# print(tokenized_datasets)

# Set hardware target
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
model.to(device)


metric = evaluate.combine(["accuracy"])
metric_f1 = evaluate.load("f1")

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    acc =  metric.compute(predictions=predictions, references=labels)
    f1 = metric_f1.compute(predictions=predictions, references=labels, average="macro")
    return {**acc, **f1}


# Set up the training arguments
training_args = TrainingArguments(output_dir="test_trainer",
                                  per_device_eval_batch_size=32,
                                  per_device_train_batch_size=32,
                                  num_train_epochs=1,
                                  eval_strategy="epoch")



trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=test_dataset,
    compute_metrics=compute_metrics,
)

trainer.train()

# Save the fine-tuned model and tokenizer
trainer.save_model("deberta")  # Specify your desired path
tokenizer.save_pretrained("deberta")  # Save the tokenizer
