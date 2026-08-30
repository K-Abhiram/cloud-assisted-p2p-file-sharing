import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:5000");

const CHUNK_SIZE = 16 * 1024;

function App() {
    const [selectedFile, setSelectedFile] = useState(null);
    const [peerId, setPeerId] = useState("Not Connected");
    const [isOnline, setIsOnline] = useState(false);
    const [peers, setPeers] = useState([]);
    const [sharedFiles, setSharedFiles] = useState([]);
    const [fileRequests, setFileRequests] = useState([]);
    const [requestStatus, setRequestStatus] = useState("");
    const [connectionStatus, setConnectionStatus] = useState("");

    const [transferProgress, setTransferProgress] = useState(0);
    const [receivedFile, setReceivedFile] = useState(null);
    const [receivedFileName, setReceivedFileName] = useState("");

    const peerConnection = useRef(null);
    const dataChannel = useRef(null);

    const localFiles = useRef({});
    const receivedChunks = useRef([]);
    const incomingFileInfo = useRef(null);

    const createPeerConnection = (targetId) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.l.google.com:19302"
                }
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", {
                    targetId,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log("WebRTC state:", pc.connectionState);

            if (pc.connectionState === "connected") {
                setConnectionStatus("P2P Connection Established");
            }
        };

        peerConnection.current = pc;

        return pc;
    };

    const setupDataChannel = (channel) => {
        dataChannel.current = channel;

        channel.binaryType = "arraybuffer";

        channel.onopen = () => {
            console.log("Data channel opened");
            setConnectionStatus("P2P DataChannel Connected");
        };

        channel.onmessage = (event) => {
            if (typeof event.data === "string") {
                const message = JSON.parse(event.data);

                if (message.type === "file-info") {
                    console.log("Receiving file:", message.name);

                    receivedChunks.current = [];

                    incomingFileInfo.current = {
                        name: message.name,
                        size: message.size,
                        type: message.fileType
                    };

                    setReceivedFileName(message.name);
                    setTransferProgress(0);
                }

                if (message.type === "file-complete") {
                    console.log("File transfer complete");

                    const info = incomingFileInfo.current;

                    const blob = new Blob(
                        receivedChunks.current,
                        {
                            type: info.type
                        }
                    );

                    const fileURL = URL.createObjectURL(blob);

                    setReceivedFile(fileURL);
                    setTransferProgress(100);
                }

                return;
            }

            receivedChunks.current.push(event.data);

            if (incomingFileInfo.current) {
                const receivedSize = receivedChunks.current.reduce(
                    (total, chunk) => total + chunk.byteLength,
                    0
                );

                const progress =
                    (receivedSize / incomingFileInfo.current.size) * 100;

                setTransferProgress(Math.min(progress, 100));
            }
        };
    };

    const sendFile = async (file) => {
        if (!dataChannel.current) return;

        const channel = dataChannel.current;

        if (channel.readyState !== "open") {
            console.log("Data channel is not open");
            return;
        }

        console.log("Starting file transfer:", file.name);

        setTransferProgress(0);

        channel.send(
            JSON.stringify({
                type: "file-info",
                name: file.name,
                size: file.size,
                fileType: file.type
            })
        );

        let offset = 0;

        while (offset < file.size) {
            const chunk = file.slice(
                offset,
                offset + CHUNK_SIZE
            );

            const buffer = await chunk.arrayBuffer();

            while (channel.bufferedAmount > CHUNK_SIZE * 10) {
                await new Promise(
                    (resolve) => setTimeout(resolve, 10)
                );
            }

            channel.send(buffer);

            offset += buffer.byteLength;

            const progress = (offset / file.size) * 100;

            setTransferProgress(progress);
        }

        channel.send(
            JSON.stringify({
                type: "file-complete"
            })
        );

        setTransferProgress(100);

        console.log("File sent successfully");
    };

    useEffect(() => {
        socket.on("connect", () => {
            console.log("Connected to server:", socket.id);
            setPeerId(socket.id);
            setIsOnline(true);
        });

        socket.on("disconnect", () => {
            console.log("Disconnected from server");

            setPeerId("Not Connected");
            setIsOnline(false);
            setPeers([]);
            setSharedFiles([]);
            setFileRequests([]);
            setRequestStatus("");
        });

        socket.on("peer-list", (peerList) => {
            const otherPeers = peerList.filter(
                (peer) => peer.id !== socket.id
            );

            setPeers(otherPeers);
        });

        socket.on("file-list", (fileList) => {
            setSharedFiles(fileList);
        });

        socket.on("file-request", (request) => {
            console.log("File request received:", request);

            setFileRequests((previousRequests) => [
                ...previousRequests,
                request
            ]);
        });

        socket.on("file-response", async (response) => {
            if (response.accepted) {
                setRequestStatus(
                    `Your request for ${response.fileName} was accepted! Connecting...`
                );

                const pc = createPeerConnection(response.ownerId);

                const channel =
                    pc.createDataChannel("fileTransfer");

                setupDataChannel(channel);

                const offer = await pc.createOffer();

                await pc.setLocalDescription(offer);

                socket.emit("webrtc-offer", {
                    targetId: response.ownerId,
                    offer
                });
            } else {
                setRequestStatus(
                    `Your request for ${response.fileName} was rejected.`
                );
            }
        });

        socket.on("webrtc-offer", async ({ senderId, offer }) => {
            console.log("Received WebRTC offer");

            const pc = createPeerConnection(senderId);

            pc.ondatachannel = (event) => {
                console.log("Data channel received");

                setupDataChannel(event.channel);
            };

            await pc.setRemoteDescription(
                new RTCSessionDescription(offer)
            );

            const answer = await pc.createAnswer();

            await pc.setLocalDescription(answer);

            socket.emit("webrtc-answer", {
                targetId: senderId,
                answer
            });
        });

        socket.on("webrtc-answer", async ({ answer }) => {
            console.log("Received WebRTC answer");

            if (peerConnection.current) {
                await peerConnection.current.setRemoteDescription(
                    new RTCSessionDescription(answer)
                );
            }
        });

        socket.on("ice-candidate", async ({ candidate }) => {
            try {
                if (peerConnection.current) {
                    await peerConnection.current.addIceCandidate(
                        new RTCIceCandidate(candidate)
                    );
                }
            } catch (error) {
                console.error(
                    "ICE candidate error:",
                    error
                );
            }
        });

        return () => {
            socket.off("connect");
            socket.off("disconnect");
            socket.off("peer-list");
            socket.off("file-list");
            socket.off("file-request");
            socket.off("file-response");
            socket.off("webrtc-offer");
            socket.off("webrtc-answer");
            socket.off("ice-candidate");

            if (peerConnection.current) {
                peerConnection.current.close();
            }
        };
    }, []);

    const handleFileChange = (event) => {
        const file = event.target.files[0];

        if (file) {
            setSelectedFile(file);
        }
    };

    const handleShareFile = () => {
        if (!selectedFile || !isOnline) return;

        const fileId = `${socket.id}-${Date.now()}`;

        localFiles.current[fileId] = selectedFile;

        socket.emit("share-file", {
            id: fileId,
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type
        });

        setSelectedFile(null);
    };

    const handleRequestFile = (fileId) => {
        socket.emit("request-file", fileId);

        setRequestStatus(
            "File request sent. Waiting for owner response..."
        );
    };

    const handleRequestResponse = async (
        request,
        accepted
    ) => {
        socket.emit("respond-file-request", {
            fileId: request.fileId,
            fileName: request.fileName,
            requesterId: request.requesterId,
            accepted
        });

        setFileRequests((previousRequests) =>
            previousRequests.filter(
                (item) =>
                    !(
                        item.fileId === request.fileId &&
                        item.requesterId ===
                            request.requesterId
                    )
            )
        );

        if (accepted) {
            const file = localFiles.current[request.fileId];

            if (!file) {
                console.error(
                    "Original file not found locally"
                );
                return;
            }

            const waitForConnection = setInterval(() => {
                if (
                    dataChannel.current &&
                    dataChannel.current.readyState === "open"
                ) {
                    clearInterval(waitForConnection);

                    console.log(
                        "Connection ready. Sending file..."
                    );

                    sendFile(file);
                }
            }, 500);
        }
    };

    return (
        <div className="app">
            <header>
                <h1>Cloud-Assisted P2P File Sharing</h1>
                <p>Secure Distributed File Transfer System</p>
            </header>

            <main>
                <section className="card">
                    <h2>My Peer</h2>

                    <div className="peer-info">
                        <p>
                            <strong>Peer ID:</strong> {peerId}
                        </p>

                        <p>
                            <strong>Status:</strong>

                            <span
                                className={
                                    isOnline
                                        ? "online"
                                        : "offline"
                                }
                            >
                                {isOnline
                                    ? " Online"
                                    : " Offline"}
                            </span>
                        </p>

                        {connectionStatus && (
                            <p>
                                <strong>P2P:</strong>{" "}

                                <span className="online">
                                    {connectionStatus}
                                </span>
                            </p>
                        )}
                    </div>
                </section>

                <section className="card">
                    <h2>Share a File</h2>

                    <input
                        type="file"
                        onChange={handleFileChange}
                    />

                    {selectedFile && (
                        <div className="file-info">
                            <p>
                                <strong>File Name:</strong>{" "}
                                {selectedFile.name}
                            </p>

                            <p>
                                <strong>Size:</strong>{" "}
                                {(
                                    selectedFile.size / 1024
                                ).toFixed(2)} KB
                            </p>

                            <p>
                                <strong>Type:</strong>{" "}
                                {selectedFile.type ||
                                    "Unknown"}
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleShareFile}
                        disabled={
                            !selectedFile || !isOnline
                        }
                    >
                        Share File
                    </button>
                </section>

                <section className="card">
                    <h2>Available Peers</h2>

                    <div className="peer-list">
                        {peers.length === 0 ? (
                            <p>
                                No peers discovered yet.
                            </p>
                        ) : (
                            peers.map((peer) => (
                                <p key={peer.id}>
                                    🟢 Peer: {peer.id}
                                </p>
                            ))
                        )}
                    </div>
                </section>

                <section className="card">
                    <h2>Available Files</h2>

                    <div className="file-list">
                        {sharedFiles.length === 0 ? (
                            <p>
                                No shared files available.
                            </p>
                        ) : (
                            sharedFiles.map((file) => (
                                <div
                                    key={file.id}
                                    className="shared-file"
                                >
                                    <strong>
                                        {file.name}
                                    </strong>

                                    <p>
                                        {(
                                            file.size / 1024
                                        ).toFixed(2)} KB
                                    </p>

                                    <p>
                                        Owner:{" "}
                                        {file.ownerId.slice(
                                            0,
                                            8
                                        )}
                                        ...
                                    </p>

                                    {file.ownerId !==
                                        socket.id && (
                                        <button
                                            onClick={() =>
                                                handleRequestFile(
                                                    file.id
                                                )
                                            }
                                        >
                                            Request File
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {requestStatus && (
                        <p className="request-status">
                            {requestStatus}
                        </p>
                    )}
                </section>

                <section className="card requests-card">
                    <h2>Incoming File Requests</h2>

                    {fileRequests.length === 0 ? (
                        <p>
                            No incoming requests.
                        </p>
                    ) : (
                        fileRequests.map(
                            (request, index) => (
                                <div
                                    key={`${request.fileId}-${index}`}
                                    className="request-item"
                                >
                                    <p>
                                        <strong>
                                            File:
                                        </strong>{" "}
                                        {request.fileName}
                                    </p>

                                    <p>
                                        <strong>
                                            Requested by:
                                        </strong>{" "}
                                        {request.requesterId.slice(
                                            0,
                                            8
                                        )}
                                        ...
                                    </p>

                                    <div className="request-buttons">
                                        <button
                                            className="accept-button"
                                            onClick={() =>
                                                handleRequestResponse(
                                                    request,
                                                    true
                                                )
                                            }
                                        >
                                            Accept
                                        </button>

                                        <button
                                            className="reject-button"
                                            onClick={() =>
                                                handleRequestResponse(
                                                    request,
                                                    false
                                                )
                                            }
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            )
                        )
                    )}
                </section>

                {transferProgress > 0 && (
                    <section className="card transfer-card">
                        <h2>File Transfer</h2>

                        <p>
                            {transferProgress.toFixed(0)}%
                            complete
                        </p>

                        <div className="progress-container">
                            <div
                                className="progress-bar"
                                style={{
                                    width: `${transferProgress}%`
                                }}
                            ></div>
                        </div>
                    </section>
                )}

                {receivedFile && (
                    <section className="card transfer-card">
                        <h2>File Received 🎉</h2>

                        <p>
                            <strong>File:</strong>{" "}
                            {receivedFileName}
                        </p>

                        <a
                            href={receivedFile}
                            download={receivedFileName}
                        >
                            <button>
                                Download File
                            </button>
                        </a>
                    </section>
                )}
            </main>
        </div>
    );
}

export default App;