from PIL import Image
import numpy as np
import torch
from train import clean_image, DigitCNN

def predict(path):
    img = Image.open(path)
    img = clean_image(img)

    model = DigitCNN()
    model.load_state_dict(torch.load("digit_cnn.pt"))
    model.eval()

    w, h = img.size
    char_w = w // 4

    result = ""

    for i in range(4):
        crop = img.crop((i*char_w, 0, (i+1)*char_w, h))
        crop = crop.resize((32, 32))

        arr = np.array(crop).astype(np.float32)/255.0
        arr = arr.reshape(1,1,32,32)

        tensor = torch.tensor(arr)
        out = model(tensor)
        digit = torch.argmax(out).item()
        result += str(digit)

    return result

print(predict("img/9559.png"))
