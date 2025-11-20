let roomData = null;
let selectedSlots = [];
let friends = JSON.parse(localStorage.getItem("friends") || "[]");

// Navigation
const main = document.querySelector("main");
const toButtons = document.querySelectorAll(".to");
const sections = document.querySelectorAll("main section");
toButtons.forEach(button => {
	button.addEventListener("click", () => {
		const targetId = button.getAttribute("data-link");
		main.classList = targetId;
		if (targetId === "time" && !roomData) {
			loadRoomData();
		}
		if (targetId === "confirm") {
			prepareConfirmPage();
		}
	});
});

// press h1 for refresh page
const title = document.querySelector("nav>div");
title.addEventListener("click", () => {
	location.reload();
});

// Floor switching
const floors = [
	{ id: "2F", rooms: ["203", "202", "201"] },
	{ id: "5F", rooms: ["501"] },
	{ id: "6F", rooms: ["D601", "D602", "C601", "C602", "C603", "C604"] }
];
let currentFloorIndex = 0;

const floorUpBtn = document.getElementById("floor-up");
const floorDownBtn = document.getElementById("floor-down");
const imageContainer = document.querySelector(".image-container");
const roomsContainer = document.getElementById("rooms-container");

// Load room data from API
const loadRoomData = async () => {
	const dateInput = document.getElementById("date");
	const date = dateInput.value;
	try {
		roomsContainer.innerHTML = '<p style="text-align: center; padding: 20px;">載入中...</p>';
		const response = await fetch(`/api/room/?date=${date}`);
		if (!response.ok) throw new Error("Failed to fetch room data");
		roomData = await response.json();
		roomData = roomData.rooms;
		updateFloorDisplay();
	} catch (error) {
		console.error("Failed to load room data:", error);
		roomsContainer.innerHTML = `
							<div style="text-align: center; padding: 20px;">
								<p style="color: red; margin-bottom: 10px;">載入失敗</p>
								<button class="btn" onclick="loadRoomData()">重新載入</button>
							</div>
						`;
	}
};

const updateFloorDisplay = (direction = "none") => {
	const currentFloor = floors[currentFloorIndex];
	const floorMaps = document.querySelectorAll(".floor-map");

	// Hide all floor maps
	floorMaps.forEach(map => {
		map.classList.remove("active", "fade-in-up", "fade-in-down");
	});

	// Show current floor map with animation
	const currentMap = document.getElementById(`map-${currentFloor.id}`);
	if (currentMap) {
		currentMap.classList.add("active");
		if (direction === "up") {
			currentMap.classList.add("fade-in-up");
		} else if (direction === "down") {
			currentMap.classList.add("fade-in-down");
		}
	}

	// Update rooms
	if (!roomData) console.error("roomData is null");

	roomsContainer.innerHTML = "";
	currentFloor.rooms.forEach(roomName => {
		// Find room data from API
		const roomInfo = roomData.find(r => r.devicename === roomName);
		const availableSlots = roomInfo ? roomInfo.available : null;
		if (!availableSlots) return;

		const roomDiv = document.createElement("div");
		roomDiv.className = "room";
		roomDiv.dataset.room = roomName;

		const nameDiv = document.createElement("div");
		nameDiv.className = "room-name";
		nameDiv.textContent = roomName;
		roomDiv.appendChild(nameDiv);
		for (const slot in availableSlots) {
			const button = document.createElement("button");
			button.className = "time-slot";
			button.dataset.time = slot;
			button.dataset.room = roomName;
			button.dataset.bookvalue = availableSlots[slot].bookvalue;
			button.textContent = slot;

			// Check availability
			if (availableSlots[slot].canbook === "0") {
				button.classList.add("unavailable");
				button.disabled = true;
			} else if (isSelected(roomName, availableSlots[slot].bookvalue)) {
				button.classList.add("selected");
			}

			button.addEventListener("click", toggleTimeSlot);
			roomDiv.appendChild(button);
		}
		roomsContainer.appendChild(roomDiv);
	});
};

const isSelected = (room, bookvalue) => {
	return selectedSlots.some(slot => slot.room === room && slot.bookvalue === bookvalue);
};

floorUpBtn.addEventListener("click", () => {
	if (currentFloorIndex < floors.length - 1) {
		currentFloorIndex++;
		updateFloorDisplay("up");
		updateButtonStates();
	}
});

floorDownBtn.addEventListener("click", () => {
	if (currentFloorIndex > 0) {
		currentFloorIndex--;
		updateFloorDisplay("down");
		updateButtonStates();
	}
});

const updateButtonStates = () => {
	if (currentFloorIndex >= floors.length - 1) {
		floorUpBtn.classList.add("disabled");
	} else {
		floorUpBtn.classList.remove("disabled");
	}

	if (currentFloorIndex <= 0) {
		floorDownBtn.classList.add("disabled");
	} else {
		floorDownBtn.classList.remove("disabled");
	}
};

// Initialize button states and first floor
updateButtonStates();
loadRoomData();

// Set initial floor as active
const initialMap = document.getElementById("map-2F");
if (initialMap) {
	initialMap.classList.add("active");
}

// Time slot selection
const toggleTimeSlot = e => {
	const button = e.target;
	const room = button.dataset.room;
	const time = button.dataset.time;
	const bookvalue = button.dataset.bookvalue;

	if (button.classList.contains("unavailable")) return;

	button.classList.toggle("selected");

	const index = selectedSlots.findIndex(slot => slot.room === room && slot.bookvalue === bookvalue);
	if (index > -1) {
		selectedSlots.splice(index, 1);
	} else {
		selectedSlots.push({ room, time, bookvalue });
	}
};

// Add click listeners to initial time slots
document.querySelectorAll(".time-slot").forEach(slot => {
	slot.addEventListener("click", toggleTimeSlot);
});

// select date of today
const dateInput = document.getElementById("date");
dateInput.value = new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().split("T")[0];

// Reload room data when date changes
dateInput.addEventListener("change", async () => {
	if (main.classList.contains("time")) {
		selectedSlots = [];
		await loadRoomData();
	}
});

// Friend management
const renderFriends = async () => {
	const friendsContainer = document.getElementById("friends");
	friendsContainer.innerHTML = "";

	friends.forEach(friend => {
		const button = document.createElement("button");
		button.className = "friend";
		button.dataset.id = friend.id;
		button.innerHTML = `${friend.name}<span>${friend.id}</span>`;

		if (friend.selected) {
			button.classList.add("selected");
		}

		button.addEventListener("click", () => {
			button.classList.toggle("selected");
			friend.selected = !friend.selected;
			saveFriends();
		});

		friendsContainer.appendChild(button);
	});
};

const saveFriends = () => {
	localStorage.setItem("friends", JSON.stringify(friends));
};

// Search student ID
const addStudentInput = document.getElementById("add-student");
const addStudentForm = document.createElement("form");
addStudentInput.parentElement.insertBefore(addStudentForm, addStudentInput);
addStudentForm.appendChild(addStudentInput);

const submitButton = document.createElement("button");
submitButton.type = "submit";
submitButton.className = "btn";
submitButton.textContent = "搜尋";
submitButton.style.marginTop = "10px";
addStudentForm.appendChild(submitButton);

addStudentForm.addEventListener("submit", async e => {
	e.preventDefault();
	const studentId = addStudentInput.value.trim();

	if (!studentId) return;

	// Check if already exists
	if (friends.some(f => f.id === studentId)) {
		alert("此學號已在列表中");
		addStudentInput.value = "";
		return;
	}

	try {
		submitButton.disabled = true;
		submitButton.textContent = "搜尋中...";

		const response = await fetch(`/api/search?id=${studentId}`);
		if (!response.ok) throw new Error("Student not found");

		const data = await response.json();
		friends.push({
			id: studentId,
			name: data.name,
			selected: false
		});

		saveFriends();
		addStudentInput.value = "";
		await renderFriends();
		document.querySelector("#friends button[data-id='" + studentId + "']").click();
	} catch (error) {
		alert("查無此學號或查詢失敗");
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = "搜尋";
	}
});

// Prepare confirm page
const prepareConfirmPage = () => {
	const confirmTime = document.getElementById("confirm-time");
	const dateInput = document.getElementById("date");
	const date = dateInput.value;

	// Combine continuous time slots
	const combined = combine(selectedSlots);
	const timeText = combined
		.map(slot => {
			return `${date} ${slot.room} ${slot.time}`;
		})
		.join("<br>");

	confirmTime.innerHTML = timeText || "未選擇時段";
	document.getElementById("reserve-btn").disabled = selectedSlots.length === 0;

	// Render friends with auto-select from last time
	renderFriends();
};

const isNextTimeSlot = time => {
	const [hour, minute] = time.split(":").map(Number);
	let nextHour = hour;
	let nextMinute = minute + 1;
	if (nextMinute === 60) {
		nextHour += 1;
		nextMinute = 0;
	}
	return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
};

const localeCompare = (time1, time2) => {
	const [h1, m1] = time1.split(":").map(Number);
	const [h2, m2] = time2.split(":").map(Number);
	return h1 !== h2 ? h1 - h2 : m1 - m2;
};

const combine = slots => {
	slots.sort((a, b) => (a.room === b.room ? a.time.localeCompare(b.time) : a.room.localeCompare(b.room)));

	const r = [];
	for (let i = 0; i < slots.length; i++) {
		let s = slots[i];
		let start = s.time.split("~")[0];
		let end = s.time.split("~")[1];
		while (i + 1 < slots.length && slots[i + 1].room === s.room) {
			if (isNextTimeSlot(end) === slots[i + 1].time.split("~")[0]) {
				end = slots[i + 1].time.split("~")[1];
				i++;
			} else {
				break;
			}
		}

		r.push({ room: s.room, time: `${start}~${end}` });
	}

	return r;
};

// Reserve room
const reserveBtn = document.getElementById("reserve-btn");
reserveBtn.addEventListener("click", async e => {
	e.preventDefault();

	const selectedFriends = friends.filter(f => f.selected).map(f => f.id);

	if (selectedSlots.length === 0) {
		alert("請選擇時段");
		return;
	}

	if (selectedFriends.length < 3) {
		alert("至少需要三位朋友才能開房");
		return;
	}

	try {
		reserveBtn.disabled = true;
		reserveBtn.textContent = "處理中...";

		const response = await fetch("/api/reserve", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				id: selectedFriends,
				date: document.getElementById("date").value,
				range: selectedSlots.map(slot => slot.bookvalue),
				devicename: selectedSlots[0].room
			})
		});

		if (!response.ok) throw new Error("Reservation failed");

		const result = await response.json();

		// Show result
		document.getElementById("success-time").innerHTML = document.getElementById("confirm-time").innerHTML;
		const friendsList = friends
			.filter(f => f.selected)
			.map(f => `${f.name} ${f.id}`)
			.join("<br>");
		document.getElementById("success-friends").innerHTML = friendsList;

		main.classList = "result";
	} catch (error) {
		alert("訂房失敗：" + error.message);
	} finally {
		reserveBtn.disabled = false;
		reserveBtn.textContent = "確認開房";
	}
});

const cleanBtn = document.getElementById("clean-btn");
cleanBtn.addEventListener("click", e => {
	e.preventDefault();
	localStorage.removeItem("friends");
	friends = [];
	renderFriends();
});
