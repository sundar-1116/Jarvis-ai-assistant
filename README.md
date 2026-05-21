# J.A.R.V.I.S. - AI Desktop Assistant

J.A.R.V.I.S. is an advanced, fully voice-activated AI desktop assistant built specifically for macOS. It acts as a bridge between a powerful Neural Network (Llama 3.3) and your local operating system, allowing you to control your desktop, websites, and applications entirely hands-free.

## 🚀 Features

- **Conversational Voice UI**: Built with React, featuring a sleek, futuristic Heads-Up Display (HUD) and live speech-to-text.
- **Deep macOS Integration**: J.A.R.V.I.S. uses AppleScript under the hood to deeply integrate with macOS, giving it the ability to:
  - Open and close specific desktop applications (e.g., Spotify, VS Code, Notes).
  - Open, manage, and close specific websites across Google Chrome and Safari tabs.
  - Execute compound commands seamlessly (e.g., *"Open YouTube and close Spotify"*).
- **Fast Path Processing**: A custom built regex engine handles simple desktop tasks instantly, bypassing LLM latency.
- **LLM Powered Intelligence**: For complex reasoning, general queries, and conversational tasks, it utilizes Groq's high-speed inference engine with Llama 3.3.
- **Dynamic Text-to-Speech**: Responses are spoken back to you via an integrated TTS engine, creating a true conversational experience.
- **Robust Voice Activation**: Features "Toggle-to-talk" and robust silence detection so it never cuts you off while you're thinking.

## 🛠 Tech Stack

- **Frontend:** React, Vanilla CSS, Web Speech API (SpeechRecognition).
- **Backend:** Node.js, Express, AppleScript (`osascript`) for macOS control.
- **AI / LLM:** Groq API (Llama 3.3) for neural processing.
- **TTS:** Google TTS API.

## ⚙️ Prerequisites

Since J.A.R.V.I.S. relies on native `osascript` to control the desktop environment, **macOS is required** to run this application.

You also need to have Node.js installed.

## 📥 Installation & Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/sundar-1116/jarvis-ai-assistant.git
   cd jarvis-assistant
   ```

2. Add your Groq API Key:
   Create a `.env` file inside the `backend/` directory and add your API key:
   ```bash
   GROQ_API_KEY=gsk_your_api_key_here
   ```

3. Launch the system:
   Run the included startup script. This will automatically install dependencies for both the frontend and backend, and start them concurrently.
   ```bash
   ./start.sh
   ```

## 🎙 How to Use

1. When the HUD launches in your browser, select your preferred operator profile (this adjusts J.A.R.V.I.S.'s conversational style).
2. Press **Spacebar** or **Double-Clap** to activate the microphone.
3. Speak your command (e.g., *"J.A.R.V.I.S., close all my Chrome tabs and open Spotify"*).
4. Take your time! J.A.R.V.I.S. has a robust silence detector and will patiently wait 3.5 seconds after you finish speaking to auto-submit your request.

## 🤝 Contributing

Feel free to fork this project, submit pull requests, or open issues if you want to help expand J.A.R.V.I.S.'s capabilities!

---

# J.A.R.V.I.S. Deployment Guide

Because J.A.R.V.I.S. uses AppleScript to physically control the macOS desktop, "deploying" it is different from deploying a normal website. Here are the step-by-step instructions on how to handle deployment depending on your goal.

## 🎯 Goal 1: Running the project from GitHub (The Quickest Way)

If you want to share your project with friends, recruiters, or other developers, this is exactly what they need to do to run your code on their Macs. (These steps are already included above!).

**Step 1:** Open the terminal and clone the repository:
```bash
git clone https://github.com/sundar-1116/Jarvis-ai-assistant.git
cd Jarvis-ai-assistant
```

**Step 2:** Add the Groq API key:
Create a file named `.env` inside the `backend/` folder and paste your Groq API key inside it:
```bash
GROQ_API_KEY=gsk_your_api_key_here
```

**Step 3:** Run the automated launch script:
```bash
./start.sh
```
*This will automatically install all the necessary dependencies and launch both the backend and frontend at the same time.*

---

## 🎯 Goal 2: Deploying as a Standalone Mac App (Electron)

If your goal is to turn J.A.R.V.I.S. into a native `.app` file that you can drag into your `Applications` folder and click to open without touching the terminal, you need to use **Electron**. 

**Step 1: Install Electron & Electron Builder**
In your root folder, you initialize a new package and install the Electron builder tools.
```bash
npm init -y
npm install electron electron-builder concurrently --save-dev
```

**Step 2: Create `main.js` (The App Window)**
You create an Electron wrapper script that tells your Mac to open a native desktop window. 
Inside this script, we write code to automatically spawn your Node backend (`server.js`) in the background.

**Step 3: Build the Frontend**
Compile your React frontend into static HTML/CSS files so it runs instantly without a dev server.
```bash
cd frontend && npm run build
```

**Step 4: Load the Frontend in Electron**
Configure `main.js` to load the compiled `frontend/build/index.html` file into the native desktop window, and request microphone permissions from the operating system.

**Step 5: Package the Application**
Run the electron-builder command to bundle the backend, the built frontend, and the Electron wrapper into a single `J.A.R.V.I.S.app` file.
```bash
npx electron-builder --mac
```

**Step 6: Use Your New App**
Drag the newly generated `J.A.R.V.I.S.app` file from the `dist/` folder into your Mac's `Applications` folder. You can now launch J.A.R.V.I.S. straight from your Dock!

---

## 🎯 Goal 3: Deploying as a Background Service

If you just want J.A.R.V.I.S. to always be running on your Mac automatically without packaging it as a desktop app, you use a **macOS LaunchAgent**.

**Step 1:** Create a `.plist` file (e.g., `com.sundar.jarvis.plist`).
**Step 2:** Configure the file to execute your `./start.sh` script automatically.
**Step 3:** Move the file to `~/Library/LaunchAgents/`.
**Step 4:** Run `launchctl load ~/Library/LaunchAgents/com.sundar.jarvis.plist`.
*(J.A.R.V.I.S. will now start silently in the background every time you turn on your computer).*
