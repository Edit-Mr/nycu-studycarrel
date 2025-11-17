import os
import glob
import numpy as np
from PIL import Image, ImageOps
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader


# ----------- IMAGE PREPROCESSING (同你 JS 的版本) -----------

def clean_image(img):
    # 灰階
    img = ImageOps.grayscale(img)
    arr = np.array(img)

    # 二值化
    threshold = 150
    arr = np.where(arr < threshold, 0, 255).astype(np.uint8)

    # 侵蝕 (remove thin lines)
    eroded = arr.copy()
    h, w = arr.shape
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            neighbors = arr[y-1:y+2, x-1:x+2]
            if np.any(neighbors == 255):
                eroded[y, x] = 255

    # 膨脹 (grow digits back)
    dilated = eroded.copy()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            neighbors = eroded[y-1:y+2, x-1:x+2]
            if np.any(neighbors == 0):
                dilated[y, x] = 0

    # 裁掉下半部（依你 captcha）
    dilated = dilated[:40, :]

    # 回傳 PIL
    return Image.fromarray(dilated)


# ----------- DATASET -----------

class CaptchaDataset(Dataset):
    def __init__(self, folder):
        self.paths = glob.glob(os.path.join(folder, "*.png"))
        self.data = []

        for p in self.paths:
            img = Image.open(p)
            img = clean_image(img)

            w, h = img.size
            char_w = w // 4

            # read label from filename e.g. 0193.png
            name = os.path.basename(p).split(".")[0]

            for i in range(4):
                digit = int(name[i])
                crop = img.crop((i*char_w, 0, (i+1)*char_w, h))
                crop = crop.resize((32, 32))  # CNN input size

                arr = np.array(crop).astype(np.float32) / 255.0
                arr = arr.reshape(1, 32, 32)

                self.data.append((arr, digit))

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        img, label = self.data[idx]
        return torch.tensor(img), torch.tensor(label)


# ----------- CNN MODEL -----------

class DigitCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Conv2d(16, 32, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),

            nn.Flatten(),
            nn.Linear(32 * 8 * 8, 128),
            nn.ReLU(),
            nn.Linear(128, 10)
        )

    def forward(self, x):
        return self.net(x)


# ----------- TRAIN -----------

def train_model():
    dataset = CaptchaDataset("img")
    loader = DataLoader(dataset, batch_size=64, shuffle=True)

    model = DigitCNN()
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    EPOCHS = 15
    for epoch in range(EPOCHS):
        total_loss = 0
        correct = 0
        total = 0

        for imgs, labels in loader:
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            _, pred = torch.max(outputs, 1)
            correct += (pred == labels).sum().item()
            total += labels.size(0)

        print(f"[{epoch+1}/{EPOCHS}]  loss={total_loss:.4f}  acc={correct/total:.4f}")

    torch.save(model.state_dict(), "digit_cnn.pt")
    print("Model saved: digit_cnn.pt")


if __name__ == "__main__":
    train_model()
