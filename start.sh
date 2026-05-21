#!/bin/bash
echo "========================================="
echo "        J.A.R.V.I.S. BOOT SEQUENCE       "
echo "========================================="

# Ensure we're in the correct directory
cd "$(dirname "$0")"

echo ">> Installing Backend Dependencies..."
cd backend
npm install
echo ">> Starting Backend Server..."
npm start &
BACKEND_PID=$!

echo ">> Installing Frontend Dependencies..."
cd ../frontend
npm install
echo ">> Starting Frontend Server..."
npm start &
FRONTEND_PID=$!

echo "========================================="
echo " J.A.R.V.I.S. is now running.            "
echo " Backend running on port 5001.           "
echo " Frontend launching in your browser.     "
echo " Press Ctrl+C to terminate both servers. "
echo "========================================="

# Trap Ctrl+C (SIGINT) to kill both processes
trap "echo -e '\nShutting down J.A.R.V.I.S...'; kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT

# Wait indefinitely
wait
