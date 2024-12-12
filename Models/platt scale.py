import numpy as np
from sklearn.calibration import calibration_curve
import matplotlib.pyplot as plt
from torch.utils.data import DataLoader, TensorDataset
import torch
from torch import nn, optim

# Set seed for data splitting
np.random.seed(42)

# Load the .npy file
logits = np.load('Models\\trained_models\\debertaV3logits.npy')

# Load the .npy file
labels = np.load('Models\\trained_models\\debertaV3labels.npy')

# Calculate scaled output from activation
sigmoid = []
for row in logits:
    act = (1 / (1 + np.exp(-row)))

    if (np.argmax(row, axis=-1).item() == 0):
        sigmoid.append(1 - act[0])
    else:
        sigmoid.append(act[1])

sigmoid = np.array(sigmoid)


# Pair the output with their label
stacked = np.column_stack((sigmoid, labels))

n = 2145 # Split data in half for test and eval

# Get random indices to split the eval dataset
idx = np.random.choice(stacked.shape[0], n, replace=False)  
unselected_indices = np.setdiff1d(np.arange(stacked.shape[0]), idx)  # Find the indices that were not selected

val = stacked[idx]
test = stacked[unselected_indices]

# Basic regression model to get A and B for Platt Scaling
class LogisticRegressionModel(nn.Module):
    def __init__(self, input_dim):
        super(LogisticRegressionModel, self).__init__()
        self.fc = nn.Linear(input_dim, 1)  
        self.crit = nn.BCELoss()
        self.opt = optim.SGD(self.fc.parameters(), lr=0.01)

    def forward(self, x):
        return torch.sigmoid(self.fc(x))  # Apply sigmoid activation
    

def trainRegression(model, X, y, device):
    num_epochs = 3000

    X = torch.from_numpy(X).float()  # Convert X to float32
    y = torch.from_numpy(y).float()  # Convert y to float32

    dataset = TensorDataset(X, y)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)


    model.train()  # Ensure model is in training mode

    # Training loop
    for epoch in range(num_epochs):
        for inputs, targets in dataloader:
            # Forward pass
            # print(inputs.squeeze(dim=-1))
            # print(targets)

            y_pred, labels = model(inputs.to(device)), targets.to(device)
            # print(y_pred)
            loss = model.crit(y_pred, labels)

            # Backward pass and optimization
            model.opt.zero_grad()
            loss.backward()
            model.opt.step()

        # Print loss after every epoch
        if (epoch + 1) % 100 == 0:
            print(f'Epoch [{epoch+1}/{num_epochs}], Loss: {loss.item():.4f}')
    return model.fc.weight, model.fc.bias


val_set = np.hsplit(val, stacked.shape[1])
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
reg_model = LogisticRegressionModel(1)
A, B = trainRegression(reg_model, val_set[0], val_set[1], device)

print(A.detach(), B.detach())
A = A.item()
B = B.item()

def apply_Plat_Scale(tensor, A, B):
    return (1/(1+ np.exp(-(A * tensor + B))))


column_arrays = np.hsplit(test, stacked.shape[1])


scaled = np.array([])
for val in column_arrays[0]:
    scaled = np.append(scaled, apply_Plat_Scale(val, A, B))

print("A:", A, " B: ", B)

# Get the arrays back to display plot

prob_true, prob_pred = calibration_curve(column_arrays[1], column_arrays[0], n_bins=10, pos_label=(1))
plt.plot(prob_pred, prob_true, marker='o')
plt.plot([0, 1], [0, 1], linestyle='--')  # Diagonal line
plt.xlabel('Mean Predicted Probability')
plt.ylabel('Fraction of Positives')
plt.title('Reliability Curve of Fine-Tuned DeBERTa V3 Base')
plt.show()

prob_true_ps, prob_pred_ps = calibration_curve(column_arrays[1], scaled, n_bins=10, pos_label=(1))
plt.plot(prob_pred_ps, prob_true_ps, marker='o')
plt.plot([0, 1], [0, 1], linestyle='--')  # Diagonal line
plt.xlabel('Mean Predicted Probability')
plt.ylabel('Fraction of Positives')
plt.title('Reliability Curve of Fine-Tuned DeBERTa V3 Base')
plt.show()


plt.plot(prob_pred, prob_true, marker='.', label="Default Calibration Curve")
plt.plot(prob_pred_ps, prob_true_ps, marker='.', color='r', label="Platt Scaled Calibration Curve")
plt.plot([0, 1], [0, 1], linestyle='--')  # Diagonal line
plt.xlabel('Mean Predicted Probability')
plt.ylabel('Fraction of Positives')
plt.legend(loc="lower right")
plt.title('Reliability Curve of Fine-Tuned DeBERTa V3 Base')
plt.show()
