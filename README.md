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

## 🚀 Advanced Deployment

Because J.A.R.V.I.S. integrates deeply with macOS, it cannot be deployed to standard web servers (like Vercel or Heroku). However, you can package it as a native standalone macOS `.app` using Electron, or run it silently as a Background Service. 

For full step-by-step instructions on advanced local deployment, check out the [Deployment Guide](./DEPLOYMENT_GUIDE.md).
