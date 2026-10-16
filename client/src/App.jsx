import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

// Keep this URL aligned with the public address of your running EC2 instance.
const socket = io("http://98.81.195.240:5000");

const CHUNK_SIZE = 16 * 1024;

function formatBytes(bytes = 0) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getFileKind(fileName = "") {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (["pdf"].includes(extension)) return "PDF";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return "Image";
    if (["mp4", "mov", "avi", "webm"].includes(extension)) return "Video";
    if (["mp3", "wav", "ogg", "m4a"].includes(extension)) return "Audio";
    if (["zip", "rar", "7z", "tar"].includes(extension)) return "Archive";
    if (["doc", "docx", "txt", "rtf", "md"].includes(extension)) return "Document";
    return "File";
}

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
    const [isDragging, setIsDragging] = useState(false);

    const peerConnection = useRef(null);
    const dataChannel = useRef(null);
    const localFiles = useRef({});
    const receivedChunks = useRef([]);
    const incomingFileInfo = useRef(null);
    const fileInputRef = useRef(null);

    const createPeerConnection = (targetId) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", {
                    targetId,
                    candidate: event.candidate,
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
                        type: message.fileType,
                    };
                    setReceivedFileName(message.name);
                    setTransferProgress(0);
                }

                if (message.type === "file-complete") {
                    console.log("File transfer complete");
                    const info = incomingFileInfo.current;

                    const blob = new Blob(receivedChunks.current, {
                        type: info.type,
                    });

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
                fileType: file.type,
            })
        );

        let offset = 0;
        while (offset < file.size) {
            const chunk = file.slice(offset, offset + CHUNK_SIZE);
            const buffer = await chunk.arrayBuffer();

            while (channel.bufferedAmount > CHUNK_SIZE * 10) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            channel.send(buffer);
            offset += buffer.byteLength;
            const progress = (offset / file.size) * 100;
            setTransferProgress(progress);
        }

        channel.send(JSON.stringify({ type: "file-complete" }));
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
            const otherPeers = peerList.filter((peer) => peer.id !== socket.id);
            setPeers(otherPeers);
        });

        socket.on("file-list", (fileList) => {
            setSharedFiles(fileList);
        });

        socket.on("file-request", (request) => {
            console.log("File request received:", request);
            setFileRequests((previousRequests) => [...previousRequests, request]);
        });

        socket.on("file-response", async (response) => {
            if (response.accepted) {
                setRequestStatus(
                    `Your request for ${response.fileName} was accepted! Connecting...`
                );

                const pc = createPeerConnection(response.ownerId);
                const channel = pc.createDataChannel("fileTransfer");
                setupDataChannel(channel);

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                socket.emit("webrtc-offer", {
                    targetId: response.ownerId,
                    offer,
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

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit("webrtc-answer", {
                targetId: senderId,
                answer,
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
                console.error("ICE candidate error:", error);
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
        if (file) setSelectedFile(file);
    };

    const handleShareFile = () => {
        if (!selectedFile || !isOnline) return;

        const fileId = `${socket.id}-${Date.now()}`;
        localFiles.current[fileId] = selectedFile;

        socket.emit("share-file", {
            id: fileId,
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type,
        });

        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleRequestFile = (fileId) => {
        socket.emit("request-file", fileId);
        setRequestStatus("File request sent. Waiting for owner response...");
    };

    const handleRequestResponse = async (request, accepted) => {
        socket.emit("respond-file-request", {
            fileId: request.fileId,
            fileName: request.fileName,
            requesterId: request.requesterId,
            accepted,
        });

        setFileRequests((previousRequests) =>
            previousRequests.filter(
                (item) =>
                    !(item.fileId === request.fileId &&
                      item.requesterId === request.requesterId)
            )
        );

        if (accepted) {
            const file = localFiles.current[request.fileId];

            if (!file) {
                console.error("Original file not found locally");
                return;
            }

            const waitForConnection = setInterval(() => {
                if (
                    dataChannel.current &&
                    dataChannel.current.readyState === "open"
                ) {
                    clearInterval(waitForConnection);
                    console.log("Connection ready. Sending file...");
                    sendFile(file);
                }
            }, 500);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) setSelectedFile(file);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsDragging(false);
        }
    };

    const handleRemoveSelected = () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const connectionLabel = connectionStatus || (isOnline ? "Signaling connected" : "Connecting to server");
    const isP2PConnected = connectionStatus.toLowerCase().includes("connected") || connectionStatus.toLowerCase().includes("established");

    return (
        <div className="app-shell">
            <header className="topbar">
                <div className="topbar-inner">
                    <a className="brand" href="#" aria-label="PeerDrop home">
                        <span className="brand-mark" aria-hidden="true">↗</span>
                        <span className="brand-copy">
                            <strong>PeerDrop</strong>
                            <small>Cloud-assisted file sharing</small>
                        </span>
                    </a>

                    <div className="topbar-status">
                        <span className={`status-dot ${isOnline ? "is-online" : "is-offline"}`} />
                        <span>{isOnline ? "Server connected" : "Connecting to server"}</span>
                    </div>
                </div>
            </header>

            <main className="dashboard">
                <section className="welcome-row">
                    <div>
                        <p className="eyebrow">PEER-TO-PEER WORKSPACE</p>
                        <h1>Share files, directly.</h1>
                        <p className="welcome-copy">
                            Discover peers, share a file, and transfer it over a WebRTC connection.
                        </p>
                    </div>
                    <div className={`connection-pill ${isOnline ? "connected" : "disconnected"}`}>
                        <span className="status-dot" />
                        {isOnline ? "Signaling online" : "Signaling offline"}
                    </div>
                </section>

                <section className="stats-grid" aria-label="Workspace overview">
                    <article className="stat-card">
                        <div className="stat-icon blue-icon">⌘</div>
                        <div>
                            <p>My peer ID</p>
                            <strong className="stat-peer-id" title={peerId}>
                                {isOnline ? `${peerId.slice(0, 8)}…` : "Not connected"}
                            </strong>
                            <span>{isOnline ? "Ready to discover peers" : "Waiting for server"}</span>
                        </div>
                    </article>
                    <article className="stat-card">
                        <div className="stat-icon violet-icon">◎</div>
                        <div>
                            <p>Available peers</p>
                            <strong>{peers.length}</strong>
                            <span>{peers.length === 1 ? "peer discovered" : "peers discovered"}</span>
                        </div>
                    </article>
                    <article className="stat-card">
                        <div className="stat-icon cyan-icon">▤</div>
                        <div>
                            <p>Shared files</p>
                            <strong>{sharedFiles.length}</strong>
                            <span>Files advertised in this session</span>
                        </div>
                    </article>
                    <article className="stat-card">
                        <div className="stat-icon green-icon">⇄</div>
                        <div>
                            <p>P2P connection</p>
                            <strong className="stat-connection">{isP2PConnected ? "Connected" : "Not active"}</strong>
                            <span>{connectionStatus || "Connect when a request is accepted"}</span>
                        </div>
                    </article>
                </section>

                <div className="content-grid">
                    <section className="panel upload-panel">
                        <div className="panel-heading">
                            <div>
                                <p className="eyebrow">SEND SOMETHING</p>
                                <h2>Share a file</h2>
                                <p className="panel-description">Make a file available for connected peers to request.</p>
                            </div>
                            <span className="heading-icon">↑</span>
                        </div>

                        <div
                            className={`dropzone ${isDragging ? "dragging" : ""} ${selectedFile ? "has-file" : ""}`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    fileInputRef.current?.click();
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label="Choose a file or drag it here"
                        >
                            <input
                                ref={fileInputRef}
                                className="visually-hidden"
                                type="file"
                                onClick={(event) => event.stopPropagation()}
                                onChange={handleFileChange}
                            />
                            <div className="upload-icon">
                                <span>↑</span>
                            </div>
                            <h3>{selectedFile ? "File ready to share" : "Drop your file here"}</h3>
                            <p>{selectedFile ? "Your file is selected and ready." : "or click to browse files on your device"}</p>
                            {!selectedFile && <span className="file-types-note">Any file type · Peer-to-peer transfer</span>}
                        </div>

                        {selectedFile && (
                            <div className="selected-file">
                                <div className="file-type-icon">{getFileKind(selectedFile.name).slice(0, 3).toUpperCase()}</div>
                                <div className="selected-file-copy">
                                    <strong title={selectedFile.name}>{selectedFile.name}</strong>
                                    <span>{formatBytes(selectedFile.size)} · {selectedFile.type || getFileKind(selectedFile.name)}</span>
                                </div>
                                <button className="icon-button" type="button" onClick={handleRemoveSelected} aria-label="Remove selected file">×</button>
                            </div>
                        )}

                        <button
                            className="button button-primary share-button"
                            onClick={handleShareFile}
                            disabled={!selectedFile || !isOnline}
                        >
                            <span>↑</span> Share file with peers
                        </button>
                        {!isOnline && <p className="helper-text">The server must be online before you can advertise a file.</p>}
                    </section>

                    <section className="panel peers-panel">
                        <div className="panel-heading">
                            <div>
                                <p className="eyebrow">NETWORK</p>
                                <h2>Available peers <span className="count-badge">{peers.length}</span></h2>
                                <p className="panel-description">Other browser sessions connected to the signaling server.</p>
                            </div>
                            <span className="heading-icon">⌘</span>
                        </div>

                        {peers.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">◎</div>
                                <strong>No other peers yet</strong>
                                <p>Open the app in another browser or device to discover a peer.</p>
                            </div>
                        ) : (
                            <div className="peer-list">
                                {peers.map((peer) => (
                                    <article className="peer-item" key={peer.id}>
                                        <div className="avatar">{peer.id.slice(0, 2).toUpperCase()}</div>
                                        <div className="peer-item-copy">
                                            <strong>Peer {peer.id.slice(0, 8)}</strong>
                                            <span title={peer.id}>{peer.id}</span>
                                        </div>
                                        <span className="mini-status"><i /> Online</span>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="panel files-panel">
                        <div className="panel-heading">
                            <div>
                                <p className="eyebrow">DISCOVER</p>
                                <h2>Available files <span className="count-badge">{sharedFiles.length}</span></h2>
                                <p className="panel-description">Request a file shared by another peer.</p>
                            </div>
                            <span className="heading-icon">▤</span>
                        </div>

                        {sharedFiles.length === 0 ? (
                            <div className="empty-state compact-empty">
                                <div className="empty-icon">▤</div>
                                <strong>No shared files yet</strong>
                                <p>Files advertised by connected peers will appear here.</p>
                            </div>
                        ) : (
                            <div className="shared-files-list">
                                {sharedFiles.map((file) => (
                                    <article className="shared-file-card" key={file.id}>
                                        <div className="file-type-icon">{getFileKind(file.name).slice(0, 3).toUpperCase()}</div>
                                        <div className="shared-file-copy">
                                            <strong title={file.name}>{file.name}</strong>
                                            <span>{formatBytes(file.size)} · {getFileKind(file.name)}</span>
                                            <small>Shared by {file.ownerId.slice(0, 8)}…</small>
                                        </div>
                                        {file.ownerId !== socket.id ? (
                                            <button
                                                className="button button-secondary request-button"
                                                onClick={() => handleRequestFile(file.id)}
                                            >
                                                Request file
                                            </button>
                                        ) : (
                                            <span className="owner-label">Your file</span>
                                        )}
                                    </article>
                                ))}
                            </div>
                        )}

                        {requestStatus && (
                            <div className={`notice ${requestStatus.toLowerCase().includes("reject") ? "notice-warning" : "notice-info"}`} role="status">
                                <span className="notice-symbol">i</span>
                                <p>{requestStatus}</p>
                            </div>
                        )}
                    </section>

                    <section className="panel requests-panel">
                        <div className="panel-heading">
                            <div>
                                <p className="eyebrow">INCOMING</p>
                                <h2>File requests <span className="count-badge">{fileRequests.length}</span></h2>
                                <p className="panel-description">Review requests from other peers before sending a file.</p>
                            </div>
                            <span className="heading-icon">⇄</span>
                        </div>

                        {fileRequests.length === 0 ? (
                            <div className="empty-state compact-empty">
                                <div className="empty-icon">⌁</div>
                                <strong>You're all caught up</strong>
                                <p>Incoming file requests will appear here.</p>
                            </div>
                        ) : (
                            <div className="requests-list">
                                {fileRequests.map((request, index) => (
                                    <article className="request-item" key={`${request.fileId}-${index}`}>
                                        <div className="request-file-icon">⇩</div>
                                        <div className="request-copy">
                                            <strong>{request.fileName}</strong>
                                            <span>Requested by peer {request.requesterId.slice(0, 8)}…</span>
                                        </div>
                                        <div className="request-buttons">
                                            <button className="button button-success" onClick={() => handleRequestResponse(request, true)}>Accept</button>
                                            <button className="button button-danger" onClick={() => handleRequestResponse(request, false)}>Reject</button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {(transferProgress > 0 || receivedFile) && (
                        <section className="panel transfer-panel">
                            <div className="panel-heading">
                                <div>
                                    <p className="eyebrow">TRANSFER ACTIVITY</p>
                                    <h2>{receivedFile ? "File received successfully" : "File transfer"}</h2>
                                    <p className="panel-description">
                                        {receivedFile ? "Your file is ready to download." : receivedFileName || "Your transfer is in progress."}
                                    </p>
                                </div>
                                <span className={`transfer-state-icon ${receivedFile ? "complete" : ""}`}>{receivedFile ? "✓" : "⇄"}</span>
                            </div>

                            <div className="progress-heading">
                                <span>{receivedFile ? receivedFileName : "Transfer progress"}</span>
                                <strong>{Math.round(transferProgress)}%</strong>
                            </div>
                            <div
                                className="progress-track"
                                role="progressbar"
                                aria-valuenow={Math.round(transferProgress)}
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-label="File transfer progress"
                            >
                                <div className="progress-fill" style={{ width: `${transferProgress}%` }} />
                            </div>
                            <div className="progress-footer">
                                <span>{receivedFile ? "Transfer complete" : "Keep this tab open while transferring"}</span>
                                {receivedFile && <span className="complete-label"><i /> Completed</span>}
                            </div>

                            {receivedFile && (
                                <div className="received-file-card">
                                    <div className="received-check">✓</div>
                                    <div className="received-file-copy">
                                        <strong>{receivedFileName}</strong>
                                        <span>Received and ready to save to your device</span>
                                    </div>
                                    <a className="button button-primary download-button" href={receivedFile} download={receivedFileName}>
                                        Download file <span>↓</span>
                                    </a>
                                </div>
                            )}
                        </section>
                    )}
                </div>

                <footer className="app-footer">
                    <span><span className={`status-dot ${isOnline ? "is-online" : "is-offline"}`} /> {isOnline ? "Connected to signaling server" : "Signaling server unavailable"}</span>
                    <span>PeerDrop · WebRTC file transfer</span>
                </footer>
            </main>
        </div>
    );
}

export default App;
