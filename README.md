# Cloud-Assisted Peer-to-Peer File Sharing System

A browser-based peer-to-peer file sharing application that allows users to discover peers, advertise files, request files, authorize transfers, and transfer files directly between browsers using WebRTC.

The project uses a centralized Node.js + Socket.IO server for peer discovery, request coordination, and WebRTC signaling. The actual file data is transferred directly between peers using a WebRTC DataChannel.

---

## Features

- Peer discovery using Socket.IO
- File advertisement and metadata sharing
- View files shared by other peers
- Request files from another peer
- Accept or reject file requests
- WebRTC signaling
- Peer-to-peer WebRTC DataChannel connection
- Direct browser-to-browser file transfer
- Chunk-based file transfer
- File transfer progress tracking
- File reconstruction after transfer
- Download received files

---

# Technology Stack

## Frontend

- React
- Vite
- JavaScript
- CSS
- Socket.IO Client
- WebRTC API

## Backend

- Node.js
- Express.js
- Socket.IO

## Peer-to-Peer Communication

- WebRTC
- RTCDataChannel
- STUN Server

---

# System Architecture

```text
                     Signaling / Coordination Server
                           Node.js + Socket.IO
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
              Peer A                            Peer B
           File Owner                        Requester
                 │                                 │
                 │──── File Metadata ─────────────▶│
                 │                                 │
                 │◀──── File Request ──────────────│
                 │                                 │
                 │──── Accept / Reject ───────────▶│
                 │                                 │
                 │◀════ WebRTC Signaling ═════════▶│
                 │                                 │
                 └══════ Direct P2P Connection ════┘
                                  │
                           File Transfer
```

The centralized server is responsible for:

- Peer discovery
- File metadata sharing
- File request coordination
- Accept/reject responses
- WebRTC Offer/Answer exchange
- ICE candidate exchange

The actual file does **not** pass through the server.

The file is transferred directly between peers using a WebRTC DataChannel.

---

# Project Structure

```text
cloud-assisted-p2p-file-sharing/
│
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── vite.config.js
│
├── server/
│   ├── index.js
│   └── package.json
│
├── .gitignore
└── README.md
```

---

# Prerequisites

Before running this project, make sure the following software is installed on your computer.

## 1. Node.js and npm

Node.js is required to run both the frontend and backend.

Download and install Node.js from:

https://nodejs.org/

It is recommended to install the **LTS version**.

After installation, open a terminal and verify Node.js:

```bash
node -v
```

Verify npm:

```bash
npm -v
```

Both commands should display version numbers.

---

## 2. Git

Git is required to clone the project repository.

Download and install Git from:

https://git-scm.com/downloads

After installation, verify it:

```bash
git --version
```

The command should display the installed Git version.

---

## 3. Modern Web Browser

A modern browser with WebRTC support is required.

Recommended browsers:

- Google Chrome
- Microsoft Edge
- Mozilla Firefox

Google Chrome is recommended for testing.

---

# Installation

## Step 1: Clone the Repository

Open a terminal in the folder where you want to store the project.

Run:

```bash
git clone YOUR_REPOSITORY_URL
```

Replace `YOUR_REPOSITORY_URL` with the actual GitHub repository URL.

Example:

```bash
git clone https://github.com/USERNAME/cloud-assisted-p2p-file-sharing.git
```

---

## Step 2: Open the Project Folder

Move into the cloned project:

```bash
cd cloud-assisted-p2p-file-sharing
```

The project should contain:

```text
client
server
README.md
.gitignore
```

---

# Backend Setup

## Step 1: Move into the Server Folder

From the project root:

```bash
cd server
```

---

## Step 2: Install Backend Dependencies

Run:

```bash
npm install
```

This installs all required backend dependencies listed in `server/package.json`.

The backend uses:

- Express
- Socket.IO
- CORS
- Nodemon (if configured as a development dependency)

---

## Step 3: Start the Backend Server

Run:

```bash
npm run dev
```

The backend server should start on:

```text
http://localhost:5000
```

You should see a message similar to:

```text
Server running on port 5000
```

Keep this terminal running while using the application.

---

# Frontend Setup

Open a **new terminal window**.

## Step 1: Move into the Client Folder

If you are starting from the project root:

```bash
cd client
```

If you are currently inside the `server` folder:

```bash
cd ../client
```

---

## Step 2: Install Frontend Dependencies

Run:

```bash
npm install
```

This installs all required frontend dependencies listed in `client/package.json`.

The frontend uses:

- React
- Vite
- Socket.IO Client

---

## Step 3: Start the Frontend

Run:

```bash
npm run dev
```

Vite should display output similar to:

```text
VITE ready

Local: http://localhost:5173/
```

Open the displayed URL in your browser.

Usually:

```text
http://localhost:5173
```

---

# Running the Complete Project

The project requires **two terminals running simultaneously**.

## Terminal 1 — Backend

From the project root:

```bash
cd server
npm run dev
```

This starts:

```text
Node.js + Express + Socket.IO Server
Port: 5000
```

---

## Terminal 2 — Frontend

From the project root:

```bash
cd client
npm run dev
```

This starts:

```text
React + Vite Application
Port: 5173
```

Then open:

```text
http://localhost:5173
```

in a browser.

---

# How to Test Peer-to-Peer File Transfer

The application can be tested locally by opening two instances of the application.

For initial testing, use **two separate browser tabs**.

For a more realistic test, use:

- Two different browsers, or
- Two different computers connected to the same network

---

## Step 1: Start the Backend

Make sure the backend is running:

```bash
cd server
npm run dev
```

Expected output:

```text
Server running on port 5000
```

---

## Step 2: Start the Frontend

In another terminal:

```bash
cd client
npm run dev
```

Open:

```text
http://localhost:5173
```

---

## Step 3: Create Two Peers

Open the application in two separate browser tabs.

```text
Tab 1 → Peer A (File Owner)

Tab 2 → Peer B (Requester)
```

Each browser tab will connect to the Socket.IO server as a separate peer.

Both peers should receive unique Peer IDs.

---

## Step 4: Share a File

On **Peer A**:

1. Go to the **Share a File** section.
2. Click the file selection input.
3. Select a small file for testing.
4. Click:

```text
Share File
```

The file itself is **not uploaded to the server**.

Only the following metadata is sent to the server:

- File name
- File size
- File type
- Owner Peer ID

The actual file remains stored locally in Peer A's browser.

---

## Step 5: Request the File

On **Peer B**:

1. Look under the **Available Files** section.
2. Find the file shared by Peer A.
3. Click:

```text
Request File
```

The request is sent to the signaling server.

The server forwards the request to the file owner.

---

## Step 6: Accept or Reject the Request

On **Peer A**, the request appears under:

```text
Incoming File Requests
```

Peer A can choose:

```text
Accept
```

or:

```text
Reject
```

### If Rejected

Peer B receives a rejection message.

No WebRTC connection is established.

### If Accepted

The WebRTC connection process begins.

---

# WebRTC Connection Process

After Peer A accepts the request:

```text
Peer B
   │
   │ Creates WebRTC Offer
   ▼
Socket.IO Signaling Server
   │
   │ Relays Offer
   ▼
Peer A
   │
   │ Creates WebRTC Answer
   ▼
Socket.IO Signaling Server
   │
   │ Relays Answer
   ▼
Peer B
```

ICE candidates are also exchanged through the Socket.IO server.

Once negotiation is complete:

```text
Peer A ═══════════════ Peer B
        WebRTC P2P
        DataChannel
```

The application should display:

```text
P2P DataChannel Connected
```

---

# File Transfer Process

Once the WebRTC DataChannel is established:

```text
Peer A
  │
  │ Reads selected file
  ▼
File Split into Chunks
  │
  ▼
WebRTC DataChannel
  │
  ▼
Peer B
  │
  ▼
Receives File Chunks
  │
  ▼
Reconstructs File
  │
  ▼
Creates Downloadable File
```

The file is transferred in chunks.

During the transfer:

- Transfer progress is displayed.
- The receiving peer collects all chunks.
- The received chunks are combined into a Blob.
- A downloadable file is created.

Once completed, the receiver will see:

```text
File Received 🎉
```

A **Download File** button will then be available.

---

# Complete Testing Flow

Use this sequence to test the full application:

```text
1. Start Backend
        │
        ▼
2. Start Frontend
        │
        ▼
3. Open Application in Two Tabs
        │
        ▼
4. Peer A Selects File
        │
        ▼
5. Peer A Shares File
        │
        ▼
6. Peer B Sees File
        │
        ▼
7. Peer B Requests File
        │
        ▼
8. Peer A Receives Request
        │
        ▼
9. Peer A Accepts Request
        │
        ▼
10. WebRTC Signaling Begins
        │
        ▼
11. WebRTC DataChannel Connects
        │
        ▼
12. File Split into Chunks
        │
        ▼
13. Direct P2P File Transfer
        │
        ▼
14. Peer B Receives File
        │
        ▼
15. File is Reconstructed
        │
        ▼
16. Peer B Downloads File
```

---

# Current Development Status

## Completed

- [x] React frontend
- [x] Node.js backend
- [x] Socket.IO communication
- [x] Peer discovery
- [x] File advertisement
- [x] File metadata sharing
- [x] File requests
- [x] Accept/reject authorization
- [x] WebRTC signaling
- [x] WebRTC Offer/Answer exchange
- [x] ICE candidate exchange
- [x] WebRTC DataChannel
- [x] Chunk-based file transfer
- [x] Transfer progress tracking
- [x] File reconstruction
- [x] File download

---

# AWS Integration Plan

The current version is fully functional and tested locally.

AWS integration is planned for the next phase of development.

## Planned Amazon EC2 Integration

The Node.js + Socket.IO coordination server will be deployed to an Amazon EC2 instance.

EC2 will handle:

- Peer discovery
- File metadata coordination
- File request management
- Accept/reject coordination
- WebRTC signaling
- WebRTC Offer/Answer exchange
- ICE candidate exchange

The architecture will become:

```text
                    AWS Cloud
                        │
                ┌───────▼────────┐
                │   Amazon EC2   │
                │                │
                │ Node.js Server │
                │ Socket.IO      │
                │ Signaling      │
                └───────┬────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
           Peer A              Peer B
              │                   │
              └──── WebRTC P2P ───┘
                       │
                 File Transfer
```

---

# Future Amazon S3 Integration

Amazon S3 is planned as a possible fallback storage mechanism.

Future hybrid architecture:

```text
                 File Request
                      │
                      ▼
              Is Peer Available?
                 /           \
               Yes            No
                │              │
                ▼              ▼
          WebRTC P2P        Amazon S3
        Direct Transfer    Cloud Fallback
```

This would create a hybrid cloud-assisted peer-to-peer file sharing system where:

- Direct P2P transfer is preferred.
- Cloud storage can act as a fallback.

---

# Important Notes

- The signaling server does not transfer the actual file.
- Only file metadata and WebRTC signaling information pass through Socket.IO.
- Actual file data travels directly between peers.
- WebRTC DataChannels are used for peer-to-peer file transfer.
- The current version is configured for local development.
- AWS integration is planned for a future development phase.

---

# Contributors

- Abhiram Kalla
- Hasini Rishi

---

# Project Status

The core peer-to-peer file sharing functionality is complete and successfully tested locally.

AWS cloud deployment and cloud storage integration are planned as the next major phase of development.