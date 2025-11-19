import puppeteer from "puppeteer";
import { ocr } from "./ocr.js";

let logging = false;

const login = async credit => {
	if (logging) return;
	logging = true;
	const browser = await puppeteer.launch({
		headless: true,
		// slowMo: 30, // (可選) 動作放慢 30ms 比較好看
		args: ["--no-sandbox"]
	});
	const page = await browser.newPage();
	await page.setRequestInterception(true);

	page.on("request", req => {
		const url = req.url();
		const type = req.resourceType();
		if (["image", "stylesheet", "font"].includes(type) || url.includes("google") || url.includes("facebook")) return req.abort();
		req.continue();
	});

	const MAX_RETRIES = 5;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		console.log(`\n嘗試登入 (第 ${attempt} 次)...`);
		await page.goto(
			"https://idm.nycu.ust.edu.tw/sso/886UST_NYCU/oidc/login/?next=/openid/886UST_NYCU/authorize/%3Fclient_id%3D207849%26response_type%3Dcode%26redirect_uri%3Dhttps%3A//studycarrel.lib.nycu.edu.tw/openidcallback.aspx%26state%3Dpwaportal%26scope%3Dopenid",
			{
				waitUntil: "networkidle2"
			}
		);
		const captchaBuffer = await page.$eval("#captcha_img", async img => {
			const url = img.src;
			const res = await fetch(url);
			const arr = await res.arrayBuffer();
			return Array.from(new Uint8Array(arr));
		});
		const captchaImage = Buffer.from(captchaBuffer);
		const captcha_value = await ocr(captchaImage);
		console.log("辨識結果:", captcha_value);
		await page.evaluate(
			(captchaValue, cred) => {
				document.querySelector("input#id_username").value = cred.username;
				document.querySelector("input#id_password").value = cred.password;
				document.querySelector("#checkNum").value = captchaValue.trim();
			},
			captcha_value,
			credit
		);
		await page.click(".btn_primary");
		try {
			await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 5000 });
			const currentUrl = page.url();
			if (currentUrl.includes("idm.nycu.ust.edu.tw/sso")) {
				console.log("❌ 登入失敗，可能是驗證碼錯誤");
				await page.evaluate(() => {
					const checkNumInput = document.querySelector("#checkNum");
					if (checkNumInput) checkNumInput.value = "";
				});
				continue;
			}
			const cookies = await browser.cookies();
			const libraryPortalSid = cookies.find(cookie => cookie.name === "library-portal-sid");
			const libraryPortalAuthId = cookies.find(cookie => cookie.name === "library-portal-authid");

			if (libraryPortalSid && libraryPortalAuthId) {
				console.log("✅ 登入成功！");
				logging = false;
				await browser.close();
				return {
					success: true,
					sid: libraryPortalSid.value,
					authid: libraryPortalAuthId.value
				};
			} else {
				console.log("❌ 未取得預期的 cookies，重新嘗試");
			}
		} catch (error) {
			console.log("❌ 頁面跳轉超時或發生錯誤，重新嘗試");
		}
	}
	await browser.close();
	console.log(`\n❌ 已達最大嘗試次數 (${MAX_RETRIES})，登入失敗`);
	logging = false;
	return { success: false, message: `登入失敗 ${MAX_RETRIES} 次了，請稍後再試。` };
};

export default login;

// 如果是直接執行 login.js，就跑 login()
if (import.meta.url === `file://${process.argv[1]}`) {
	login();
}
