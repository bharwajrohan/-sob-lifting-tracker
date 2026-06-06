import React, { useEffect, useRef, useState } from 'react';
import './Logo.css';

export const Logo = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [stars, setStars] = useState<any[]>([]);

  useEffect(() => {
    const newStars = [];
    for(let i=0;i<90;i++){
      const sz=Math.random()*2.5+.5;
      newStars.push({
        id: i,
        style: {
          width: `${sz}px`,
          height: `${sz}px`,
          top: `${Math.random()*100}%`,
          left: `${Math.random()*100}%`,
          animationDelay: `${Math.random()*2}s`,
          animationDuration: `${1+Math.random()*2}s`
        }
      });
    }
    setStars(newStars);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const trailEl = trailRef.current;
    const flashEl = flashRef.current;
    const badgeEl = badgeRef.current;

    const CARS = ['#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa','#00acc1','#d81b60','#f4511e'];

    function roundRect(x: number,y: number,w: number,h: number,r: number){
      ctx!.beginPath();
      ctx!.moveTo(x+r,y); ctx!.lineTo(x+w-r,y); ctx!.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx!.lineTo(x+w,y+h-r); ctx!.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx!.lineTo(x+r,y+h); ctx!.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx!.lineTo(x,y+r); ctx!.quadraticCurveTo(x,y,x+r,y); ctx!.closePath();
    }

    function wheel(x: number,y: number,r: number){
      ctx!.beginPath(); ctx!.arc(x,y,r,0,Math.PI*2);
      ctx!.fillStyle='#111'; ctx!.fill();
      ctx!.strokeStyle='#3a3a3a'; ctx!.lineWidth=1.2; ctx!.stroke();
      ctx!.beginPath(); ctx!.arc(x,y,r*.42,0,Math.PI*2);
      ctx!.fillStyle='#222'; ctx!.fill();
      ctx!.strokeStyle='#555'; ctx!.lineWidth=.8; ctx!.stroke();
    }

    function miniCar(x: number,y: number,w: number,h: number,ci: number){
      ctx!.fillStyle=CARS[ci%CARS.length];
      roundRect(x,y,w,h,2); ctx!.fill();
      ctx!.strokeStyle='rgba(255,255,255,0.2)'; ctx!.lineWidth=.5; ctx!.stroke();
    }

    function drawTruck(alpha: number){
      ctx!.save(); ctx!.globalAlpha=alpha;
      // Trailer
      ctx!.fillStyle='#1a3a5c'; roundRect(0,20,110,30,3); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.2; ctx!.stroke();
      // Top deck cars
      miniCar(4,10,26,14,0); miniCar(36,10,26,14,1); miniCar(68,10,26,14,2);
      // Bottom deck cars
      miniCar(6,33,24,11,3); miniCar(34,33,24,11,4); miniCar(62,33,24,11,5);
      // Cab
      ctx!.fillStyle='#0d2744'; roundRect(110,16,44,32,4); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.5; ctx!.stroke();
      // Windshield
      ctx!.globalAlpha=alpha*.75;
      ctx!.fillStyle='#1a4a6a'; roundRect(122,19,24,14,2); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=.7; ctx!.stroke();
      ctx!.globalAlpha=alpha;
      // Exhaust
      ctx!.fillStyle='#444'; roundRect(147,8,5,12,1); ctx!.fill();
      ctx!.fillStyle='rgba(180,200,220,0.25)';
      ctx!.beginPath(); ctx!.arc(149,6,4,0,Math.PI*2); ctx!.fill();
      ctx!.beginPath(); ctx!.arc(152,3,2.5,0,Math.PI*2); ctx!.fill();
      // Wheels
      wheel(20,52,7); wheel(60,52,7); wheel(92,52,7); wheel(126,52,8); wheel(145,52,8);
      // Headlight
      ctx!.fillStyle='#ffe082'; ctx!.beginPath(); ctx!.arc(153,30,3,0,Math.PI*2); ctx!.fill();
      ctx!.globalAlpha=alpha*.35; ctx!.strokeStyle='#ffe082'; ctx!.lineWidth=1.2;
      ctx!.beginPath(); ctx!.moveTo(153,30); ctx!.lineTo(164,25); ctx!.stroke();
      ctx!.beginPath(); ctx!.moveTo(153,30); ctx!.lineTo(164,35); ctx!.stroke();
      ctx!.restore();
    }

    function drawTrain(alpha: number){
      ctx!.save(); ctx!.globalAlpha=alpha;
      // Wagon 1
      ctx!.fillStyle='#1a3a5c'; roundRect(0,18,42,30,3); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.1; ctx!.stroke();
      miniCar(4,33,17,10,0); miniCar(24,33,14,10,1);
      ctx!.fillStyle='rgba(0,212,255,0.1)'; roundRect(3,20,36,11,2); ctx!.fill();
      ctx!.fillStyle='#00d4ff'; ctx!.font='5px monospace';
      ctx!.globalAlpha=alpha*.45; ctx!.fillText('CARGO',5,28); ctx!.globalAlpha=alpha;
      ctx!.fillStyle='#555'; ctx!.beginPath(); ctx!.arc(42,34,3,0,Math.PI*2); ctx!.fill();
      // Wagon 2
      ctx!.fillStyle='#1a3a5c'; roundRect(45,18,42,30,3); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.1; ctx!.stroke();
      miniCar(49,33,17,10,2); miniCar(69,33,14,10,3);
      ctx!.fillStyle='rgba(0,212,255,0.1)'; roundRect(48,20,36,11,2); ctx!.fill();
      ctx!.fillStyle='#555'; ctx!.beginPath(); ctx!.arc(87,34,3,0,Math.PI*2); ctx!.fill();
      // Locomotive
      ctx!.fillStyle='#0d2744'; roundRect(90,12,66,35,5); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.8; ctx!.stroke();
      ctx!.globalAlpha=alpha*.75;
      ctx!.fillStyle='#1a4a6a'; roundRect(118,16,26,18,2); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=.7; ctx!.stroke();
      ctx!.globalAlpha=alpha;
      // Chimney + smoke
      ctx!.fillStyle='#444'; roundRect(93,4,8,11,2); ctx!.fill();
      ctx!.fillStyle='rgba(180,200,220,0.28)';
      ctx!.beginPath(); ctx!.arc(97,2,5,0,Math.PI*2); ctx!.fill();
      ctx!.beginPath(); ctx!.arc(100,-1,3,0,Math.PI*2); ctx!.fill();
      // Headlight
      ctx!.fillStyle='#ffe082'; ctx!.beginPath(); ctx!.arc(154,28,5,0,Math.PI*2); ctx!.fill();
      ctx!.globalAlpha=alpha*.3; ctx!.strokeStyle='#ffe082'; ctx!.lineWidth=1.2;
      ctx!.beginPath(); ctx!.moveTo(154,28); ctx!.lineTo(166,22); ctx!.stroke();
      ctx!.beginPath(); ctx!.moveTo(154,28); ctx!.lineTo(166,34); ctx!.stroke();
      ctx!.globalAlpha=alpha;
      // Wheels
      wheel(18,50,6); wheel(65,50,6); wheel(108,52,8); wheel(126,52,8); wheel(145,52,8);
      ctx!.restore();
    }

    function drawShip(alpha: number){
      ctx!.save(); ctx!.globalAlpha=alpha;
      // Hull
      ctx!.fillStyle='#0d2744';
      ctx!.beginPath();
      ctx!.moveTo(10,40); ctx!.bezierCurveTo(6,58,78,64,90,64);
      ctx!.bezierCurveTo(102,64,168,58,165,40);
      ctx!.lineTo(155,36); ctx!.lineTo(18,36); ctx!.closePath();
      ctx!.fill(); ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.5; ctx!.stroke();
      // Deck body
      ctx!.fillStyle='#1a3a5c'; roundRect(16,14,140,24,4); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.2; ctx!.stroke();
      // Cars row 1
      miniCar(20,16,22,9,0); miniCar(46,16,22,9,1); miniCar(72,16,22,9,2);
      miniCar(98,16,22,9,3); miniCar(124,16,22,9,4);
      // Cars row 2
      miniCar(22,27,20,8,5); miniCar(48,27,20,8,6); miniCar(74,27,20,8,7); miniCar(100,27,20,8,0);
      // Bridge
      ctx!.fillStyle='#0a1f3d'; roundRect(116,3,40,14,3); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.2; ctx!.stroke();
      ctx!.globalAlpha=alpha*.65;
      ctx!.fillStyle='#1a4a6a'; roundRect(120,5,12,7,1); ctx!.fill();
      ctx!.globalAlpha=alpha;
      // Funnel + smoke
      ctx!.fillStyle='#0a1f3d'; roundRect(104,4,12,14,2); ctx!.fill();
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1; ctx!.stroke();
      ctx!.fillStyle='rgba(180,200,220,0.28)';
      ctx!.beginPath(); ctx!.arc(110,2,5,0,Math.PI*2); ctx!.fill();
      ctx!.beginPath(); ctx!.arc(113,-1,3,0,Math.PI*2); ctx!.fill();
      // Mast
      ctx!.strokeStyle='#00d4ff'; ctx!.lineWidth=1.2;
      ctx!.beginPath(); ctx!.moveTo(136,3); ctx!.lineTo(136,-5); ctx!.stroke();
      ctx!.beginPath(); ctx!.moveTo(128,-1); ctx!.lineTo(144,-1); ctx!.stroke();
      // Water ripple
      for(let i=0;i<3;i++){
        ctx!.beginPath();
        ctx!.ellipse(88,65+i*3,60-i*8,2.5-i*.4,0,0,Math.PI*2);
        ctx!.strokeStyle='rgba(0,180,255,0.3)';
        ctx!.globalAlpha=alpha*(0.35-i*.09); ctx!.lineWidth=1; ctx!.stroke();
      }
      ctx!.restore();
    }

    // Journey config
    const SCENE_W = 740;
    const V_W = 180;
    const START_X = 22;
    const END_X = SCENE_W - V_W - 22;
    const DURATION = 9000; // ms for one full pass

    const BLEND = 0.07;
    const t01s = 0.33 - BLEND, t01e = 0.33 + BLEND;
    const t12s = 0.66 - BLEND, t12e = 0.66 + BLEND;
    const tEnd = 1 - BLEND;

    const ZONES = ['Road Carrier','Rail Transit','Sea Freight'];
    let lastZone = -1;
    let startTs: number | null = null;
    let animationFrameId: number;

    function render(ts: number){
      if(!startTs) startTs = ts;
      const p = ((ts - startTs) % DURATION) / DURATION;

      const x = START_X + p * (END_X - START_X);
      if (canvas) canvas.style.transform = `translateX(${x}px)`;
      if (trailEl) trailEl.style.width = Math.max(0, x - START_X + V_W * 0.55) + 'px';

      let tA=0, rA=0, sA=0;

      if(p < t01s){
        tA=1;
      } else if(p < t01e){
        const b=(p-t01s)/(t01e-t01s);
        tA=1-b; rA=b;
      } else if(p < t12s){
        rA=1;
      } else if(p < t12e){
        const b=(p-t12s)/(t12e-t12s);
        rA=1-b; sA=b;
      } else if(p < tEnd){
        sA=1;
      } else {
        const b=(p-tEnd)/BLEND;
        sA=1-b; tA=b;
      }

      ctx!.clearRect(0,0,180,80);
      if(sA>0.01) drawShip(sA);
      if(rA>0.01) drawTrain(rA);
      if(tA>0.01) drawTruck(tA);

      const zone = p<0.33?0:p<0.66?1:2;
      if(zone !== lastZone){
        lastZone = zone;
        if (badgeEl) {
          badgeEl.style.animation='none';
          badgeEl.textContent = ZONES[zone];
          void badgeEl.offsetWidth;
          badgeEl.style.animation='badgePop .6s ease forwards';
        }
        if (flashEl) {
          flashEl.style.opacity='1';
          setTimeout(()=>{ if (flashEl) flashEl.style.opacity='0'; }, 260);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    }

    const timeoutId = setTimeout(()=>{
      if (canvas) canvas.style.transform = `translateX(${START_X}px)`;
      animationFrameId = requestAnimationFrame(render);
    }, 2200);

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="logo-container">
      <div className="logo-stars">
        {stars.map((star) => (
          <div key={star.id} className="logo-star" style={star.style}></div>
        ))}
      </div>

      <div className="logo-wrapper">
        <div className="stpl-title">
          <span>S</span><span>T</span><span>P</span><span>L</span>
        </div>
        <div className="logo-subtitle">Sushila Transport Pvt. Ltd.</div>

        <div className="scene-frame">
          <div className="corner c-tl"></div>
          <div className="corner c-tr"></div>
          <div className="corner c-bl"></div>
          <div className="corner c-br"></div>
          <div className="morph-flash" ref={flashRef}></div>
          <div className="mode-badge" ref={badgeRef}>Road Carrier</div>

          <div className="scene">
            <div className="zone-divider div-1"></div>
            <div className="zone-divider div-2"></div>
            <div className="zone-labels">
              <div className="zone-label">Road</div>
              <div className="zone-label">Rail</div>
              <div className="zone-label">Sea</div>
            </div>

            <div className="ground">
              <div className="road-zone">
                <div className="road-dash"></div><div className="road-dash"></div><div className="road-dash"></div>
              </div>
              <div className="rail-zone">
                <div className="rail-top"></div><div className="rail-bot"></div>
                <div className="sleeper" style={{left: '0%', animationDelay: '0s'}}></div>
                <div className="sleeper" style={{left: '14%', animationDelay: '-.063s'}}></div>
                <div className="sleeper" style={{left: '28%', animationDelay: '-.126s'}}></div>
                <div className="sleeper" style={{left: '42%', animationDelay: '-.189s'}}></div>
                <div className="sleeper" style={{left: '56%', animationDelay: '-.252s'}}></div>
                <div className="sleeper" style={{left: '70%', animationDelay: '-.315s'}}></div>
                <div className="sleeper" style={{left: '84%', animationDelay: '-.378s'}}></div>
              </div>
              <div className="sea-zone">
                <div className="sea-wave"></div><div className="sea-wave"></div><div className="sea-wave"></div>
              </div>
            </div>

            <div className="trail" ref={trailRef}></div>
            <canvas className="vehicle-canvas" ref={canvasRef} width="180" height="80"></canvas>

            <div className="pin orig">
              <div className="pin-txt">Origin</div>
              <div className="pin-line"></div>
              <div className="pin-dot"></div>
            </div>
            <div className="pin dest">
              <div className="pin-txt">Destination</div>
              <div className="pin-line"></div>
              <div className="pin-dot"></div>
            </div>
          </div>
        </div>

        <div className="safe-tag">✦ Trust Me — It's Safe Delivery ✦</div>
      </div>
    </div>
  );
};
