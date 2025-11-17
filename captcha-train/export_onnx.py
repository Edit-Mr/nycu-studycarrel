# export_onnx.py
import torch
from train import DigitCNN

model = DigitCNN()
model.load_state_dict(torch.load("digit_cnn.pt"))
model.eval()

dummy = torch.randn(1, 1, 32, 32)

torch.onnx.export(
    model,
    dummy,
    "digit_cnn.onnx",
    input_names=["input"],
    output_names=["output"],
    opset_version=18
)

print("Exported: digit_cnn.onnx")
