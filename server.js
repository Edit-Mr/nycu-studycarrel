import Fastify from "fastify";
import { CookieJar } from "tough-cookie";
import fetchCookie from "fetch-cookie";
import Tesseract from "tesseract.js";

// 包裝 Node.js 內建 fetch，讓它能吃 cookie jar
const jar = new CookieJar();
const client = fetchCookie(fetch, jar);

const fastify = Fastify({ logger: true, level: "error" });

// 工具函數：取得 CSRF + hashkey
async function getLoginInfo() {
	const loginUrl = "https://idm.nycu.ust.edu.tw/sso/886UST_NYCU/oidc/login/";

	// GET login page
	const resp = await client(loginUrl, { method: "GET" });
	const html = await resp.text();

	// 抽取 CSRF
	const csrf = html.match(/name="csrfmiddlewaretoken" value="(.+?)"/)?.[1] ?? null;

	// 抽取 Captcha hashkey
	const hashkey = html.match(/name="hashkey" value="(.+?)"/)?.[1] ?? null;

	// 抽取 next 參數
	const nextUrl = html.match(/name="next" value="(.+?)"/)?.[1] ?? "";

	return { csrf, hashkey, nextUrl };
}

// Captcha 下載
async function downloadCaptcha(hashkey) {
	// 通常 Captcha URL 是 hashkey@2/
	const captchaUrl = `https://idm.nycu.ust.edu.tw/captcha/image/${hashkey}@2/`;
  console.log("Downloading Captcha from:", captchaUrl);
	const resp = await client(captchaUrl);
	const buffer = Buffer.from(await resp.arrayBuffer());
	return buffer;
}

async function ocr(buffer) {
	const {
		data: { text }
	} = await Tesseract.recognize(buffer, "eng", {
		tessedit_char_whitelist: "0123456789"
	});

	return text.replace(/\D/g, "").trim();
}

/**
 * Fastify route: 測試登入
 */
fastify.get("/test-login", async (req, reply) => {
	try {
		// STEP 1: GET login page
		const { csrf, hashkey, nextUrl } = await getLoginInfo();
		if (!csrf || !hashkey) {
			return reply.send({ error: "Cannot extract login parameters" });
		}

		// STEP 2: download Captcha (這裡你可以自行加入 OCR)
		const captchaImage = await downloadCaptcha(hashkey);

		// 假設 Captcha 很簡單 → 暫時直接用固定測試值
		// TODO: 你要替換成 OCR
		const captcha_value = await ocr(captchaImage);
    console.log("OCR result:", captcha_value);

		// STEP 3: POST login
		const loginUrl = "https://idm.nycu.ust.edu.tw/sso/886UST_NYCU/oidc/login/";

		const form = new URLSearchParams();
		form.append("csrfmiddlewaretoken", csrf);
		form.append("username", "114550020"); // 修改
		form.append("password", "O4qyQTLtPW64s5K"); // 修改
		form.append("hashkey", hashkey);
		form.append("captcha_value", captcha_value);
		form.append("next", nextUrl);

		const loginResp = await client(loginUrl, {
			method: "POST",
			body: form,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Referer: loginUrl
			},
			redirect: "manual"
		});

		// 查看 Set-Cookie 有沒有 sessionid
		const setCookies = loginResp.headers.get("set-cookie");

		return reply.send({
			status: "ok",
			csrf,
			hashkey,
			nextUrl,
			captcha_used: captcha_value,
			setCookies
		});
	} catch (err) {
		console.error(err);
		return reply.send({ error: err.message });
	}
});

// 啟動伺服器
fastify.listen({ port: 3000 }, () => {
	console.log("Server running at http://localhost:3000");
});
