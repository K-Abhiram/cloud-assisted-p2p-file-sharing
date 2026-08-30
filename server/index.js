const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const http = require("http");

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

const peers = {};
const sharedFiles = {};

app.get("/", (req, res) => {
    res.send("P2P File Sharing Server is Running");
});

io.on("connection", (socket) => {
    console.log("Peer connected:", socket.id);

    peers[socket.id] = {
        id: socket.id
    };

    io.emit("peer-list", Object.values(peers));

    socket.emit("file-list", Object.values(sharedFiles));

    socket.on("share-file", (fileData) => {
        const file = {
            id: fileData.id,
            name: fileData.name,
            size: fileData.size,
            type: fileData.type,
            ownerId: socket.id
        };

        sharedFiles[file.id] = file;

        console.log("File shared:", file.name);

        io.emit("file-list", Object.values(sharedFiles));
    });

    socket.on("request-file", (fileId) => {
        const file = sharedFiles[fileId];

        if (!file) return;

        console.log(
            `${socket.id} requested ${file.name} from ${file.ownerId}`
        );

        io.to(file.ownerId).emit("file-request", {
            fileId: file.id,
            fileName: file.name,
            requesterId: socket.id
        });
    });

    socket.on("respond-file-request", (response) => {
        const {
            fileId,
            fileName,
            requesterId,
            accepted
        } = response;

        console.log(
            `File request for ${fileName}: ${
                accepted ? "Accepted" : "Rejected"
            }`
        );

        io.to(requesterId).emit("file-response", {
            fileId,
            fileName,
            accepted,
            ownerId: socket.id
        });
    });

    // WebRTC Offer Relay
    socket.on("webrtc-offer", ({ targetId, offer }) => {
        console.log("Relaying WebRTC offer");

        io.to(targetId).emit("webrtc-offer", {
            senderId: socket.id,
            offer
        });
    });

    // WebRTC Answer Relay
    socket.on("webrtc-answer", ({ targetId, answer }) => {
        console.log("Relaying WebRTC answer");

        io.to(targetId).emit("webrtc-answer", {
            senderId: socket.id,
            answer
        });
    });

    // ICE Candidate Relay
    socket.on("ice-candidate", ({ targetId, candidate }) => {
        io.to(targetId).emit("ice-candidate", {
            senderId: socket.id,
            candidate
        });
    });

    socket.on("disconnect", () => {
        console.log("Peer disconnected:", socket.id);

        delete peers[socket.id];

        Object.keys(sharedFiles).forEach((fileId) => {
            if (sharedFiles[fileId].ownerId === socket.id) {
                delete sharedFiles[fileId];
            }
        });

        io.emit("peer-list", Object.values(peers));
        io.emit("file-list", Object.values(sharedFiles));
    });
});

server.listen(5000, () => {
    console.log("Server running on port 5000");
});