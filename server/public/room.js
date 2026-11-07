
"use strict";

// ==================================================
// CONNECTROOM - VIDEO MEETING CLIENT
// ==================================================

const token = localStorage.getItem("token");

let savedUser = null;

try {
    savedUser = JSON.parse(localStorage.getItem("user") || "null");
} catch {
    savedUser = null;
}

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

if (!token) {
    window.location.replace("/login.html");
    throw new Error("Login required.");
}

if (!roomId) {
    alert("Meeting room ID is missing.");
    window.location.replace("/dashboard.html");
    throw new Error("Meeting room ID is missing.");
}

// ==================================================
// SOCKET.IO
// ==================================================

const socket = io({ auth: { token } });

// ==================================================
// WEBRTC CONFIGURATION
// ==================================================

const peerConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

// ==================================================
// APPLICATION STATE
// ==================================================

let localStream = null;
let screenStream = null;
let screenSharing = false;
let micEnabled = true;
let cameraEnabled = true;
let isLeaving = false;

const peers = new Map();
const remoteUsers = new Map();
const pendingCandidates = new Map();

// ==================================================
// VIDEO CONTAINER
// ==================================================

let videoContainer =
    document.getElementById("videoGrid") ||
    document.getElementById("videos") ||
    document.getElementById("videoContainer");

if (!videoContainer) {
    videoContainer = document.createElement("div");
    videoContainer.id = "videoGrid";

    Object.assign(videoContainer.style, {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: "12px",
        padding: "16px"
    });

    document.body.appendChild(videoContainer);
}

function createVideoElement(id, label) {
    let video = document.getElementById(id);

    if (video) {
        const existingTitle = video.parentElement?.querySelector(
            "[data-video-title]"
        );

        if (existingTitle) {
            existingTitle.textContent = label;
        }

        return video;
    }

    const wrapper = document.createElement("div");
    wrapper.dataset.videoWrapper = id;

    Object.assign(wrapper.style, {
        background: "#151515",
        borderRadius: "12px",
        overflow: "hidden",
        minWidth: "0"
    });

    const title = document.createElement("div");
    title.dataset.videoTitle = "true";
    title.textContent = label;

    Object.assign(title.style, {
        color: "white",
        padding: "8px",
        fontSize: "14px"
    });

    video = document.createElement("video");
    video.id = id;
    video.autoplay = true;
    video.playsInline = true;

    Object.assign(video.style, {
        width: "100%",
        display: "block",
        minHeight: "160px",
        background: "#222",
        objectFit: "contain"
    });

    wrapper.appendChild(title);
    wrapper.appendChild(video);
    videoContainer.appendChild(wrapper);

    return video;
}

const localVideo = createVideoElement("localVideo", "You");
localVideo.muted = true;

// ==================================================
// CAMERA AND MICROPHONE
// ==================================================

async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        console.error("Camera access requires localhost or HTTPS.");
        return false;
    }

    if (
        localStream &&
        localStream.getTracks().some(
            track => track.readyState === "live"
        )
    ) {
        return true;
    }

    const requests = [
        {
            video: {
                width: { ideal: 640 },
                height: { ideal: 360 },
                frameRate: { ideal: 24, max: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        },
        { video: true, audio: false },
        { video: false, audio: true }
    ];

    let lastError = null;

    for (const constraints of requests) {
        try {
            localStream =
                await navigator.mediaDevices.getUserMedia(constraints);
            break;
        } catch (error) {
            lastError = error;
            console.warn(
                "Media request failed; trying fallback:",
                error.name,
                error.message
            );
        }
    }

    if (!localStream) {
        console.error("Could not open media devices:", lastError);

        alert(
            "ConnectRoom could not open your camera or microphone.\n\n" +
            "Check Chrome site permissions and Windows camera privacy settings. " +
            "Close other applications using your webcam.\n\n" +
            "Error: " + (lastError?.name || "Unknown") +
            "\n" + (lastError?.message || "")
        );

        return false;
    }

    localVideo.srcObject = localStream;
    localVideo.muted = true;

    await localVideo.play().catch(error => {
        console.warn("Local preview needs interaction:", error);
    });

    micEnabled = localStream.getAudioTracks().some(
        track => track.enabled
    );

    cameraEnabled = localStream.getVideoTracks().some(
        track => track.enabled
    );

    for (const pc of peers.values()) {
        for (const track of localStream.getTracks()) {
            const senderExists = pc.getSenders().some(
                sender => sender.track?.kind === track.kind
            );

            if (!senderExists) {
                pc.addTrack(track, localStream);
            }
        }
    }

    console.log("Local media initialized:", {
        camera: cameraEnabled,
        microphone: micEnabled
    });

    return true;
}

// ==================================================
// PARTICIPANT COUNT
// ==================================================

function updateParticipantCount(users) {
    const count = Array.isArray(users)
        ? users.length
        : remoteUsers.size + 1;

    const elements = [
        document.getElementById("participantCount"),
        document.getElementById("participantsCount"),
        document.getElementById("participant-count")
    ].filter(Boolean);

    for (const element of elements) {
        element.textContent = `${count} / 10 Participants`;
    }
}

// ==================================================
// REMOTE VIDEO PLAYBACK
// ==================================================

async function playRemoteVideo(video) {
    if (!video || !video.srcObject) return;

    try {
        await video.play();
    } catch (error) {
        console.warn(
            "Remote playback needs browser interaction:",
            error.name,
            error.message
        );
    }
}

function removeRemoteVideo(remoteSocketId) {
    const remoteVideo = document.getElementById(
        "remoteVideo-" + remoteSocketId
    );

    if (!remoteVideo) return;

    const wrapper = remoteVideo.closest("[data-video-wrapper]");

    if (wrapper) {
        wrapper.remove();
    } else {
        remoteVideo.remove();
    }
}

// ==================================================
// WEBRTC PEER CONNECTION
// ==================================================

function createPeerConnection(remoteSocketId) {
    if (peers.has(remoteSocketId)) {
        return peers.get(remoteSocketId);
    }

    const pc = new RTCPeerConnection(peerConfiguration);

    peers.set(remoteSocketId, pc);
    pendingCandidates.set(remoteSocketId, []);

    if (localStream) {
        for (const track of localStream.getTracks()) {
            pc.addTrack(track, localStream);
        }
    }

    pc.onicecandidate = event => {
        if (event.candidate && socket.connected) {
            socket.emit("ice-candidate", {
                target: remoteSocketId,
                candidate: event.candidate
            });
        }
    };

    pc.ontrack = event => {
        const user = remoteUsers.get(remoteSocketId);
        const label = user?.name || "Meeting participant";

        const remoteVideo = createVideoElement(
            "remoteVideo-" + remoteSocketId,
            label
        );

        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.muted = false;

        let inboundStream;

        if (event.streams && event.streams.length > 0) {
            inboundStream = event.streams[0];
        } else {
            if (!(remoteVideo.srcObject instanceof MediaStream)) {
                remoteVideo.srcObject = new MediaStream();
            }

            inboundStream = remoteVideo.srcObject;

            const trackAlreadyAdded = inboundStream
                .getTracks()
                .some(track => track.id === event.track.id);

            if (!trackAlreadyAdded) {
                inboundStream.addTrack(event.track);
            }
        }

        if (remoteVideo.srcObject !== inboundStream) {
            remoteVideo.srcObject = inboundStream;
        }

        event.track.onunmute = () => {
            console.log(
                "Remote track unmuted:",
                remoteSocketId,
                event.track.kind
            );

            playRemoteVideo(remoteVideo);
        };

        event.track.onmute = () => {
            console.log(
                "Remote track muted:",
                remoteSocketId,
                event.track.kind
            );
        };

        event.track.onended = () => {
            console.log(
                "Remote track ended:",
                remoteSocketId,
                event.track.kind
            );
        };

        playRemoteVideo(remoteVideo);

        console.log("Remote track received:", {
            participant: remoteSocketId,
            kind: event.track.kind,
            readyState: event.track.readyState,
            streamId: inboundStream.id
        });
    };

    pc.onconnectionstatechange = () => {
        console.log(
            "Connection with",
            remoteSocketId,
            ":",
            pc.connectionState
        );

        if (pc.connectionState === "failed") {
            console.warn(
                "WebRTC connection failed. Some networks require a TURN server."
            );
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(
            "ICE connection with",
            remoteSocketId,
            ":",
            pc.iceConnectionState
        );
    };

    pc.onicegatheringstatechange = () => {
        console.log(
            "ICE gathering state:",
            remoteSocketId,
            pc.iceGatheringState
        );
    };

    return pc;
}

// ==================================================
// PROCESS QUEUED ICE CANDIDATES
// ==================================================

async function processPendingCandidates(remoteSocketId, pc) {
    const candidates = pendingCandidates.get(remoteSocketId) || [];

    while (candidates.length > 0 && pc.remoteDescription) {
        const candidate = candidates.shift();

        try {
            await pc.addIceCandidate(
                new RTCIceCandidate(candidate)
            );
        } catch (error) {
            console.error("Could not add queued ICE candidate:", error);
        }
    }
}

// ==================================================
// CREATE AND SEND AN OFFER
// ==================================================

async function callParticipant(remoteSocketId) {
    try {
        if (
            !remoteSocketId ||
            remoteSocketId === socket.id ||
            isLeaving
        ) {
            return;
        }

        // Use a consistent offer initiator to reduce offer collisions.
        if (String(socket.id) > String(remoteSocketId)) {
            console.log(
                "Waiting for the other participant to initiate:",
                remoteSocketId
            );

            createPeerConnection(remoteSocketId);
            return;
        }

        const pc = createPeerConnection(remoteSocketId);

        if (pc.signalingState !== "stable") {
            console.log(
                "Offer skipped; signaling state:",
                pc.signalingState
            );
            return;
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("offer", {
            target: remoteSocketId,
            offer: pc.localDescription
        });

        console.log("Offer sent to:", remoteSocketId);
    } catch (error) {
        console.error("Could not create offer:", error);
    }
}

// ==================================================
// RECEIVE AN OFFER
// ==================================================

socket.on("offer", async data => {
    try {
        if (!data?.from || !data.offer) return;

        remoteUsers.set(
            data.from,
            data.user || remoteUsers.get(data.from) || {}
        );

        const pc = createPeerConnection(data.from);

        const offerCollision = pc.signalingState !== "stable";
        const polite = String(socket.id) > String(data.from);

        if (offerCollision && !polite) {
            console.warn("Ignoring colliding offer from:", data.from);
            return;
        }

        if (offerCollision && polite) {
            await pc.setLocalDescription({ type: "rollback" });
        }

        await pc.setRemoteDescription(
            new RTCSessionDescription(data.offer)
        );

        await processPendingCandidates(data.from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            target: data.from,
            answer: pc.localDescription
        });

        console.log("Answer sent to:", data.from);
    } catch (error) {
        console.error("Could not process offer:", error);
    }
});

// ==================================================
// RECEIVE AN ANSWER
// ==================================================

socket.on("answer", async data => {
    try {
        if (!data?.from || !data.answer) return;

        const pc = peers.get(data.from);

        if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(
                new RTCSessionDescription(data.answer)
            );

            await processPendingCandidates(data.from, pc);
        }
    } catch (error) {
        console.error("Could not process answer:", error);
    }
});

// ==================================================
// RECEIVE ICE CANDIDATES
// ==================================================

socket.on("ice-candidate", async data => {
    try {
        if (!data?.from || !data.candidate) return;

        const pc = peers.get(data.from);

        if (!pc || !pc.remoteDescription) {
            if (!pendingCandidates.has(data.from)) {
                pendingCandidates.set(data.from, []);
            }

            pendingCandidates.get(data.from).push(data.candidate);
            return;
        }

        await pc.addIceCandidate(
            new RTCIceCandidate(data.candidate)
        );
    } catch (error) {
        console.error("Could not add ICE candidate:", error);
    }
});

// ==================================================
// JOIN ROOM
// ==================================================

socket.on("connect", async () => {
    console.log("Connected to signaling server:", socket.id);

    await startCamera();

    if (isLeaving || !socket.connected) return;

    socket.emit("join-room", {
        roomId,
        token,
        userName: savedUser?.name || "User"
    });

    console.log("Joining meeting room:", roomId);
});

socket.on("room-users", async users => {
    if (!Array.isArray(users)) return;

    for (const user of users) {
        const remoteSocketId = user.socketId;

        if (!remoteSocketId || remoteSocketId === socket.id) {
            continue;
        }

        remoteUsers.set(remoteSocketId, user);
        await callParticipant(remoteSocketId);
    }

    updateParticipantCount();
});

socket.on("user-joined", async data => {
    if (!data?.socketId || data.socketId === socket.id) return;

    remoteUsers.set(
        data.socketId,
        data.user || { name: "Participant" }
    );

    console.log(
        "Participant joined:",
        data.user?.name || data.socketId
    );

    updateParticipantCount();
    await callParticipant(data.socketId);
});

socket.on("participants-updated", users => {
    if (!Array.isArray(users)) return;

    console.log("Participants updated:", users);

    for (const user of users) {
        if (user.socketId && user.socketId !== socket.id) {
            remoteUsers.set(user.socketId, user);
        }
    }

    updateParticipantCount(users);
});

// ==================================================
// PARTICIPANT LEFT
// ==================================================

socket.on("user-left", data => {
    if (!data?.socketId) return;

    const remoteSocketId = data.socketId;
    const pc = peers.get(remoteSocketId);

    if (pc) {
        pc.close();
        peers.delete(remoteSocketId);
    }

    pendingCandidates.delete(remoteSocketId);
    remoteUsers.delete(remoteSocketId);
    removeRemoteVideo(remoteSocketId);

    updateParticipantCount();
});

socket.on("room-error", message => {
    alert(message || "Unable to join this meeting.");
});

socket.on("connect_error", error => {
    console.error("Socket connection error:", error.message);

    if (
        error.message &&
        error.message.toLowerCase().includes("authentication")
    ) {
        alert("Your login session may have expired. Please log in again.");
    }
});

// ==================================================
// BUTTON HELPERS
// ==================================================

function findButton(ids, keywords) {
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) return element;
    }

    return Array.from(document.querySelectorAll("button")).find(button => {
        const text = (
            button.innerText ||
            button.textContent ||
            button.getAttribute("aria-label") ||
            ""
        ).toLowerCase();

        return keywords.some(keyword => text.includes(keyword));
    });
}

// ==================================================
// MICROPHONE BUTTON
// ==================================================

const micButton = findButton(
    ["micBtn", "muteBtn", "toggleMic", "microphoneBtn"],
    ["mute microphone", "mute mic", "unmute microphone"]
);

if (micButton) {
    micButton.addEventListener("click", () => {
        const track = localStream?.getAudioTracks()[0];

        if (!track) {
            alert("No microphone is available.");
            return;
        }

        micEnabled = !track.enabled;
        track.enabled = micEnabled;

        micButton.textContent = micEnabled
            ? "Mute Microphone"
            : "Unmute Microphone";
    });
}

// ==================================================
// CAMERA BUTTON
// ==================================================

const cameraButton = findButton(
    ["cameraBtn", "toggleCamera", "videoBtn"],
    ["turn camera off", "turn camera on", "camera off", "camera on"]
);

if (cameraButton) {
    cameraButton.addEventListener("click", () => {
        const track = localStream?.getVideoTracks()[0];

        if (!track) {
            alert("No camera is available.");
            return;
        }

        cameraEnabled = !track.enabled;
        track.enabled = cameraEnabled;

        cameraButton.textContent = cameraEnabled
            ? "Turn Camera Off"
            : "Turn Camera On";
    });
}

// ==================================================
// SCREEN SHARING
// ==================================================

const screenButton = findButton(
    ["screenBtn", "shareScreenBtn", "screenShareBtn"],
    ["share screen", "screen share", "stop sharing"]
);

async function startScreenSharing() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
        alert(
            "Screen sharing is unavailable. Use localhost or HTTPS " +
            "in a supported browser."
        );
        return;
    }

    if (screenSharing) return;

    try {
        const newScreenStream =
            await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });

        const screenTrack = newScreenStream.getVideoTracks()[0];

        if (!screenTrack) {
            newScreenStream.getTracks().forEach(track => track.stop());
            return;
        }

        screenStream = newScreenStream;

        // Replace the negotiated camera sender with the screen track.
        for (const [remoteSocketId, pc] of peers.entries()) {
            try {
                let sender = pc.getSenders().find(
                    item => item.track?.kind === "video"
                );

                if (!sender) {
                    const videoTransceiver = pc.getTransceivers().find(
                        transceiver =>
                            transceiver.receiver?.track?.kind === "video"
                    );

                    sender = videoTransceiver?.sender || null;
                }

                if (sender) {
                    await sender.replaceTrack(screenTrack);
                } else {
                    console.warn(
                        "No negotiated video sender for participant:",
                        remoteSocketId
                    );
                    continue;
                }

                console.log(
                    "Screen track sent to participant:",
                    remoteSocketId
                );
            } catch (error) {
                console.error(
                    "Failed to send screen to participant:",
                    remoteSocketId,
                    error
                );
            }
        }

        localVideo.srcObject = screenStream;
        await playRemoteVideo(localVideo);

        screenSharing = true;

        if (screenButton) {
            screenButton.textContent = "Stop Sharing";
        }

        screenTrack.onended = () => {
            stopScreenSharing();
        };

        console.log("Screen sharing started.");
    } catch (error) {
        console.error("Screen sharing error:", error);

        if (error.name !== "NotAllowedError") {
            alert("Could not share your screen: " + error.message);
        }

        screenStream?.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
}

async function stopScreenSharing() {
    if (!screenSharing) return;

    const oldScreenStream = screenStream;

    screenSharing = false;
    screenStream = null;

    const cameraTrack = localStream?.getVideoTracks()[0];

    if (cameraTrack) {
        cameraTrack.enabled = cameraEnabled;
    }

    for (const [remoteSocketId, pc] of peers.entries()) {
        try {
            const sender = pc.getSenders().find(
                item => item.track?.kind === "video"
            );

            if (sender) {
                await sender.replaceTrack(cameraTrack || null);
            }

            console.log(
                "Restored camera track for participant:",
                remoteSocketId
            );
        } catch (error) {
            console.error(
                "Could not restore camera track:",
                remoteSocketId,
                error
            );
        }
    }

    oldScreenStream?.getTracks().forEach(track => track.stop());

    localVideo.srcObject = localStream || null;

    if (localStream) {
        await playRemoteVideo(localVideo);
    }

    if (screenButton) {
        screenButton.textContent = "Share Screen";
    }

    console.log("Screen sharing stopped.");
}

if (screenButton) {
    screenButton.addEventListener("click", async () => {
        if (screenSharing) {
            await stopScreenSharing();
        } else {
            await startScreenSharing();
        }
    });
}

// ==================================================
// CHAT
// ==================================================

const chatInput =
    document.getElementById("chatInput") ||
    document.getElementById("messageInput");

const chatButton =
    document.getElementById("sendMessageBtn") ||
    document.getElementById("sendBtn");

const chatMessages =
    document.getElementById("chatMessages") ||
    document.getElementById("messages");

function sendChatMessage() {
    if (!chatInput) return;

    const message = chatInput.value.trim();
    if (!message) return;

    socket.emit("chat-message", { message });
    chatInput.value = "";
}

if (chatButton) {
    chatButton.addEventListener("click", sendChatMessage);
}

if (chatInput) {
    chatInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendChatMessage();
        }
    });
}

socket.on("chat-message", data => {
    if (!chatMessages || !data) return;

    const line = document.createElement("p");
    const name = data.user?.name || "Participant";

    line.textContent = name + ": " + data.message;

    chatMessages.appendChild(line);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ==================================================
// LEAVE MEETING
// ==================================================

const leaveButton = findButton(
    ["leaveBtn", "leaveMeetingBtn", "endCallBtn"],
    ["leave meeting", "leave call", "end call"]
);

function leaveMeeting() {
    if (isLeaving) return;

    isLeaving = true;
    socket.emit("leave-room");

    for (const pc of peers.values()) {
        pc.close();
    }

    peers.clear();
    pendingCandidates.clear();
    remoteUsers.clear();

    localStream?.getTracks().forEach(track => track.stop());
    screenStream?.getTracks().forEach(track => track.stop());

    localStream = null;
    screenStream = null;

    socket.disconnect();
    window.location.href = "/dashboard.html";
}

if (leaveButton) {
    leaveButton.addEventListener("click", leaveMeeting);
}

// ==================================================
// CLEANUP
// ==================================================

window.addEventListener("beforeunload", () => {
    socket.emit("leave-room");

    for (const pc of peers.values()) {
        pc.close();
    }

    localStream?.getTracks().forEach(track => track.stop());
    screenStream?.getTracks().forEach(track => track.stop());
});

console.log("ConnectRoom WebRTC client loaded.");
console.log("Meeting room:", roomId);
console.log("STUN configured. TURN may be needed on some networks.");

