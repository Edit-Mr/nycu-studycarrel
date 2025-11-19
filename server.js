import Fastify from "fastify";
import login from "./login.js";

const fastify = Fastify({ logger: true, level: "error" });

let code = ({ authid, sid } = null);

login()
	.then(result => {
		if (result.success) {
			code = { authid: result.authid, sid: result.sid };
			console.log("Login successful, cookies obtained.");
		} else {
			console.log("Login failed:", result.message);
		}
	})
	.catch(err => {
		console.error("Error during login:", err);
	});

fastify.get("/", async (req, reply) => {});

// 啟動伺服器
fastify.listen({ port: 3000 }, () => {
	console.log("Server running at http://localhost:3000");
});
