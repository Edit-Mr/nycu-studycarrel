import Fastify from "fastify";
import path from "path";
import Static from "@fastify/static";
import login from "./login.js";

const fastify = Fastify({ logger: true, level: "error" });

let code = {};
let roomsData = null;
let isLoggingIn = false; // Prevent multiple simultaneous login attempts

// Fetch and cache room data
async function fetchRoomsData() {
	if (roomsData) return roomsData;

	try {
		const response = await fetch("https://studycarrel.lib.nycu.edu.tw/pwaspace/configs/map.json");
		roomsData = await response.json();
		return roomsData;
	} catch (error) {
		console.error("Failed to fetch rooms data:", error);
		return null;
	}
}

// Get all device IDs from rooms data
function getAllDeviceIds() {
	if (!roomsData) return [];

	const deviceIds = [];
	for (const map of Object.values(roomsData.MAPS)) {
		for (const device of map.devices) {
			deviceIds.push(device.deviceid);
		}
	}
	return deviceIds;
}

// Find deviceid by devicename
function findDeviceIdByName(devicename) {
	if (!roomsData) return null;

	for (const map of Object.values(roomsData.MAPS)) {
		for (const device of map.devices) {
			if (device.devicename === devicename) {
				return device.deviceid;
			}
		}
	}
	return null;
}

const credit = { username: process.env.USERNAME, password: process.env.PASSWORD };
if (!credit.username || !credit.password) {
	console.error("請在環境變數中設定 USERNAME 和 PASSWORD");
	process.exit(1);
}

async function makeRequest(url, formData) {
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
}

async function makeRequestWithRetry(url, formData) {
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
}

// Initialize on startup
(async () => {
	await fetchRoomsData();
	console.log("Room data loaded.");

	try {
		const result = await login(credit);
		if (result.success) {
			code = { authid: result.authid, sid: result.sid };
			console.log("Login successful, cookies obtained.");
		} else {
			console.log("Login failed:", result.message);
		}
	} catch (err) {
		console.error("Error during login:", err);
	}
})();

fastify.register(Static, {
	root: path.join(new URL(import.meta.url).pathname, "public")
});

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
		reply.status(500);
		return { success: false, message: error.message };
	}
});

fastify.get("/api/room/:id?", async (req, reply) => {
	try {
		const { id } = req.params;
		const today = new Date().toISOString().split("T")[0].replace(/-/g, "/");
		const endDate = new Date();
		endDate.setDate(endDate.getDate() + 60);
		const endDateStr = endDate.toISOString().split("T")[0].replace(/-/g, "/");

		// Fetch rooms data if not already loaded
		if (!roomsData) {
			await fetchRoomsData();
		}

		// Get device IDs to query
		const deviceIds = id ? [id] : getAllDeviceIds();

		if (deviceIds.length === 0) {
			return { success: false, message: "No rooms found" };
		}

		// Query devices with controlled concurrency to avoid overwhelming the server
		const BATCH_SIZE = 10;
		const results = [];

		for (let i = 0; i < deviceIds.length; i += BATCH_SIZE) {
			const batch = deviceIds.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.all(
				batch.map(async deviceId => {
					try {
						const response = await makeRequestWithRetry("https://studycarrel.lib.nycu.edu.tw/RWDAPISSO/BookTimeSegQuery.aspx", {
							userid: credit.username,
							lang: "zh-tw",
							restype: "json",
							spacetype: "2",
							sdate: today,
							edate: endDateStr,
							deviceid: deviceId,
							NO_LOADING: "true"
						});

						if (response[0]?.rescode === "1" && response[0]?.resdata) {
							const available = response[0].resdata.map(slot => ({ booktime: slot.booktime, bookvalue: slot.bookvalue, canbook: slot.canbook }));

							const devicename = response[0].resdata[0]?.devicename || deviceId;

							return {
								deviceid: deviceId,
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
			// Small delay between batches
			if (i + BATCH_SIZE < deviceIds.length) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
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
		reply.status(500);
		return { success: false, message: error.message };
	}
});

fastify.post("/api/reserve", async (req, reply) => {
	try {
		const { id, date, range, devicename } = req.body;

		if (!id || !date || !range || !Array.isArray(id) || !Array.isArray(range)) {
			reply.status(400);
			return { success: false, message: "Invalid request body" };
		}

		// Fetch rooms data if not already loaded
		if (!roomsData) {
			await fetchRoomsData();
		}

		// Convert devicename to deviceid
		let deviceid = req.body.deviceid;
		if (devicename && !deviceid) {
			deviceid = findDeviceIdByName(devicename);
			if (!deviceid) {
				reply.status(400);
				return { success: false, message: `Room ${devicename} not found` };
			}
		}

		if (!deviceid) {
			reply.status(400);
			return { success: false, message: "deviceid or devicename is required" };
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
		reply.status(500);
		return { success: false, message: error.message };
	}
});

fastify.post("/api/search", async (req, reply) => {
	try {
		const { id } = req.body;

		if (!id || !Array.isArray(id) || id.length === 0) {
			reply.status(400);
			return { success: false, message: "Invalid request body" };
		}

		const response = await makeRequestWithRetry("https://studycarrel.lib.nycu.edu.tw/RWDAPISSO/BookUserVerify.aspx", {
			userid: id,
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
		reply.status(500);
		return { success: false, message: error.message };
	}
});

fastify.listen({ port: 3000 }, () => {
	console.log("Server running at http://localhost:3000");
});
