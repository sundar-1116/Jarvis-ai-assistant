import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export default function MicReactiveBlob({
  color = "#0084ff",
  size = 400,
  position = { bottom: "2vw", right: "2vw" },
  sensitivity = 1.5,
  isDraggable = false,
  onPositionChange
}) {
  const mountRef = useRef(null);
  const plasmaMatRef = useRef(null);
  const shellFrontMatRef = useRef(null);

  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState("");

  const [dragPos, setDragPos] = useState(position);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });

  const sensitivityRef = useRef(sensitivity);
  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    setDragPos(position);
  }, [position]);

  // Handle color change dynamically
  useEffect(() => {
    if (plasmaMatRef.current) {
      plasmaMatRef.current.uniforms.uColorMid.value.set(color);
    }
    if (shellFrontMatRef.current) {
      shellFrontMatRef.current.uniforms.uColor.value.set(color);
    }
  }, [color]);

  useEffect(() => {
    let scene, camera, renderer, controls, animationFrameId;
    let plasmaMat, shellFrontMat, shellBackMat, pMat, mainGroup, particles;
    let analyser, audioContext, dataArray, mediaStream;
    let micLevel = 0;

    const container = mountRef.current;
    if (!container) return;

    // --- CONFIGURATION OBJECT ---
    const params = {
      timeScale: 1.2,
      rotationSpeedX: 0.002,
      rotationSpeedY: 0.005,
      plasmaScale: 0.2,
      plasmaBrightness: 1.31,
      voidThreshold: 0.09,
      colorDeep: 0x001433,
      colorMid: color,
      colorBright: 0x00ffe1,
      shellColor: color,
      shellOpacity: 0.41,
    };

    // 1. SCENE SETUP
    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.z = 2.4;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;

    // --- GROUP FOR ROTATION ---
    mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // --- GLSL NOISE FUNCTIONS ---
    const noiseFunctions = `
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx) ;
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute( permute( permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
            float n_ = 0.142857142857;
            vec3  ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
        }

        float fbm(vec3 p) {
            float total = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            for (int i = 0; i < 3; i++) { 
                total += snoise(p * frequency) * amplitude;
                amplitude *= 0.5;
                frequency *= 2.0;
            }
            return total;
        }
    `;

    // 2. LIGHTS
    const pointLight = new THREE.PointLight(0x0088ff, 2.0, 10);
    mainGroup.add(pointLight);

    // 3. OUTER SHELL (Glass)
    const shellGeo = new THREE.SphereGeometry(1.0, 64, 64);

    const shellShader = {
      vertexShader: `
            uniform float uAudio;
            uniform float uTime;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            ${noiseFunctions}

            void main() {
                vNormal = normalize(normalMatrix * normal);
                
                // Audio makes the noise scale smaller and time faster for chaotic ripples
                float noise = fbm(position * (3.0 + uAudio * 2.0) + uTime * (0.5 + uAudio * 3.0));
                
                // Disruption effect: shell gets highly wobbly and spiky
                vec3 newPosition = position + normal * (noise * uAudio * 0.6);

                vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
      fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            uniform vec3 uColor;
            uniform float uOpacity;
            
            void main() {
                float fresnel = pow(1.0 - dot(normalize(vNormal), normalize(vViewPosition)), 2.5);
                gl_FragColor = vec4(uColor, fresnel * uOpacity);
            }
        `,
    };

    shellBackMat = new THREE.ShaderMaterial({
      vertexShader: shellShader.vertexShader,
      fragmentShader: shellShader.fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(0x000055) },
        uOpacity: { value: 0.3 },
        uTime: { value: 0 },
        uAudio: { value: 0 }
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });

    shellFrontMat = new THREE.ShaderMaterial({
      vertexShader: shellShader.vertexShader,
      fragmentShader: shellShader.fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(params.shellColor) },
        uOpacity: { value: params.shellOpacity },
        uTime: { value: 0 },
        uAudio: { value: 0 }
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    shellFrontMatRef.current = shellFrontMat;

    mainGroup.add(new THREE.Mesh(shellGeo, shellBackMat));
    mainGroup.add(new THREE.Mesh(shellGeo, shellFrontMat));

    // 4. PLASMA (Gas)
    const plasmaGeo = new THREE.SphereGeometry(0.998, 128, 128);
    plasmaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uScale: { value: params.plasmaScale },
        uBrightness: { value: params.plasmaBrightness },
        uThreshold: { value: params.voidThreshold },
        uColorDeep: { value: new THREE.Color(params.colorDeep) },
        uColorMid: { value: new THREE.Color(params.colorMid) },
        uColorBright: { value: new THREE.Color(params.colorBright) },
      },
      vertexShader: `
            uniform float uAudio;
            uniform float uTime;
            varying vec3 vPosition;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            ${noiseFunctions}

            void main() {
                vPosition = position;
                vNormal = normalize(normalMatrix * normal);

                float noise = fbm(position * (3.0 + uAudio * 2.0) + uTime * (0.5 + uAudio * 4.0));
                
                // Extreme disruption effect on the inner plasma
                vec3 newPosition = position + normal * (noise * uAudio * 0.85);

                vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
                vViewPosition = -mvPosition.xyz; 
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
      fragmentShader: `
            uniform float uTime;
            uniform float uAudio;
            uniform float uScale;
            uniform float uBrightness;
            uniform float uThreshold;
            uniform vec3 uColorDeep;
            uniform vec3 uColorMid;
            uniform vec3 uColorBright;

            varying vec3 vPosition;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            
            ${noiseFunctions}

            void main() {
                // When audio is high, the plasma swirls more chaotically
                vec3 p = vPosition * uScale * (1.0 + uAudio * 0.2); 
                
                vec3 q = vec3(
                    fbm(p + vec3(0.0, uTime * 0.05, 0.0)),
                    fbm(p + vec3(5.2, 1.3, 2.8) + uTime * 0.05),
                    fbm(p + vec3(2.2, 8.4, 0.5) - uTime * 0.02)
                );
                
                float density = fbm(p + 2.0 * q);
                float t = (density + 0.4) * 0.8;
                float alpha = smoothstep(uThreshold, 0.7, t);

                vec3 cWhite = vec3(1.0, 1.0, 1.0);
                
                vec3 color = mix(uColorDeep, uColorMid, smoothstep(uThreshold, 0.5, t));
                color = mix(color, uColorBright, smoothstep(0.5, 0.8, t));
                color = mix(color, cWhite, smoothstep(0.8, 1.0, t));

                float facing = dot(normalize(vNormal), normalize(vViewPosition));
                float depthFactor = (facing + 1.0) * 0.5;
                float finalAlpha = alpha * (0.02 + 0.98 * depthFactor);
                
                gl_FragColor = vec4(color * uBrightness, finalAlpha);
            }
        `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    plasmaMatRef.current = plasmaMat;

    const plasmaMesh = new THREE.Mesh(plasmaGeo, plasmaMat);
    mainGroup.add(plasmaMesh);

    // 5. PARTICLES
    const pCount = 600;
    const pPos = new Float32Array(pCount * 3);
    const pSizes = new Float32Array(pCount);
    const sphereRadius = 0.95;

    for (let i = 0; i < pCount; i++) {
      const r = sphereRadius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPos[i * 3 + 2] = r * Math.cos(phi);

      pSizes[i] = Math.random();
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSizes, 1));

    pMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uColor: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
            uniform float uTime;
            uniform float uAudio;
            attribute float aSize;
            varying float vAlpha;
            
            void main() {
                vec3 pos = position;
                // Particles jump based on audio
                pos.y += sin(uTime * 0.2 + pos.x) * (0.02 + uAudio * 0.05);
                pos.x += cos(uTime * 0.15 + pos.z) * (0.02 + uAudio * 0.05);

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                float baseSize = 8.0 * aSize + 4.0;
                gl_PointSize = baseSize * (1.0 / -mvPosition.z) * (1.0 + uAudio * 2.0);
                
                vAlpha = 0.8 + 0.2 * sin(uTime + aSize * 10.0);
            }
        `,
      fragmentShader: `
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
                vec2 uv = gl_PointCoord - vec2(0.5);
                float dist = length(uv);
                if(dist > 0.5) discard;
                
                float glow = 1.0 - (dist * 2.0);
                glow = pow(glow, 1.8);
                
                gl_FragColor = vec4(uColor, glow * vAlpha);
            }
        `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    particles = new THREE.Points(pGeo, pMat);
    mainGroup.add(particles);

    // -----------------------------------
    // MICROPHONE
    // -----------------------------------
    async function setupMicrophone() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setMicError("Microphone is not supported in this browser.");
          return;
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);

        dataArray = new Uint8Array(analyser.frequencyBinCount);

        setMicEnabled(true);
        setMicError("");
      } catch (error) {
        console.error("Mic setup failed:", error);
        setMicEnabled(false);
        setMicError(`Err: ${error.name}`);
      }
    }

    setTimeout(() => {
      setupMicrophone();
    }, 2500);

    // -----------------------------------
    // RESIZE OBSERVER
    // -----------------------------------
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      }
    });

    resizeObserver.observe(container);

    // -----------------------------------
    // ANIMATION LOOP
    // -----------------------------------
    const clock = new THREE.Clock();

    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Audio Logic - SMOOTHER Default
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // We use the new sensitivity ref to get fresh state without remounting
        micLevel = THREE.MathUtils.lerp(micLevel, (average / 255) * sensitivityRef.current, 0.04); 
      } else {
        micLevel = THREE.MathUtils.lerp(micLevel, 0, 0.02);
      }

      const adjustedTime = t * params.timeScale + micLevel * 2.0;

      // Update uniforms for disruption
      if (plasmaMatRef.current) {
        plasmaMatRef.current.uniforms.uTime.value = adjustedTime;
        plasmaMatRef.current.uniforms.uAudio.value = micLevel;
      }
      if (shellFrontMatRef.current) {
        shellFrontMatRef.current.uniforms.uTime.value = adjustedTime;
        shellFrontMatRef.current.uniforms.uAudio.value = micLevel;
      }
      shellBackMat.uniforms.uTime.value = adjustedTime;
      shellBackMat.uniforms.uAudio.value = micLevel;

      pMat.uniforms.uTime.value = t;
      pMat.uniforms.uAudio.value = micLevel;

      // Enlarge smoothly based on mic level
      const scale = 1.0 + micLevel * 1.5;
      mainGroup.scale.set(scale, scale, scale);

      // Rotation speeds up when talking
      plasmaMesh.rotation.y = t * 0.08 + micLevel * 0.3;
      mainGroup.rotation.x += params.rotationSpeedX * (1.0 + micLevel * 2.0);
      mainGroup.rotation.y += params.rotationSpeedY * (1.0 + micLevel * 2.0);

      controls.update();
      renderer.render(scene, camera);
    }

    animate();

    // -----------------------------------
    // CLEANUP
    // -----------------------------------
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);

      controls.dispose();
      renderer.dispose();
      shellGeo.dispose();
      shellBackMat.dispose();
      if (shellFrontMatRef.current) shellFrontMatRef.current.dispose();
      plasmaGeo.dispose();
      if (plasmaMatRef.current) plasmaMatRef.current.dispose();
      pGeo.dispose();
      pMat.dispose();

      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }

      if (audioContext && audioContext.state !== "closed") {
        audioContext.close();
      }

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // Remove sensitivity from dependency array since we use a ref now

  // --- DRAG LOGIC ---
  const handleMouseDown = (e) => {
    if (!isDraggable) return;
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      left: rect.left,
      top: rect.top
    };
    setDragPos({ left: rect.left + "px", top: rect.top + "px" });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setDragPos({
      left: (dragStart.current.left + dx) + "px",
      top: (dragStart.current.top + dy) + "px"
    });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      if (onPositionChange) onPositionChange(dragPos);
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "relative",
        width: size + "px",
        height: size + "px",
        overflow: "visible",
        background: "transparent",
        zIndex: 50,
        pointerEvents: "auto",
        cursor: isDraggable ? (isDragging ? "grabbing" : "grab") : "default",
        border: isDraggable ? "2px dashed #00e5ff" : "none",
        borderRadius: "50%"
      }}
    >
      {isDraggable && (
        <div 
          style={{ position: 'absolute', inset: 0, zIndex: 100 }} 
          onMouseMove={handleMouseMove} 
          onMouseUp={handleMouseUp} 
          onMouseLeave={handleMouseUp}
        />
      )}
      
      <div ref={mountRef} style={{ width: "100%", height: "100%", pointerEvents: isDraggable ? 'none' : 'auto' }} />

      <div
        style={{
          position: "absolute",
          bottom: "-10px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          textAlign: "center",
          pointerEvents: 'none',
          whiteSpace: "nowrap"
        }}
      >
        {micEnabled ? (
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "4px",
              backgroundColor: "rgba(0, 229, 255, 0.05)",
              color: "#00e5ff",
              backdropFilter: "blur(12px)",
              fontSize: "0.8rem",
              fontFamily: "'Orbitron', sans-serif",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              border: "1px solid rgba(0, 229, 255, 0.3)",
              boxShadow: "0 0 10px rgba(0, 229, 255, 0.1)"
            }}
          >
            MIC_CONNECTED
          </div>
        ) : (
          <div
            style={{
              padding: "6px 14px",
              borderRadius: "4px",
              backgroundColor: "rgba(255, 0, 85, 0.05)",
              color: "#ff0055",
              backdropFilter: "blur(12px)",
              fontSize: "0.8rem",
              fontFamily: "'Orbitron', sans-serif",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              border: "1px solid rgba(255, 0, 85, 0.3)",
              boxShadow: "0 0 10px rgba(255, 0, 85, 0.1)",
              maxWidth: "250px",
              cursor: "pointer"
            }}
          >
            {micError ? `ERROR: ${micError.toUpperCase()}` : "WAITING FOR MIC..."}
          </div>
        )}
      </div>
    </div>
  );
}
