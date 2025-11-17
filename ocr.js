import fs from "fs";
import PImage from "pureimage";
import Tesseract from "tesseract.js";

// ★ Step 1: Load image
async function loadImage(path) {
	const img = await PImage.decodePNGFromStream(fs.createReadStream(path));
	return img;
}

// ★ Step 2: Clean captcha (pure JS)
function cleanImage(img) {
	const w = img.width;
	const h = img.height;

	// --- 1) 灰階 + 二值化 ---
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = (y * w + x) * 4;
			const r = img.data[idx];
			const g = img.data[idx + 1];
			const b = img.data[idx + 2];
			const gray = (r + g + b) / 3;

			// 黑字(0) / 白底(255)
			const v = gray < 150 ? 0 : 255;
			img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = v;
			img.data[idx + 3] = 255; // alpha 必須不透明
		}
	}

	// helper：讀寫單一像素（只看 R）
	const getPixel = (buf, x, y) => buf[(y * w + x) * 4];
	const setPixel = (buf, x, y, v) => {
		const idx = (y * w + x) * 4;
		buf[idx] = buf[idx + 1] = buf[idx + 2] = v;
		// alpha 保持 255
	};

	// --- 2) 侵蝕 (erode)：拿掉細線 ---
	const src = new Uint8ClampedArray(img.data); // 原圖
	const eroded = new Uint8ClampedArray(img.data); // 侵蝕結果

	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			// 如果有任何一個鄰居是白色，就變白（黑區域收縮）
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

	// --- 3) 膨脹 (dilate)：把字膨脹回來 ---
	const dilated = new Uint8ClampedArray(eroded);

	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			// 鄰居只要有黑，就設成黑（黑區域長大）
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

	// 把 dilated 寫回 img
	for (let i = 0; i < img.data.length; i += 4) {
		img.data[i] = img.data[i + 1] = img.data[i + 2] = dilated[i];
		img.data[i + 3] = 255;
	}

	// --- 4) 裁掉下半部空白區（如果你的字都在上半部） ---
	const cropHeight = 40; // 可依實際調整
	const newImg = PImage.make(w, cropHeight);
	const ctx = newImg.getContext("2d");
	const srcCtx = img.getContext("2d");
	const useful = srcCtx.getImageData(0, 0, w, cropHeight);
	ctx.putImageData(useful, 0, 0);

	return newImg;
}

// ★ Step 3: Divide image into 4 equal parts
function divideImage(img) {
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
		chars.push(newImg);
	}

	return chars;
}

// ★ Step 4：OCR single character
async function ocrChar(worker, path, index) {
	const result = await worker.recognize(path);
	const text = result.data.text.trim();
	return text;
}

// ★ MAIN RUN
(async () => {
	const img = await loadImage("img/9559.png");
	const cleaned = cleanImage(img);

	// save cleaned image
	const out = fs.createWriteStream("clean.png");
	await PImage.encodePNGToStream(cleaned, out);
	// Divide into 4 characters

	// Create and initialize worker once
	const worker = await Tesseract.createWorker("eng");
	await worker.loadLanguage("eng");
	await worker.initialize("eng");
	await worker.setParameters({
		tessedit_char_whitelist: "0123456789",
		tessedit_pageseg_mode: 7 // Treat image as a single line
	});

	const result = await worker.recognize("clean.png");
	console.log(result.data.text);
	await worker.terminate();
})();
