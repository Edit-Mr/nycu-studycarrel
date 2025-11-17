import Tesseract from "tesseract.js";

async function ocr(buffer) {
  const { data: { text } } = await Tesseract.recognize(buffer, "eng", {
    tessedit_char_whitelist: "0123456789",
  });

  return text.replace(/\D/g, "").trim();
}

// const url = "https://idm.nycu.ust.edu.tw/captcha/image/2dd13420e544368446e7621799b39c43e9f4a82f@2/";

// const resp = await fetch(url);
// const captchaImage = Buffer.from(await resp.arrayBuffer());

const path = "clean copy.png";
import fs from "fs/promises";
const captchaImage = await fs.readFile(path);


const captcha_value = await ocr(captchaImage);
console.log("OCR result:", captcha_value);