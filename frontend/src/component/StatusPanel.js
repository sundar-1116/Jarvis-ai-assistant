import React, { useState, useEffect } from 'react';
import './StatusPanel.css';

const StatusPanel = ({ isListening, speechStatus, apiConnected }) => {
  const [battery, setBattery] = useState({ level: 100, charging: false, supported: true });
  const [network, setNetwork] = useState({ online: navigator.onLine, type: 'WIFI' });

  useEffect(() => {
    // Battery Status API (supported in most Chromium browsers)
    if ('getBattery' in navigator) {
      navigator.getBattery().then((batt) => {
        const updateBattery = () => {
          setBattery({
            level: Math.round(batt.level * 100),
            charging: batt.charging,
            supported: true
          });
        };
        updateBattery();
        batt.addEventListener('levelchange', updateBattery);
        batt.addEventListener('chargingchange', updateBattery);
      });
    } else {
      setBattery({ level: 100, charging: true, supported: false });
    }

    // Network Information API
    const updateNetwork = () => {
      let type = 'WIFI';
      if (navigator.connection) {
        const connType = navigator.connection.type || navigator.connection.effectiveType;
        if (connType && (connType.includes('cellular') || ['2g', '3g', '4g', '5g'].includes(connType))) {
          type = 'CELLULAR';
        } else if (connType && connType.includes('ethernet')) {
          type = 'ETHERNET';
        }
      }
      setNetwork({
        online: navigator.onLine,
        type: type
      });
    };
    
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    if (navigator.connection) {
      navigator.connection.addEventListener('change', updateNetwork);
    }

    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      if (navigator.connection) navigator.connection.removeEventListener('change', updateNetwork);
    };
  }, []);

  const [sysMetrics, setSysMetrics] = useState({ volume: "75%", brightness: "AUTO" });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const hostname = isLocal ? 'localhost' : window.location.hostname;
        const res = await fetch(`http://${hostname}:5001/api/sys-metrics`);
        const data = await res.json();
        setSysMetrics(data);
      } catch (err) {
        // Silent fail, just keep defaults if backend is unreachable
      }
    };
    
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const systemOnline = true;
  const jarvisOnline = apiConnected;
  const micActive = isListening;
  
  // If speechStatus contains 'denied' or 'not-allowed' or 'error', permission is false
  const micPermission = !speechStatus.toLowerCase().includes('denied') && !speechStatus.toLowerCase().includes('error');

  const sysStatuses = [
    { label: 'SYSTEM', status: systemOnline },
    { label: 'GROQ UPLINK', status: apiConnected },
    { label: 'MICROPHONE', status: micActive },
    { label: 'MIC PERMISSION', status: micPermission },
    { label: 'J.A.R.V.I.S. CORE', status: jarvisOnline },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="status-panel-container">
        <div className="status-panel-header">SYS_STATUS // OVERVIEW</div>
        <ul className="status-list">
          {sysStatuses.map((item, index) => (
            <li key={index} className="status-item">
              <span className="status-label">{item.label}</span>
              <span className={`status-indicator ${item.status ? 'online' : 'offline'}`}>
                {item.status ? 'ONLINE' : 'OFFLINE'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="status-panel-container">
        <div className="status-panel-header">DEV_MONITOR // HARDWARE</div>
        <ul className="status-list">
          <li className="status-item">
            <span className="status-label">POWER</span>
            <span className={`status-indicator ${battery.charging ? 'online' : 'warning'}`}>
              {battery.supported ? (battery.charging ? 'A/C (CHARGING)' : 'BATTERY') : 'UNKNOWN'}
            </span>
          </li>
          <li className="status-item">
            <span className="status-label">CHARGE LVL</span>
            <span className={`status-indicator ${battery.level > 20 ? 'online' : 'offline'}`}>
              {battery.supported ? `${battery.level}%` : '100%'}
            </span>
          </li>
          <li className="status-item">
            <span className="status-label">BRIGHTNESS</span>
            <span className="status-indicator online">
              {sysMetrics.brightness}
            </span>
          </li>
          <li className="status-item">
            <span className="status-label">AUDIO LEVEL</span>
            <span className="status-indicator online">
              {sysMetrics.volume}%
            </span>
          </li>
          <li className="status-item">
            <span className="status-label">UPLINK</span>
            <span className={`status-indicator ${network.online ? 'online' : 'offline'}`}>
              {network.online ? network.type : 'DISCONNECTED'}
            </span>
          </li>
          <li className="status-item">
            <span className="status-label">BLUETOOTH</span>
            <span className="status-indicator online">
              STANDBY
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default StatusPanel;
