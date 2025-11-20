import Fastify from "fastify";
import path from "path";
import Static from "@fastify/static";
import { fileURLToPath } from "url";
import login from "./login.js";

const fastify = Fastify({ logger: { level: "debug" } });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

fastify.register(Static, {
	root: path.join(__dirname, "public")
});

let code = {};
let roomsData = {};
let isLoggingIn = false;

const credit = { username: process.env.USERNAME, password: process.env.PASSWORD };
if (!credit.username || !credit.password) {
	console.error("請在環境變數中設定 USERNAME 和 PASSWORD");
	process.exit(1);
}

const fetchRoomsData = async () => {
	try {
		const response = await fetch("https://studycarrel.lib.nycu.edu.tw/pwaspace/configs/map.json");
		let maps = await response.json();
		maps = maps.MAPS || {};
		roomsData = {};
		const whitelist = ["201", "202", "203", "501", "D601", "D602", "C601", "C602", "C603", "C604"];
		for (const floor in maps) {
			const devices = maps[floor].devices || [];
			for (const dev of devices) {
				const name = dev.devicename;
				if (whitelist.includes(name)) roomsData[name] = dev.deviceid;
			}
		}
		return;
	} catch (error) {
		console.error("Failed to fetch rooms data:", error);
		return null;
	}
};

const makeRequest = async (url, formData) => {
	const form = new FormData();

	for (const [key, value] of Object.entries(formData)) {
		form.append(key, value);
	}

	const response = await fetch(url, {
		method: "POST",
		body: form
	});

	const text = await response.text();

	if (text.trim().startsWith("<")) {
		throw new Error("Session invalid - received XML response");
	}

	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`Failed to parse response: ${text.substring(0, 100)}`);
	}
};

const makeRequestWithRetry = async (url, formData) => {
	try {
		let response = await makeRequest(url, { sid: code.sid, authid: code.authid, ...formData });

		if (response[0]?.rescode !== "1" || response[0]?.resmsg?.includes("無效")) {
			// Need to re-login
			if (isLoggingIn) {
				// Wait for ongoing login to complete
				await new Promise(resolve => setTimeout(resolve, 1000));
				// Retry with new session
				response = await makeRequest(url, { sid: code.sid, authid: code.authid, ...formData });
			} else {
				isLoggingIn = true;
				try {
					console.log("Session invalid, logging in again...");
					const loginResult = await login(credit);
					if (loginResult.success) {
						code = { authid: loginResult.authid, sid: loginResult.sid };
						// Retry
						response = await makeRequest(url, { sid: code.sid, authid: code.authid, ...formData });
					}
				} finally {
					isLoggingIn = false;
				}
			}
		}

		return response;
	} catch (error) {
		// If we get an error (like XML response), try to re-login once
		if (error.message.includes("Session invalid") && !isLoggingIn) {
			isLoggingIn = true;
			try {
				console.log("Session invalid (error caught), logging in again...");
				const loginResult = await login(credit);
				if (loginResult.success) {
					code = { authid: loginResult.authid, sid: loginResult.sid };
					// Retry
					return await makeRequest(url, { sid: code.sid, authid: code.authid, ...formData });
				}
			} finally {
				isLoggingIn = false;
			}
		}
		throw error;
	}
};

fastify.get("/api/time", async (req, reply) => {
	try {
		const today = new Date().toISOString().split("T")[0].replace(/-/g, "/");

		const response = await makeRequestWithRetry("https://studycarrel.lib.nycu.edu.tw/RWDAPISSO/GetOpenTime.aspx", {
			userid: credit.username,
			lang: "zh-tw",
			restype: "json",
			spacetype: "2",
			bookdate: today
		});

		if (response[0]?.rescode === "1" && response[0]?.resdata?.[0]) {
			return {
				success: true,
				opentime: response[0].resdata[0].opentime,
				closetime: response[0].resdata[0].closetime
			};
		} else {
			return { success: false, message: response[0]?.resmsg || "Unknown error" };
		}
	} catch (error) {
		console.error(error);
		reply.code(500).send({ success: false, message: error.message });
	}
});

fastify.get("/api/room/:id?", async (req, reply) => {
	try {
		const { id } = req.params;
		const { date } = req.query;
		const target = date ? new Date(date) : new Date();
		const today = target.toISOString().split("T")[0].replace(/-/g, "/");

		if (Object.keys(roomsData).length === 0) {
			return { success: false, message: "No rooms found" };
		}

		const BATCH_SIZE = 10;
		const results = [];

		for (let i = 0; i < Object.keys(roomsData).length; i += BATCH_SIZE) {
			const batch = Object.keys(roomsData).slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map(async devicename => {
					try {
						const deviceid = roomsData[devicename];
						const response = await makeRequestWithRetry("https://studycarrel.lib.nycu.edu.tw/RWDAPISSO/BookTimeSegQuery.aspx", {
							userid: credit.username,
							lang: "zh-tw",
							restype: "json",
							spacetype: "2",
							sdate: today,
							deviceid,
							NO_LOADING: "true"
						});

						if (response[0]?.rescode === "1" && response[0]?.resdata) {
							const available = Object.fromEntries(response[0].resdata.map(s => [s.booktime, { bookvalue: s.bookvalue, canbook: s.canbook }]));
							return {
								deviceid,
								devicename,
								available
							};
						}
						return null;
					} catch (error) {
						console.error(`Error fetching room ${deviceId}:`, error.message);
						return null;
					}
				})
			);
			results.push(...batchResults);
		}

		// Filter out null results
		const rooms = results.filter(r => r !== null);

		if (id) {
			// Single room query
			if (rooms.length > 0) {
				return {
					success: true,
					...rooms[0]
				};
			} else {
				return { success: false, message: "Room not found or no data available" };
			}
		} else {
			// All rooms query
			return {
				success: true,
				rooms
			};
		}
	} catch (error) {
		console.error(error);
		reply.code(500).send({ success: false, message: error.message });
	}
});

fastify.post("/api/reserve", async (req, reply) => {
	try {
		const { id, date, range, devicename } = req.body;

		if (!id || !date || !range || !Array.isArray(id) || !Array.isArray(range)) {
			reply.status(400).send({ success: false, message: "Invalid request body" });
		}
		let deviceid = req.body.deviceid;
		if (devicename && !deviceid) {
			deviceid = roomsData[devicename];
			if (!deviceid) {
				reply.status(400).send({ success: false, message: `Room ${devicename} not found` });
			}
		}

		if (!deviceid) {
			reply.status(400).send({ success: false, message: "deviceid or devicename is required" });
		}

		const reserveDate = new Date(date).toISOString().split("T")[0].replace(/-/g, "/");

		const response = await makeRequestWithRetry("https://studycarrel.lib.nycu.edu.tw/RWDAPISSO/BookAdd.aspx", {
			userid: id.join(","),
			lang: "zh-tw",
			restype: "json",
			spacetype: "2",
			sdate: reserveDate,
			deviceid,
			itemno: "",
			booktime: range.join(",")
		});

		if (response[0]?.rescode === "1") {
			return { success: true };
		} else {
			return { success: false, message: response[0]?.resmsg || "Reservation failed" };
		}
	} catch (error) {
		console.error(error);
		reply.code(500).send({ success: false, message: error.message });
	}
});

fastify.get("/api/search", async (req, reply) => {
	try {
		const { id } = req.query;

		if (!id) {
			reply.status(400).send({ success: false, message: "Invalid request body" });
		}

		const response = await makeRequestWithRetry("https://studycarrel.lib.nycu.edu.tw/RWDAPISSO/BookUserVerify.aspx", {
			userid: [id],
			lang: "zh-tw",
			restype: "json",
			spacetype: "2"
		});

		if (response[0]?.rescode === "1" && response[0]?.usernames) {
			return {
				success: true,
				name: response[0].usernames
			};
		} else {
			return { success: false, message: response[0]?.resmsg || "User not found" };
		}
	} catch (error) {
		console.error(error);
		reply.code(500).send({ success: false, message: error.message });
	}
});

try {
	fastify.listen({ port: process.env.PORT || 3000 });
	const result = await login(credit);
	if (result.success) {
		code = { authid: result.authid, sid: result.sid };
		console.log("Login successful, cookies obtained.");
	} else {
		console.log("Login failed:", result.message);
	}
	console.log("Server running at http://localhost:" + (process.env.PORT || 3000));
	await fetchRoomsData();
	console.log(roomsData);
	console.log("Room data loaded.");
} catch (err) {
	console.error("Failed to start server:", err);
	process.exit(1);
}
