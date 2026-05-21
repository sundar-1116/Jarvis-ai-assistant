const WebSocket = require('ws');
const crypto = require('crypto');

function generateEdgeTTS(text, voice = "en-GB-RyanNeural") {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4', {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.43'
      }
    });
    
    const uuid = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')).replace(/-/g, '');
    let audioBuffer = Buffer.alloc(0);

    ws.on('open', () => {
      console.log("WebSocket connected!");
      ws.send(`X-Timestamp:${new Date().toUTCString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      
      const safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%'>${safeText}</prosody></voice></speak>`;
      
      ws.send(`X-RequestId:${uuid}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toUTCString()}\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const headerLength = data.readUInt16BE(0);
        const audioData = data.slice(2 + headerLength);
        audioBuffer = Buffer.concat([audioBuffer, audioData]);
      } else {
        const msg = data.toString();
        console.log("Received string message length:", msg.length);
        if (msg.includes('Path:turn.end')) {
          ws.close();
          resolve(audioBuffer);
        }
      }
    });

    ws.on('error', (e) => {
      console.error("WS ERROR:", e);
      reject(e);
    });
  });
}

generateEdgeTTS("Testing J.A.R.V.I.S. neural link.").then(buf => {
  console.log("Success! Audio length:", buf.length);
}).catch(e => {
  console.error("Failed:", e);
});
