# J.A.R.V.I.S. Deployment Guide

Because J.A.R.V.I.S. uses AppleScript to physically control the macOS desktop, "deploying" it is different from deploying a normal website. Here are the step-by-step instructions on how to handle deployment depending on your goal.

---

## 🎯 Goal 1: Running the project from GitHub (The Quickest Way)

If you want to share your project with friends, recruiters, or other developers, this is exactly what they need to do to run your code on their Macs. (These steps are already included in your `README.md`!).

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

Here is the step-wise process to package it. *(Note: If you want to do this, let me know and I can write the code to automate this for you right now!)*

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
