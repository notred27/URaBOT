import evaluate
from datasets import load_dataset, Dataset
import numpy as np
from transformers import RobertaTokenizer, RobertaForSequenceClassification, get_scheduler
from torch.utils.data import DataLoader, Dataset
from torch.optim import AdamW
import torch
from tqdm.auto import tqdm
import pandas as pd
from tqdm.auto import tqdm
from transformers import TrainingArguments, Trainer
from transformers import AutoModel, AutoModelForSequenceClassification, AutoConfig, AutoTokenizer
from data_test import df_train, df_test, df_val
from torch import nn
from torcheval.metrics.functional import multiclass_f1_score

MODEL_NAME = 'distilbert-base-uncased'


#Define Model
class DropModel(nn.Module):
    def __init__(self):
        super(DropModel, self).__init__()
        self.layer1 = nn.Linear(34, 100)
        self.layer2 = nn.Linear(100, 100)
        self.layer3 = nn.Linear(100,2)
        nn.init.uniform_(self.layer1.weight)
        self.lr = .01
    def forward(self, input):
        hidden = nn.functional.relu(self.layer1(input))
        hidden2 = nn.functional.relu(self.layer2(hidden))
        output = self.layer3(hidden2)
        return output
    
def checkAcc(pred, corr):
    numCorr = 0
    for i in range(len(pred)):
        if (pred[i] == corr[i]):
            numCorr += 1
    return numCorr / len(pred)

# Load model and tokenizers
model1 = DropModel()
config = AutoConfig.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)




def tokenize_function(examples):
    # 70 is an estimate for now
    for i in  range(len(examples)):
        examples[i] = ''.join(str(x) for x in examples[i])
    return tokenizer(examples, truncation=True, padding=True)

#  Load the train dataset 
df = df_train

# Tokenize and reformat the data to be passed to pytorch traine
train_labels = df["account_type"].tolist()
train_labels = torch.tensor(train_labels)
df.drop('account_type', axis=1)
train_dataset = df.values.tolist()

tokenized_train_datasets = tokenize_function(train_dataset)



#  Load the test dataset 
df = df_test

# Tokenize and reformat the data to be passed to pytorch trainer
test_labels = df["account_type"].tolist()
test_labels = torch.tensor(test_labels)
df.drop('account_type', axis=1)
test_dataset = df.values.tolist()
tokenized_test_datasets = tokenize_function(test_dataset)

# Add labels to the inputs
#tokenized_test_datasets["labels"] = test_labels

class TextDataset(Dataset):
    def __init__(self, inputs):
        self.inputs = inputs

    def __len__(self):
        return len(self.inputs["input_ids"])

    def __getitem__(self, idx):
        return {key: tensor[idx] for key, tensor in self.inputs.items()}

train_dataset = TextDataset(tokenized_train_datasets)

# Set hardware target
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
model1.to(device)


metric = evaluate.combine(["accuracy"])
metric_f1 = evaluate.load("f1")

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    acc =  metric.compute(predictions=predictions, references=labels)
    f1 = metric_f1.compute(predictions=predictions, references=labels, average="macro")
    return {**acc, **f1}

def train_model(model, train_dataset, num_epochs, batch_size):
    loss_func = nn.CrossEntropyLoss()
    params = list(model.parameters())
    optimizer = AdamW(params, lr=model.lr, weight_decay=.01)
    train_dataset = torch.Tensor(train_dataset["input_ids"])
    new_train_dataset = torch.empty(12870, 34)
    for i in range(12870):
        for j in range(34):
            new_train_dataset[i][j] = train_dataset[i][j]
    train_loss = 0
    for epoch in range(num_epochs):
        for i in range(0, len(new_train_dataset), batch_size):
            x_data_batch = new_train_dataset[i:i + batch_size]
            y_data_batch = train_labels[i:i + batch_size]
            output = model(x_data_batch)
            loss = loss_func(output, y_data_batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * batch_size
    print("Training Loss: ", train_loss)
    return model
model1 = train_model(model1, tokenized_train_datasets, 5, 16)


def test_model(model, test_dataset):
    test_dataset = torch.Tensor(test_dataset["input_ids"])
    new_test_dataset = torch.empty(4290, 34)
    for i in range(4290):
        for j in range(34):
            new_test_dataset[i][j] = test_dataset[i][j]
    output = model(new_test_dataset)
    np.save("Models\\neural_net_logits", output.detach().numpy())
    _, pred = torch.max(output, 1)
    print("Test Data Accuracy: ", checkAcc(pred, test_labels))
    print("Test Data F1 Score: ", multiclass_f1_score(pred, test_labels, num_classes=2))
test_model(model1, tokenized_test_datasets)
# Save the fine-tuned model and tokenizer
torch.save(model1.state_dict(), "Models\\nn_model")
tokenizer.save_pretrained("distilbert")  # Save the tokenizer
np.save("Models\\neural_net_labels", test_labels)