import React from 'react';
import './Navbar.css';

export default function Navbar({ onToggleSettings, onToggleDrag, isDraggingMode }) {
  return (
    <nav className="futuristic-navbar">
      <a href="/" className="navbar-logo-container">
        <img src="/jarvis_logo.png" alt="J.A.R.V.I.S. Logo" className="navbar-logo-img" />
        <span className="navbar-logo-text">J.A.R.V.I.S.</span>
      </a>
      
      <div className="navbar-links">
        <a href="#home" className="nav-link">HOME</a>
        <div className="nav-link" onClick={onToggleSettings}>
          SETTINGS
        </div>
        <div className="nav-link" onClick={onToggleDrag}>
          {isDraggingMode ? "LOCK BLOB" : "DRAG BLOB"}
        </div>
      </div>
    </nav>
  );
}

