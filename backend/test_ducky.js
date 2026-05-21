const axios = require('axios');

async function testDucky() {
  try {
    const res = await axios.get('https://html.duckduckgo.com/html/?q=%21ducky+site%3Ayoutube.com+justin+bieber+baby', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log("HTML length:", res.data.length);
    console.log("Snippet of HTML:", res.data.substring(0, 1000));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testDucky();
