import PImage from "pureimage";
import ort from "onnxruntime-node";
const { Readable } = await import("stream");
// --- SAME cleaning function you already built ---
const cleanImage = (img) => {
	const w = img.width;
	const h = img.height;

	// grayscale + threshold
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = (y * w + x) * 4;
			const r = img.data[idx];
			const g = img.data[idx + 1];
			const b = img.data[idx + 2];
			const gray = (r + g + b) / 3;

			const v = gray < 150 ? 0 : 255;
			img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = v;
			img.data[idx + 3] = 255;
		}
	}

	// erosion
	const src = new Uint8ClampedArray(img.data);
	const eroded = new Uint8ClampedArray(img.data);

	const getPixel = (buf, x, y) => buf[(y * w + x) * 4];
	const setPixel = (buf, x, y, v) => {
		const idx = (y * w + x) * 4;
		buf[idx] = buf[idx + 1] = buf[idx + 2] = v;
		buf[idx + 3] = 255;
	};

	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			let keepBlack = true;
			for (let dy = -1; dy <= 1 && keepBlack; dy++) {
				for (let dx = -1; dx <= 1 && keepBlack; dx++) {
					if (getPixel(src, x + dx, y + dy) === 255) {
						keepBlack = false;
					}
				}
			}
			setPixel(eroded, x, y, keepBlack ? 0 : 255);
		}
	}

	// dilation
	const dilated = new Uint8ClampedArray(eroded);
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			let anyBlack = false;
			for (let dy = -1; dy <= 1 && !anyBlack; dy++) {
				for (let dx = -1; dx <= 1 && !anyBlack; dx++) {
					if (getPixel(eroded, x + dx, y + dy) === 0) {
						anyBlack = true;
					}
				}
			}
			setPixel(dilated, x, y, anyBlack ? 0 : 255);
		}
	}

	// write back
	for (let i = 0; i < img.data.length; i += 4) {
		img.data[i] = img.data[i + 1] = img.data[i + 2] = dilated[i];
		img.data[i + 3] = 255;
	}

	// crop upper half
	const cropHeight = 40;
	const newImg = PImage.make(w, cropHeight);
	const ctx = newImg.getContext("2d");
	const srcCtx = img.getContext("2d");
	const useful = srcCtx.getImageData(0, 0, w, cropHeight);
	ctx.putImageData(useful, 0, 0);

	return newImg;
}

// --- Splits into 4 digits and resizes to 32x32 ---
const splitDigits = (img) => {
	const w = img.width;
	const h = img.height;
	const charWidth = Math.floor(w / 4);

	const chars = [];

	for (let i = 0; i < 4; i++) {
		const startX = i * charWidth;

		const newImg = PImage.make(charWidth, h);
		const ctx = newImg.getContext("2d");
		const srcCtx = img.getContext("2d");

		const charData = srcCtx.getImageData(startX, 0, charWidth, h);
		ctx.putImageData(charData, 0, 0);

		// resize to 32x32
		const resized = PImage.make(32, 32);
		const rctx = resized.getContext("2d");
		rctx.drawImage(newImg, 0, 0, charWidth, h, 0, 0, 32, 32);

		chars.push(resized);
	}
	return chars;
}

// Convert PImage image to Float32 tensor [1,1,32,32]
const imageToTensor = (img) => {
	const arr = new Float32Array(1 * 1 * 32 * 32);

	let ptr = 0;
	for (let y = 0; y < 32; y++) {
		for (let x = 0; x < 32; x++) {
			const idx = (y * 32 + x) * 4;
			arr[ptr++] = img.data[idx] / 255.0;
		}
	}
	return arr;
}

const predictCaptcha = async (buffer) => {
	// Convert Buffer to ReadableStream for pureimage
	const stream = Readable.from(buffer);
	const img = await PImage.decodePNGFromStream(stream);
	const cleaned = cleanImage(img);
	const digits = splitDigits(cleaned);

	const session = await ort.InferenceSession.create("captcha-train/digit_cnn.onnx");

	let result = "";

	for (const d of digits) {
		const tensor = imageToTensor(d);
		const input = new ort.Tensor("float32", tensor, [1, 1, 32, 32]);

		const out = await session.run({ input });
		const logits = out.output.data;

		// argmax
		let maxI = 0;
		for (let i = 1; i < 10; i++) {
			if (logits[i] > logits[maxI]) maxI = i;
		}

		result += maxI;
	}

	return result;
}

export { predictCaptcha as ocr };
