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

	// grayscale + binary
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = (y * w + x) * 4;
			const r = img.data[idx];
			const g = img.data[idx + 1];
			const b = img.data[idx + 2];
			const gray = (r + g + b) / 3;

			const v = gray < 120 ? 0 : 255;
			img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = v;

			img.data[idx + 3] = 255; // ←← FIX: Alpha channel MUST be opaque
		}
	}

	// Remove thin noise: count neighbors
	const out = new Uint8ClampedArray(img.data);

	const get = (x, y) => out[(y * w + x) * 4];
	const set = (x, y, val) => {
		const idx = (y * w + x) * 4;
		img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = val;
	};

	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			if (get(x, y) === 255) continue; // black background only
			// count white neighbors
			let neighbors = 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (get(x + dx, y + dy) === 0) neighbors++;
				}
			}
			// if too few → thin line → delete
			if (neighbors <= 2) {
				set(x, y, 255);
			}
		}
	}

	function cropUsefulRegion(img) {
		const w = img.width;
		const h = img.height;

		const useful = img.getContext("2d").getImageData(0, 0, w, h);

		// 掃描前 40 像素的文字區域
		const cropHeight = 40;

		const newImage = PImage.make(w, cropHeight);
		newImage.getContext("2d").putImageData(useful, 0, 0, 0, 0, w, cropHeight);

		return newImage;
	}

	const cleanedVisual = cropUsefulRegion(img);

	return cleanedVisual;
}

// ★ Step 3：OCR
async function ocr(path) {
	console.log("開始 OCR...");
	const { data } = await Tesseract.recognize(path, "eng", {
		tessedit_char_whitelist: "0123456789"
	});
	console.log("OCR 結果：", data.text.trim());
	return data.text;
}

// ★ MAIN RUN
(async () => {
	const img = await loadImage("captcha-train/images/0143.png");
	const cleaned = cleanImage(img);

	// save cleaned image
	const out = fs.createWriteStream("clean.png");
	await PImage.encodePNGToStream(cleaned, out);
	console.log("✔ 已輸出 clean.png");

	// OCR
	const text = await ocr("clean.png");
	console.log("📌 OCR 結果：", text);
})();
