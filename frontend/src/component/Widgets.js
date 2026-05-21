import React, { useState, useEffect, useRef } from 'react';
import './Widgets.css';

// Draw satellite tiles from Esri World Imagery (free, no API key, never blocked)
function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z: zoom };
}

const SatelliteMap = ({ lat, lng }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const ZOOM = 15;
    const TILE_SIZE = 256;

    // Esri World Imagery satellite tiles (free, no restrictions)
    const ESRI_URL = (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

    const center = latLngToTile(lat, lng, ZOOM);

    // How many tiles do we need?
    const tilesX = Math.ceil(W / TILE_SIZE) + 2;
    const tilesY = Math.ceil(H / TILE_SIZE) + 2;

    // Fractional position of the center within its tile
    const n = Math.pow(2, ZOOM);
    const fracX = ((lng + 180) / 360) * n - center.x;
    const fracY =
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n -
      center.y;

    // Pixel offset so center lat/lng falls in the middle of canvas
    const offsetX = Math.floor(W / 2 - fracX * TILE_SIZE);
    const offsetY = Math.floor(H / 2 - fracY * TILE_SIZE);

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, W, H);

    for (let dx = -Math.ceil(tilesX / 2); dx <= Math.ceil(tilesX / 2); dx++) {
      for (let dy = -Math.ceil(tilesY / 2); dy <= Math.ceil(tilesY / 2); dy++) {
        const tx = center.x + dx;
        const ty = center.y + dy;
        const px = offsetX + dx * TILE_SIZE;
        const py = offsetY + dy * TILE_SIZE;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
          // HUD overlay: cyan grid lines
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 255, 220, 0.08)';
          ctx.lineWidth = 0.5;
          for (let gx = 0; gx < W; gx += 32) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
          }
          for (let gy = 0; gy < H; gy += 32) {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
          }
          ctx.restore();

          // Center crosshair
          const cx = W / 2, cy = H / 2;
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
          ctx.lineWidth = 1.5;
          // horizontal
          ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy); ctx.stroke();
          // vertical
          ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.stroke();
          // circle
          ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 2 * Math.PI); ctx.stroke();
          ctx.restore();
        };
        img.onerror = () => {
          // tile failed — draw placeholder
          ctx.fillStyle = '#0d1f3c';
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        };
        img.src = ESRI_URL(ZOOM, tx, ty);
      }
    }
  }, [lat, lng]);

  return (
    <canvas
      ref={canvasRef}
      width={290}
      height={160}
      style={{ width: '100%', height: '100%', display: 'block', borderRadius: '4px' }}
    />
  );
};

const Widgets = () => {
  const [time, setTime]         = useState(new Date());
  const [location, setLocation] = useState({ lat: 40.7128, lng: -74.0060 });
  const [weather, setWeather]   = useState({ temp: '--', desc: 'SCANNING' });

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Location & Weather
  useEffect(() => {
    const fetchWeather = async (lat, lng) => {
      try {
        const res  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
        const data = await res.json();
        const tempC = Math.round(data.current_weather.temperature);
        setWeather({ temp: `${tempC}°C`, desc: 'ONLINE' });
      } catch (e) {
        setWeather({ temp: 'ERR', desc: 'OFFLINE' });
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });
          fetchWeather(lat, lng);
        },
        () => {
          console.warn('Geolocation denied — using default.');
          fetchWeather(40.7128, -74.006);
        },
        { timeout: 5000 }
      );
    } else {
      fetchWeather(40.7128, -74.006);
    }
  }, []);

  const formatTime = (d) =>
    d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatDate = (d) =>
    d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();

  return (
    <div className="widgets-container">
      {/* CLOCK */}
      <div className="widget-panel">
        <div className="widget-title">SYS_TIME // CHRONOS</div>
        <div className="clock-time">{formatTime(time)}</div>
        <div className="clock-date">{formatDate(time)}</div>
      </div>

      {/* WEATHER */}
      <div className="widget-panel">
        <div className="widget-title">ENV_MONITOR // CLIMATE</div>
        <div className="weather-data">
          <div className="weather-temp">{weather.temp}</div>
          <div className="weather-desc">{weather.desc}</div>
        </div>
        <div className="location-data">
          LOC: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
        </div>
      </div>

      {/* SATELLITE MAP */}
      <div className="widget-panel">
        <div className="widget-title">GEO_TRACKER // SAT-LINK</div>
        <div className="map-container">
          <SatelliteMap lat={location.lat} lng={location.lng} />
        </div>
      </div>
    </div>
  );
};

export default Widgets;
