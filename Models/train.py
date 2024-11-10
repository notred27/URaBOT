import evaluate
from datasets import load_dataset
from transformers import RobertaTokenizer, RobertaForSequenceClassification, get_scheduler
# from transformers import get_scheduler
from torch.utils.data import DataLoader
from torch.optim import AdamW
import torch
from tqdm.auto import tqdm

from transformers import AutoModel, AutoModelForSequenceClassification, AutoConfig, AutoTokenizer
MODEL_NAME = 'microsoft/deberta-v3-base'

# Load pre-trained models and tokenizers
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, num_labels = 3)
config = AutoConfig.from_pretrained(MODEL_NAME)
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)


#  Load the dataset 
dataset = load_dataset("tweet_eval", name="sentiment")


def tokenize_function(examples):
    return tokenizer(examples["text"], return_tensors='pt', max_length = 20, truncation = True, padding = True) # FIXME: Arbitrary max_length

# Tokenize and reformat the data to be passed to pytorch trainer
tokenized_datasets = dataset.map(tokenize_function, batched=True)

tokenized_datasets = tokenized_datasets.remove_columns(["text"])
tokenized_datasets = tokenized_datasets.rename_column("label", "labels")
tokenized_datasets.set_format("torch")


# Split dataset
small_train_dataset = tokenized_datasets["train"].shuffle(seed=42).select(range(1000))
small_eval_dataset = tokenized_datasets["test"].shuffle(seed=42).select(range(1000))


# Create dataloaders for pytorch
train_dataloader = DataLoader(small_train_dataset, shuffle=True, batch_size=16)
eval_dataloader = DataLoader(small_eval_dataset, batch_size=16)


# Load the optimizers
optimizer = AdamW(model.parameters(), lr=5e-5)


# Define the number of training steps and learning rate scheduler
num_epochs = 1
num_training_steps = num_epochs * len(train_dataloader)
lr_scheduler = get_scheduler(
    name="linear", optimizer=optimizer, num_warmup_steps=0, num_training_steps=num_training_steps
)

# Set hardware target
device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
model.to(device)


# Main training loop
progress_bar = tqdm(range(num_training_steps))

model.train()
for epoch in range(num_epochs):
    for batch in train_dataloader:
        batch = {k: v.to(device) for k, v in batch.items()}
        outputs = model(**batch)
        loss = outputs.loss
        loss.backward()

        optimizer.step()
        lr_scheduler.step()
        optimizer.zero_grad()
        progress_bar.update(1)

torch.save(model.state_dict(), "model_weights.pth")

# Evaluate the model
acc_metric = evaluate.load("accuracy")

model.eval()



for batch in eval_dataloader:
    batch = {k: v.to(device) for k, v in batch.items()}
    with torch.no_grad():
        outputs = model(**batch)

    logits = outputs.logits
    predictions = torch.argmax(logits, dim=-1)
    acc_metric.add_batch(predictions=predictions, references=batch["labels"])

acc_metric.compute()

