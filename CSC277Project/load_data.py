import os
import torch
import csv

data_file = open("bot_detection_data.csv", "r")
reader = csv.reader(data_file)
with open ("train/train_dataset.csv", "w", newline='') as train_file:
    writer = csv.writer(train_file)
    line_num = 1
    for row in reader:
        print(row)
        if (line_num == 30001):
            writer.writerow(row)
            break
        writer.writerow(row)
        line_num += 1
with open ("val/val_dataset.csv", "w", newline='') as val_file:
    writer = csv.writer(val_file)
    line_num = 1
    for row in reader:
        print(row)
        if (line_num == 10000):
            writer.writerow(row)
            break
        writer.writerow(row)
        line_num += 1
with open ("test/test_dataset.csv", "w", newline='') as test_file:
    writer = csv.writer(test_file)
    line_num = 1
    for row in reader:
        print(row)
        writer.writerow(row)
        line_num += 1
