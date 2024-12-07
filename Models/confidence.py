# Generate confidence intervals
import math

# Evaluation accuracy of the model
test_acc = 0.76171

# Set alpha and look up z
confidence_interval = 0.95
z = 1.96

num_samples = 4290 # Size of test dataset

epsilon = z * math.sqrt(test_acc * (1 - test_acc) / num_samples)
print("Error: +-", epsilon)
