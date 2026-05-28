(function(){
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const gameContainer = document.getElementById('game-container');
  const openingScreen = document.getElementById('openingScreen');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const highScoreTextEl = document.getElementById('highScoreText');
  const W = 800, H = 400; canvas.width = W; canvas.height = H;

  let highScore = parseInt(localStorage.getItem('luck_highScore') || '0', 10) || 0;
  highScoreTextEl.textContent = 'High Score: ' + highScore;

  function rand(min,max){ return Math.random()*(max-min)+min }
  // last input timestamp to avoid duplicate touch/pointer events
  let __luck_lastInputMs = 0;

  // Background building layers (parallax)
  function makeBuilding(w, h, y){
    return { x:0, w:w, h:h, y:y, windows:[] };
  }

  class Player{
    constructor(){
      this.x=80; this.y=H-60; this.w=36; this.h=48; this.vy=0; this.jumpPower=-12; this.g=0.6; this.ground=H-12; this.onGround=true; this.coyote=0; this.itemType = null;
      // legacy counters
      this.maxJumps = 1; this.jumpsLeft = 1;
      // more robust double-jump flags
      this.doubleJumpEnabled = false; this.usedDoubleJump = false;
    }
    update(){
      // coyote time counter
      if(this.onGround){
        this.coyote = 8;
        this.jumpsLeft = this.maxJumps;
        // reset double jump usage when touching ground
        this.usedDoubleJump = false;
      } else if(this.coyote>0) this.coyote--;
      this.vy += this.g; this.y += this.vy; if(this.y+this.h>this.ground){ this.y=this.ground-this.h; this.vy=0; this.onGround=true; this.jumpsLeft = this.maxJumps } else { this.onGround=false }
    }
    jump(){
      // primary jump from ground or coyote time
      if(this.onGround || this.coyote>0){
        this.vy=this.jumpPower; this.onGround=false; this.coyote=0; this.jumpsLeft = Math.max(0, this.jumpsLeft-1);
        // usedDoubleJump reset on primary jump (allow a follow-up double jump if enabled)
        this.usedDoubleJump = false;
        return;
      }
      // if double-jump enabled and not yet used, allow a mid-air jump
      if(this.doubleJumpEnabled && !this.usedDoubleJump){
        this.vy=this.jumpPower; this.usedDoubleJump = true; return;
      }
      // fallback: legacy jumpsLeft support
      if(this.jumpsLeft > 0){ this.vy=this.jumpPower; this.jumpsLeft = Math.max(0, this.jumpsLeft-1); }
    }
    draw(ctx){
      // draw player image if available
      if(typeof playerImgLoaded !== 'undefined' && playerImgLoaded && !playerImgBroken && playerImg.naturalWidth>0 && playerImg.naturalHeight>0){
        try{ ctx.drawImage(playerImg, this.x - 8, this.y - 8, this.w+16, this.h+16); }catch(e){
          // fallback rectangle
          ctx.fillStyle='#ffda77'; ctx.fillRect(this.x,this.y,this.w,this.h);
          ctx.fillStyle='#000'; ctx.fillRect(this.x+22,this.y+12,6,6);
        }
      }else{
        ctx.fillStyle='#ffda77'; ctx.fillRect(this.x,this.y,this.w,this.h);
        ctx.fillStyle='#000'; ctx.fillRect(this.x+22,this.y+12,6,6);
      }
      // draw shield indicator if player has item
      if(this.hasItem){ ctx.strokeStyle='#ffd965'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(this.x+this.w/2, this.y+this.h/2, Math.max(this.w,this.h), 0, Math.PI*2); ctx.stroke(); }
    }
    getBox(){ return {x:this.x,y:this.y,w:this.w,h:this.h} }
  }

  class Obstacle{
    constructor(x,w,h,spd,imgIndex){ this.x=x; this.w=w; this.h=h; this.y=H-12-h; this.spd=spd; this.imgIndex = typeof imgIndex === 'number' ? imgIndex : 0 }
    update(){ this.x -= this.spd }
    draw(ctx){
      // try draw image for this obstacle type if loaded
      const idx = this.imgIndex || 0;
      if(typeof obstacleImgLoaded !== 'undefined' && obstacleImgs[idx] && obstacleImgLoaded[idx] && !obstacleImgBroken[idx] && obstacleImgs[idx].naturalWidth>0 && obstacleImgs[idx].naturalHeight>0){
        try{
          // compute draw width based on image aspect ratio; make police car (idx==1) wider
          const ratio = obstacleImgs[idx].naturalWidth / obstacleImgs[idx].naturalHeight;
          let drawH = this.h;
          let drawW = Math.max(this.w, Math.round(drawH * ratio * (idx===1 ? 0.85 : 1)));
          // center the image over the logical obstacle x if drawW larger
          const drawX = this.x - Math.max(0, Math.round((drawW - this.w)/2));
          ctx.drawImage(obstacleImgs[idx], drawX, this.y, drawW, drawH);
          return;
        }catch(e){ console.warn('obstacle drawImage failed', e); }
      }
      ctx.fillStyle='#556b2f'; ctx.fillRect(this.x,this.y,this.w,this.h)
    }
    offscreen(){ return this.x + this.w < 0 }
    getBox(){
      const idx = this.imgIndex || 0;
      if(typeof obstacleImgs !== 'undefined' && obstacleImgs[idx] && obstacleImgLoaded[idx] && !obstacleImgBroken[idx] && obstacleImgs[idx].naturalWidth>0 && obstacleImgs[idx].naturalHeight>0){
        const ratio = obstacleImgs[idx].naturalWidth / obstacleImgs[idx].naturalHeight;
        const drawH = this.h;
        const drawW = Math.max(this.w, Math.round(drawH * ratio * (idx===1 ? 0.9 : 1)));
        const drawX = this.x - Math.max(0, Math.round((drawW - this.w)/2));
        return { x: drawX, y: this.y, w: drawW, h: drawH };
      }
      return {x:this.x,y:this.y,w:this.w,h:this.h}
    }
  }

  class Item{
    constructor(x,size,spd,type=0){ this.x=x; this.y=H-12-size-10; this.w=size; this.h=size; this.spd=spd; this.picked=false; this.type = typeof type === 'number' ? type : 0 }
    update(){ this.x -= this.spd }
    draw(ctx){
      // draw image only if it successfully loaded and is not broken
      const idx = this.type || 0;
      if(typeof itemImgLoaded !== 'undefined' && itemImgLoaded[idx] && !itemImgBroken[idx] && itemImgs[idx].naturalWidth > 0 && itemImgs[idx].naturalHeight > 0){
        try{ ctx.drawImage(itemImgs[idx], this.x, this.y, this.w, this.h); }catch(e){
          console.warn('drawImage failed, falling back to rectangle', e);
          ctx.fillStyle='#ffd965'; ctx.fillRect(this.x,this.y,this.w,this.h);
        }
      } else {
        ctx.fillStyle='#ffd965'; ctx.fillRect(this.x,this.y,this.w,this.h);
      }
    }
    offscreen(){ return this.x + this.w < 0 }
    getBox(){ return {x:this.x,y:this.y,w:this.w,h:this.h} }
  }

  function collide(a,b){ return !(a.x+a.w < b.x || a.x > b.x+b.w || a.y+a.h < b.y || a.y > b.y+b.h) }

  class Game{
    constructor(){ this.reset() }
    reset(){
      try{ stopDubLayer(); }catch(e){}
      try{ stopBGM(true); }catch(e){}
      try{ if(this._itemTimer){ clearTimeout(this._itemTimer); delete this._itemTimer; } }catch(e){}
      try{ if(this._origSpeed !== undefined){ delete this._origSpeed; } }catch(e){}
      try{ if(this._origBgmBpm !== undefined){ delete this._origBgmBpm; } }catch(e){}
      try{ this.player = new Player(); this.player.itemType = null; }catch(e){ this.player = new Player(); }
      this.obstacles=[]; this.items=[]; this.spawnTimer=0; this.itemTimer=0; this.spawnInterval=90; this.frame=0; this.speed=4; this.score=0; this.running=false; this.gameOver=false;
      try{ bgmBpm = 170; bgmTransportStartMs = Date.now(); }catch(e){}
      try{ if(openingScreen) openingScreen.style.display = ''; if(restartBtn) restartBtn.style.display = 'none'; }catch(e){}
      // create parallax building layers: back, mid, front
      this.layers = [ {factor:0.25, color:'#0c2740', buildings:[]}, {factor:0.5, color:'#102a48', buildings:[]}, {factor:0.9, color:'#122d52', buildings:[]} ];
      for(let li of this.layers){
        let x = 0;
        while(x < W*2){
          const bw = Math.floor(rand(40,140));
          const bh = Math.floor(rand(60, H/2 - 40));
          const b = { x:x, w:bw, h:bh, y: H-12-bh, windows:[] };
          // windows
          const cols = Math.floor(bw/12);
          const rows = Math.floor(bh/14);
          for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) if(Math.random() < 0.25) b.windows.push({ox: 4 + c*12, oy: 4 + r*14, w:6, h:8, on: Math.random() > 0.7, timer: Math.floor(rand(30,200))});
          li.buildings.push(b);
          x += bw + Math.floor(rand(10,40));
        }
      }
    }
    applyItemEffect(type){
      // clear any previous effect
      try{ if(this._itemTimer) clearTimeout(this._itemTimer); }catch(e){}
      const DURATION = 8000; // ms
      if(type === 0){
        // shield/protect
        // only reset audio if we are actually leaving leaf/quick mode
        const hadAudioEffect = this.player.itemType === 1 || this.player.itemType === 2;
        this.clearItemEffect({audio: hadAudioEffect});
        this.player.itemType = 0;
      } else if(type === 1){
        // reset any prior temporary changes
        this.clearItemEffect({audio:true});
        this.player.itemType = 1;
        // leaf: slow down
        this._origSpeed = this.speed;
        this.speed = Math.max(1.5, this.speed * 0.6);
        // layer a dub sound while leaf is active
        try{ startDubLayer(); }catch(e){}
        // schedule clear
        this._itemTimer = setTimeout(()=>{ this.clearItemEffect(); }, DURATION);
      } else if(type === 2){
        // reset any prior temporary changes
        this.clearItemEffect({audio:true});
        this.player.itemType = 2;
        // quick: enable double-jump and stronger jump
        try{ console.log('[luck] applyItemEffect quick -> enabling double jump'); }catch(e){}
        this.player.maxJumps = 2;
        this.player.jumpsLeft = 2;
        this.player.doubleJumpEnabled = true;
        this.player.usedDoubleJump = false;
        this.player.jumpPower = -14;
        // increase BPM while quick is active
        try{ this._origBgmBpm = typeof bgmBpm !== 'undefined' ? bgmBpm : 170; setBpm(Math.round(this._origBgmBpm * 1.25)); }catch(e){}
        this._itemTimer = setTimeout(()=>{ this.clearItemEffect(); }, DURATION);
      }
    }
    clearItemEffect(opts={audio:true}){
      // revert leaf slow
      try{
        if(this._origSpeed !== undefined){ this.speed = this._origSpeed; delete this._origSpeed; }
      }catch(e){}
      // revert jump changes
      try{ this.player.maxJumps = 1; this.player.jumpsLeft = 1; this.player.jumpPower = -12; this.player.itemType = null; this.player.doubleJumpEnabled = false; this.player.usedDoubleJump = false; }catch(e){}
      if(opts.audio !== false){
        try{ stopDubLayer(); }catch(e){}
        try{ if(this._origBgmBpm !== undefined){ setBpm(this._origBgmBpm); delete this._origBgmBpm; } }catch(e){}
      }
      try{ if(this._itemTimer){ clearTimeout(this._itemTimer); delete this._itemTimer; } }catch(e){}
    }
    start(){ this.reset(); this.running=true; this.gameOver=false; startBtn.textContent='Playing'; try{ gameContainer.classList.add('game-running'); gameContainer.classList.remove('game-over'); if(openingScreen) openingScreen.style.display = 'none'; if(restartBtn) restartBtn.style.display = 'none'; }catch(e){} try{ startBGM(); }catch(e){} loop() }
    update(){
      if(!this.running) return;
      this.player.update();
      this.spawnTimer++;
      if(this.spawnTimer>=this.spawnInterval){
        this.spawnTimer=0;
        // choose an obstacle image index randomly
        const imgIdx = Math.random() < 0.5 ? 0 : 1;
        // set spawn size based on type: police car (idx=1) slightly smaller now
        let w,h;
        if(imgIdx === 1){
          // police car: slightly smaller width and height (reduced)
          h = Math.floor(rand(22,36));
          w = Math.floor(rand(50,90));
        } else {
          h = Math.floor(rand(24,80));
          w = Math.floor(rand(18,40));
        }
        this.obstacles.push(new Obstacle(W+20,w,h,this.speed,imgIdx));
        if(this.spawnInterval>50) this.spawnInterval--;
        this.speed+=0.02;
      }
      // move background layers (parallax)
      for(let li of this.layers){
        const move = this.speed * li.factor;
        for(let b of li.buildings){
          b.x -= move;
          // update window timers for slight flicker (per-window)
          for(let w of b.windows){
            w.timer -= 1;
            if(w.timer <= 0){ w.on = !w.on; w.timer = Math.floor(rand(30,200)); }
          }
        }
        // recycle buildings that moved offscreen
        const first = li.buildings[0];
        if(first && first.x + first.w < 0){
          // remove and append new building to the end
          li.buildings.shift();
          const last = li.buildings[li.buildings.length-1];
          const bw = Math.floor(rand(40,140));
          const bh = Math.floor(rand(60, H/2 - 40));
          const nx = last ? last.x + last.w + Math.floor(rand(10,40)) : W + Math.floor(rand(20,60));
          const b = { x:nx, w:bw, h:bh, y: H-12-bh, windows:[] };
          const cols = Math.floor(bw/12); const rows = Math.floor(bh/14);
          for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) if(Math.random() < 0.25) b.windows.push({ox: 4 + c*12, oy: 4 + r*14, w:6, h:8, on: Math.random() > 0.7, timer: Math.floor(rand(30,200))});
          li.buildings.push(b);
        }
      }

      for(let ob of this.obstacles) ob.update();
      // items
      this.itemTimer++;
      if(this.itemTimer > 240){
        // small chance to spawn an item every few seconds
        if(Math.random() < 0.6){
          const size = Math.floor(rand(28,44));
          // choose item type: weighted random 0 (shield) 60%, 1 (leaf) 25%, 2 (quick) 15%
          const r = Math.random();
          const itType = r < 0.6 ? 0 : (r < 0.85 ? 1 : 2);
          this.items.push(new Item(W+20,size,this.speed,itType));
        }
        this.itemTimer = 0;
      }
      for(let it of (this.items||[])) it.update();
      this.items = (this.items||[]).filter(i=>!i.offscreen() && !i.picked);
      this.obstacles = this.obstacles.filter(o=>!o.offscreen());
      // check item pickups first
      for(let it of this.items){
        if(collide(this.player.getBox(), it.getBox())){
          it.picked = true;
          // apply item effect depending on type: 0 shield, 1 leaf (slow), 2 quick (double-jump)
          this.applyItemEffect(it.type || 0);
        }
      }

      for(let ob of this.obstacles){
        if(collide(this.player.getBox(),ob.getBox())){
          if(this.player.itemType === 0){
            // shield: consume item effect, remove obstacle and prevent death
            this.clearItemEffect();
            ob.x = -9999;
            continue;
          }
          this.running=false; this.gameOver=true;
          try{ gameContainer.classList.remove('game-running'); gameContainer.classList.add('game-over'); if(openingScreen) openingScreen.style.display = 'none'; if(restartBtn) restartBtn.style.display = 'block'; }catch(e){}
          try{ stopBGM(); }catch(e){}
          // update high score
          if(this.score > highScore){ highScore = this.score; localStorage.setItem('luck_highScore', String(highScore)); highScoreTextEl.textContent = 'High Score: ' + highScore }
        }
      }
      this.frame++; if(this.frame%6===0) this.score+=1;
    }
    draw(ctx){
      // sky gradient
      const sky = ctx.createLinearGradient(0,0,0,H);
      sky.addColorStop(0,'#07112a'); sky.addColorStop(1,'#061023');
      ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);

      // title / splash: if game not started yet, show splash image and skip game drawing
      if(!this.running && !this.gameOver){
        if(typeof splashImgLoaded !== 'undefined' && splashImgLoaded && !splashImgBroken && splashImg.naturalWidth>0 && splashImg.naturalHeight>0){
          const maxW = W * 0.78;
          const maxH = H * 0.6;
          const ratio = splashImg.naturalWidth / splashImg.naturalHeight;
          let drawW = maxW;
          let drawH = drawW / ratio;
          if(drawH > maxH){ drawH = maxH; drawW = drawH * ratio; }
          const x = (W - drawW) / 2;
          const y = (H - drawH) / 2 - 20;
          try{ ctx.drawImage(splashImg, x, y, drawW, drawH); }catch(e){ console.warn('splash draw failed', e); }
        } else {
          // fallback box with title
          ctx.fillStyle = '#6a1b9a'; ctx.fillRect(W*0.12, H*0.18, W*0.76, H*0.64);
          ctx.fillStyle = '#fff'; ctx.font = '36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('luck', W/2, H/2);
        }
        return;
      }
      // debug overlay: show jump state (helps diagnose mobile quick/double-jump issues)
      try{
        const dbg = `maxJumps:${this.player.maxJumps} jumpsLeft:${this.player.jumpsLeft} dbl:${this.player.doubleJumpEnabled?1:0} used:${this.player.usedDoubleJump?1:0} item:${String(this.player.itemType)}`;
        ctx.font = '12px system-ui,Segoe UI,Roboto';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const tw = ctx.measureText(dbg).width;
        ctx.fillRect(W - tw - 12, 8, tw + 8, 18);
        ctx.fillStyle = '#000';
        ctx.fillText(dbg, W - tw - 8, 22);
      }catch(e){}

      // moon
      ctx.beginPath(); ctx.fillStyle = '#f5f3d7'; ctx.arc(W-120,80,28,0,Math.PI*2); ctx.fill();

      // heartbeat indicator synced to BPM
      try{
        const pulse = getBeatPulse();
        drawHeartbeat(ctx, 42, 38, 26, pulse);
        drawHeldItemSlot(ctx, 78, 34, 42, this.player && this.player.itemType);
      }catch(e){}

      // layers
      for(let li of this.layers){
        for(let b of li.buildings){
          // building rect
          ctx.fillStyle = li.color; ctx.fillRect(Math.floor(b.x), Math.floor(b.y), b.w, b.h);
          // windows
          for(let w of b.windows){
            // use per-window state for stable flicker
            ctx.fillStyle = w.on ? '#ffd965' : '#22343f';
            ctx.fillRect(Math.floor(b.x + w.ox), Math.floor(b.y + w.oy), w.w, w.h);
          }
        }
      }

      // ground
      ctx.fillStyle='#1d5a2d'; ctx.fillRect(0,H-12,W,12);

      // game objects
      this.player.draw(ctx);
      // draw items
      for(let it of (this.items||[])) it.draw(ctx);
      for(let ob of this.obstacles) ob.draw(ctx);

      if(this.gameOver){ ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.font='36px sans-serif'; ctx.textAlign='center'; ctx.fillText('Game Over', W/2, H/2 - 10) }
    }
  }

  let game = new Game();
  // preload item images (support item.png, item2.png, item3.png)
  const itemImgs = [ new Image(), new Image(), new Image() ];
  const itemImgLoaded = [false, false, false];
  const itemImgBroken = [false, false, false];
  itemImgs[0].onload = function(){ itemImgLoaded[0] = true; itemImgBroken[0] = !(itemImgs[0].naturalWidth>0 && itemImgs[0].naturalHeight>0); if(itemImgBroken[0]) console.warn('item.png loaded but has zero size'); };
  itemImgs[0].onerror = function(e){ if(itemImgs[0].src && itemImgs[0].src.endsWith('item.png')){ console.warn('item.png failed to load; trying item.PNG'); itemImgs[0].src = 'item.PNG'; return; } itemImgBroken[0] = true; console.warn('Failed to load item image 0', e); };
  itemImgs[1].onload = function(){ itemImgLoaded[1] = true; itemImgBroken[1] = !(itemImgs[1].naturalWidth>0 && itemImgs[1].naturalHeight>0); if(itemImgBroken[1]) console.warn('item2.png loaded but zero size'); };
  itemImgs[1].onerror = function(e){ if(itemImgs[1].src && itemImgs[1].src.endsWith('item2.png')){ console.warn('item2.png failed to load; trying item2.PNG'); itemImgs[1].src = 'item2.PNG'; return; } itemImgBroken[1] = true; console.warn('Failed to load item image 1', e); };
  itemImgs[2].onload = function(){ itemImgLoaded[2] = true; itemImgBroken[2] = !(itemImgs[2].naturalWidth>0 && itemImgs[2].naturalHeight>0); if(itemImgBroken[2]) console.warn('item3.png loaded but zero size'); };
  itemImgs[2].onerror = function(e){ if(itemImgs[2].src && itemImgs[2].src.endsWith('item3.png')){ console.warn('item3.png failed to load; trying item3.PNG'); itemImgs[2].src = 'item3.PNG'; return; } itemImgBroken[2] = true; console.warn('Failed to load item image 2', e); };
  itemImgs[0].src = 'item.png';
  itemImgs[1].src = 'item2.png';
  itemImgs[2].src = 'item3.png';
  // preload obstacle images
  const obstacleImgs = [ new Image(), new Image() ];
  const obstacleImgLoaded = [false, false];
  const obstacleImgBroken = [false, false];
  obstacleImgs[0].onload = function(){ obstacleImgLoaded[0]=true; obstacleImgBroken[0]= !(obstacleImgs[0].naturalWidth>0 && obstacleImgs[0].naturalHeight>0); if(obstacleImgBroken[0]) console.warn('obstacle1 loaded but zero size'); };
  obstacleImgs[0].onerror = function(e){ if(obstacleImgs[0].src && obstacleImgs[0].src.endsWith('obstacle1.png')){ obstacleImgs[0].src='obstacle1.PNG'; return; } obstacleImgBroken[0]=true; console.warn('Failed load obstacle1', e); };
  obstacleImgs[1].onload = function(){ obstacleImgLoaded[1]=true; obstacleImgBroken[1]= !(obstacleImgs[1].naturalWidth>0 && obstacleImgs[1].naturalHeight>0); if(obstacleImgBroken[1]) console.warn('obstacle2 loaded but zero size'); };
  obstacleImgs[1].onerror = function(e){ if(obstacleImgs[1].src && obstacleImgs[1].src.endsWith('obstacle2.png')){ obstacleImgs[1].src='obstacle2.PNG'; return; } obstacleImgBroken[1]=true; console.warn('Failed load obstacle2', e); };
  obstacleImgs[0].src = 'obstacle1.png'; obstacleImgs[1].src = 'obstacle2.png';
  // preload player image (place player2.png or player2.PNG in the same folder)
  const playerImg = new Image();
  let playerImgLoaded = false;
  let playerImgBroken = false;
  playerImg.onload = function(){ playerImgLoaded = true; playerImgBroken = !(playerImg.naturalWidth>0 && playerImg.naturalHeight>0); if(playerImgBroken) console.warn('player2.png loaded but has zero size'); };
  playerImg.onerror = function(e){
    if(playerImg.src && playerImg.src.endsWith('player2.png')){ console.warn('player2.png failed to load; trying player2.PNG'); playerImg.src = 'player2.PNG'; return; }
    playerImgBroken = true; console.warn('Failed to load player image', e);
  };
  playerImg.src = 'player2.png';
  // preload splash image for the title screen (place splash.png or splash.PNG in the same folder)
  const splashImg = new Image();
  let splashImgLoaded = false;
  let splashImgBroken = false;
  splashImg.onload = function(){ splashImgLoaded = true; splashImgBroken = !(splashImg.naturalWidth>0 && splashImg.naturalHeight>0); if(splashImgBroken) console.warn('splash.png loaded but has zero size'); };
  splashImg.onerror = function(e){ if(splashImg.src && splashImg.src.endsWith('splash.png')){ splashImg.src='splash.PNG'; return; } splashImgBroken = true; console.warn('Failed load splash image', e); };
  splashImg.src = 'splash.png';
  // simple background music using WebAudio (lightweight synth + sequencer)
  let audioCtx = null;
  let bgmMaster = null;
  let bgmStep = 0;
  let bgmInterval = null;
  let bgmPad = null;
  let bgmNodes = null;
  let bgmBpm = 170; // default BPM for sequencer
  let drumPattern = null;
  let bassPattern = null;
  let dubNodes = null;
  let dubInterval = null;
  let bgmTransportStartMs = Date.now();

  function ensureAudio(){
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      bgmMaster = audioCtx.createGain(); bgmMaster.gain.value = 0.55; bgmMaster.connect(audioCtx.destination);
      try{ console.log('[luck] ensureAudio: created AudioContext, state=', audioCtx.state); }catch(e){}
    }
  }

  function playNote(freq, dur=0.25, timeOffset=0){
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime + timeOffset);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + timeOffset + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + timeOffset + dur);
    osc.connect(g); g.connect(bgmMaster);
    osc.start(audioCtx.currentTime + timeOffset);
    osc.stop(audioCtx.currentTime + timeOffset + dur + 0.02);
  }

  function startBGM(){
    try{
      ensureAudio();
      try{ console.log('[luck] startBGM called - audio state=', audioCtx && audioCtx.state); }catch(e){}
      bgmTransportStartMs = Date.now();
      // container for active nodes so we can stop them
      bgmNodes = [];
      // pad: two detuned saws for warmth
      bgmPad = audioCtx.createOscillator();
      const padGain = audioCtx.createGain(); padGain.gain.value = 0.03;
      const padLow = audioCtx.createOscillator();
      padLow.type = 'sawtooth'; padLow.frequency.value = 55;
      bgmPad.type = 'sawtooth'; bgmPad.frequency.value = 110;
      const padFilter = audioCtx.createBiquadFilter(); padFilter.type='lowpass'; padFilter.frequency.value = 900;
      bgmPad.connect(padFilter); padLow.connect(padFilter); padFilter.connect(padGain); padGain.connect(bgmMaster);
      padLow.start(); bgmPad.start();
      bgmNodes.push(padLow, bgmPad, padFilter, padGain);

      // bass synth (simple monophonic synth)
      const bassGain = audioCtx.createGain(); bassGain.gain.value = 0.0; bassGain.connect(bgmMaster);
      const bassOsc = audioCtx.createOscillator(); bassOsc.type = 'sawtooth'; bassOsc.frequency.value = 55;
      const bassFilter = audioCtx.createBiquadFilter(); bassFilter.type='lowpass'; bassFilter.frequency.value = 900;
      bassOsc.connect(bassFilter); bassFilter.connect(bassGain);
      bassOsc.start();
      bgmNodes.push(bassOsc, bassFilter, bassGain);

      // sequencer patterns (stored globally so tempo can be changed at runtime)
      drumPattern = drumPattern || [ 'K','-','H','S','H','-','H','-' , 'K','-','H','-','H','S','H','-' ];
      bassPattern = bassPattern || [55,0,0,0,43,0,0,0,55,0,0,0,43,0,0,0];
      bgmStep = 0;
      // start sequencer using current BPM
      if(bgmInterval) clearInterval(bgmInterval);
      (function startSequencer(){
        try{
          const computeStepMsFromBpm = (bpm)=> Math.max(30, Math.round((60000 / bpm) / 4));
          const stepMsInner = computeStepMsFromBpm(bgmBpm || 170);
          bgmInterval = setInterval(()=>{
            const step = bgmStep % drumPattern.length;
            const token = drumPattern[step];
            if(token === 'K') playKick();
            else if(token === 'S') playSnare();
            else if(token === 'H') playHat();
            const bf = bassPattern[step]; if(bf>0) playBass(bf, 0.14);
            bgmStep++;
          }, stepMsInner);
          try{ console.log('[luck] sequencer started at BPM=', bgmBpm, 'stepMs=', stepMsInner); }catch(e){}
        }catch(e){ console.warn('startSequencer failed', e); }
      })();
      if(audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    }catch(e){ console.warn('startBGM failed', e); }
  }

  function stopBGM(keepContext=false){
    try{
      if(bgmInterval){ clearInterval(bgmInterval); bgmInterval = null; }
      // stop and disconnect nodes
      if(bgmNodes && bgmNodes.length){
        for(const n of bgmNodes){ try{ if(n.stop) n.stop(); if(n.disconnect) n.disconnect(); }catch(e){} }
        bgmNodes = null;
      }
      if(bgmPad){ try{ bgmPad.stop(); }catch(e){} bgmPad = null; }
      // suspend audio context
      if(!keepContext && audioCtx && audioCtx.state !== 'closed') audioCtx.suspend().catch(()=>{});
    }catch(e){}
  }

  function computeStepMsFromBpm(bpm){
    return Math.max(30, Math.round((60000 / bpm) / 4));
  }

  function setBpm(newBpm){
    try{
      bgmBpm = newBpm;
      bgmTransportStartMs = Date.now();
      // restart sequencer with new bpm if running
      if(bgmInterval){
        try{ clearInterval(bgmInterval); }catch(e){}
        const stepMsInner = computeStepMsFromBpm(bgmBpm);
        bgmInterval = setInterval(()=>{
          const step = bgmStep % drumPattern.length;
          const token = drumPattern[step];
          if(token === 'K') playKick();
          else if(token === 'S') playSnare();
          else if(token === 'H') playHat();
          const bf = bassPattern[step]; if(bf>0) playBass(bf, 0.14);
          bgmStep++;
        }, stepMsInner);
        try{ console.log('[luck] setBpm ->', bgmBpm, 'stepMs=', stepMsInner); }catch(e){}
      }
    }catch(e){ console.warn('setBpm failed', e); }
  }

  function startDubLayer(){
    try{
      ensureAudio();
      if(dubInterval) return;
      // stop the main BGM so the leaf effect becomes a replacement, not a layer
      try{ stopBGM(true); }catch(e){}
      bgmTransportStartMs = Date.now();
      dubNodes = [];
      const makeVoice = (freq, detune, gainValue, wave='sawtooth')=>{
        const osc = audioCtx.createOscillator();
        osc.type = wave;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1100;
        filter.Q.value = 2;
        const gain = audioCtx.createGain();
        gain.gain.value = gainValue;
        osc.connect(filter); filter.connect(gain); gain.connect(dubMix);
        osc.start();
        dubNodes.push(osc, filter, gain);
      };

      const dubMix = audioCtx.createGain(); dubMix.gain.value = 0.22;
      const dubDelay = audioCtx.createDelay(1.5); dubDelay.delayTime.value = 0.28;
      const dubFeedback = audioCtx.createGain(); dubFeedback.gain.value = 0.5;
      const dubFilter = audioCtx.createBiquadFilter(); dubFilter.type = 'lowpass'; dubFilter.frequency.value = 1400; dubFilter.Q.value = 1.2;
      dubMix.connect(dubFilter); dubFilter.connect(dubDelay); dubDelay.connect(dubFeedback); dubFeedback.connect(dubFilter);
      dubFilter.connect(bgmMaster);
      dubDelay.connect(bgmMaster);
      dubNodes.push(dubMix, dubDelay, dubFeedback, dubFilter);

      // loud, obvious dub sequence so it is clearly audible while leaf is active
      const dubPattern = [
        [110, 0], [0, 0], [165, 0], [0, 0],
        [98, 0], [0, 0], [147, 0], [0, 0]
      ];
      let dubStep = 0;
      const playDubStep = ()=>{
        const [root, third] = dubPattern[dubStep % dubPattern.length];
        if(root > 0){ makeVoice(root, -4, 0.08, 'square'); }
        if(third > 0){ makeVoice(third, 3, 0.05, 'triangle'); }
        // short dub stab / tail
        const stab = audioCtx.createOscillator();
        stab.type = 'square';
        stab.frequency.value = root > 0 ? root * 2 : 55;
        const stabFilter = audioCtx.createBiquadFilter();
        stabFilter.type = 'lowpass'; stabFilter.frequency.value = 1000;
        const stabGain = audioCtx.createGain();
        stabGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        stabGain.gain.exponentialRampToValueAtTime(0.10, audioCtx.currentTime + 0.01);
        stabGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
        stab.connect(stabFilter); stabFilter.connect(stabGain); stabGain.connect(dubMix);
        stab.start(); stab.stop(audioCtx.currentTime + 0.2);
        dubNodes.push(stab, stabFilter, stabGain);
        dubStep++;
      };

      playDubStep();
      dubInterval = setInterval(playDubStep, 250);
      try{ console.log('[luck] dub track started'); }catch(e){}
    }catch(e){ console.warn('startDubLayer failed', e); }
  }

  function stopDubLayer(){
    try{
      if(dubInterval){ clearInterval(dubInterval); dubInterval = null; }
      if(dubNodes && dubNodes.length){
        for(const n of dubNodes){ try{ if(n.stop) n.stop(); if(n.disconnect) n.disconnect(); }catch(e){} }
        dubNodes = null;
      }
      try{ console.log('[luck] dub layer stopped'); }catch(e){}
      // restore the main BGM when leaf finishes
      try{ if(game && game.running) startBGM(); }catch(e){}
    }catch(e){ console.warn('stopDubLayer failed', e); }
  }

  function getBeatPulse(){
    const elapsedMs = Math.max(0, Date.now() - bgmTransportStartMs);
    const beats = elapsedMs * (bgmBpm / 60000);
    const phase = beats % 1;
    // a sharp beat with a soft tail
    const sharp = Math.max(0, 1 - Math.abs(phase - 0.06) / 0.06);
    const tail = Math.max(0, 1 - Math.abs(phase - 0.28) / 0.28) * 0.25;
    return Math.min(1, sharp + tail);
  }

  function drawHeartbeat(ctx, x, y, size, pulse){
    const s = size * (1 + pulse * 0.18);
    const glow = 0.12 + pulse * 0.28;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / size, s / size);
    ctx.shadowColor = `rgba(255, 90, 120, ${glow})`;
    ctx.shadowBlur = 10 + pulse * 8;
    const dots = [
      [-3, -1], [3, -1],
      [-5, 0], [-2, 0], [2, 0], [5, 0],
      [-6, 2], [-4, 2], [-1, 2], [1, 2], [4, 2], [6, 2],
      [-5, 4], [-3, 4], [-1, 4], [1, 4], [3, 4], [5, 4],
      [-4, 6], [-2, 6], [0, 6], [2, 6], [4, 6],
      [-3, 8], [-1, 8], [1, 8], [3, 8],
      [-2, 10], [0, 10], [2, 10],
      [-1, 12], [1, 12],
      [0, 14]
    ];
    const dotSize = 3.5 + pulse * 0.9;
    const dotGap = 3.2;
    ctx.fillStyle = pulse > 0.65 ? '#ff6b86' : '#ff4d6d';
    for(const [dx, dy] of dots){
      ctx.fillRect((dx * dotGap) - dotSize / 2, (dy * dotGap) - dotSize / 2, dotSize, dotSize);
    }
    ctx.restore();
  }

  function drawHeldItemSlot(ctx, x, y, size, itemType){
    ctx.save();
    ctx.translate(x, y);
    const glow = itemType === null || itemType === undefined ? 0.08 : 0.22;
    ctx.shadowColor = `rgba(255, 217, 101, ${glow})`;
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(8, 14, 28, 0.75)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#ffd965';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    if(itemType !== null && itemType !== undefined){
      const idx = Math.max(0, Math.min(2, itemType | 0));
      if(typeof itemImgLoaded !== 'undefined' && itemImgs[idx] && itemImgLoaded[idx] && !itemImgBroken[idx] && itemImgs[idx].naturalWidth > 0 && itemImgs[idx].naturalHeight > 0){
        const pad = 5;
        try{ ctx.drawImage(itemImgs[idx], pad, pad, size - pad * 2, size - pad * 2); }catch(e){
          ctx.fillStyle = idx === 0 ? '#ffd965' : idx === 1 ? '#b7ff9b' : '#7ec8ff';
          ctx.fillRect(7, 7, size - 14, size - 14);
        }
      } else {
        ctx.fillStyle = idx === 0 ? '#ffd965' : idx === 1 ? '#b7ff9b' : '#7ec8ff';
        ctx.fillRect(7, 7, size - 14, size - 14);
      }
    } else {
      // leave empty slot blank
    }
    ctx.restore();
  }

  // drum synth helpers
  function playKick(){
    if(!audioCtx) return;
    const o = audioCtx.createOscillator(); o.type='sine';
    const g = audioCtx.createGain();
    o.frequency.setValueAtTime(120, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.18);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.6, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
    o.connect(g); g.connect(bgmMaster);
    o.start(); o.stop(audioCtx.currentTime + 0.3);
    bgmNodes.push(o,g);
  }

  function playSnare(){
    if(!audioCtx) return;
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuf = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1);
    const src = audioCtx.createBufferSource(); src.buffer = noiseBuf;
    const f = audioCtx.createBiquadFilter(); f.type='bandpass'; f.frequency.value = 1800;
    const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.4, audioCtx.currentTime + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
    src.connect(f); f.connect(g); g.connect(bgmMaster);
    src.start(); src.stop(audioCtx.currentTime + 0.2);
    bgmNodes.push(src,f,g);
  }

  function playHat(){
    if(!audioCtx) return;
    const bufferSize = 0.5 * audioCtx.sampleRate;
    const noiseBuf = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1);
    const src = audioCtx.createBufferSource(); src.buffer = noiseBuf;
    const h = audioCtx.createBiquadFilter(); h.type='highpass'; h.frequency.value = 6000;
    const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.06);
    src.connect(h); h.connect(g); g.connect(bgmMaster);
    src.start(); src.stop(audioCtx.currentTime + 0.07);
    bgmNodes.push(src,h,g);
  }

  function playBass(freq, dur=0.14){
    if(!audioCtx) return;
    const o = audioCtx.createOscillator(); o.type='square'; o.frequency.value = freq;
    const g = audioCtx.createGain(); g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.28, audioCtx.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    const filter = audioCtx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value = 800;
    o.connect(filter); filter.connect(g); g.connect(bgmMaster);
    o.start(); o.stop(audioCtx.currentTime + dur + 0.02);
    bgmNodes.push(o,filter,g);
  }
  // debug helpers
  window.__luck_debug = {frames:0, lastLog:0};
  function loop(){
    // protect the loop with try/catch to catch runtime errors that stop RAF
      try{
        game.update();
        game.draw(ctx);
        scoreEl.textContent = 'Score: ' + game.score;
        highScoreTextEl.textContent = 'High Score: ' + highScore;
      }catch(err){
      // Log error and capture state for debugging
      try{
        console.error('Game loop error:', err);
        const errInfo = {
          time: (new Date()).toISOString(),
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : null,
          frame: window.__luck_debug.frames,
          score: game && game.score,
          obstacles: game && game.obstacles ? game.obstacles.length : null,
          items: game && game.items ? game.items.length : null
        };
        try{ localStorage.setItem('luck_last_error', JSON.stringify(errInfo)); }catch(e){ console.warn('Could not save error to localStorage', e); }

        // stop the game and show an overlay with retry
        game.running = false;
        game.gameOver = true;
        try{ stopBGM(); }catch(e){}
        startBtn.textContent = 'Restart';

        // draw a translucent overlay
        ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,W,H);
        ctx.fillStyle='#fff'; ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.fillText('An internal error occurred. See console for details.', W/2, H/2 - 20);

        // create DOM overlay with retry button if not exists
        if(!document.getElementById('luckErrorOverlay')){
          const ov = document.createElement('div');
          ov.id = 'luckErrorOverlay';
          ov.style.position = 'fixed'; ov.style.left = '0'; ov.style.top = '0'; ov.style.width = '100%'; ov.style.height = '100%'; ov.style.display='flex'; ov.style.alignItems='center'; ov.style.justifyContent='center'; ov.style.zIndex='99999';
          ov.innerHTML = `<div style="background:rgba(0,0,0,0.85);color:#fff;padding:18px;border-radius:8px;text-align:center;max-width:90%;">
            <div style="margin-bottom:12px;">An internal error occurred. Retry or check the console logs.</div>
            <button id="luckRetryBtn" style="padding:8px 12px;border-radius:6px;border:0;background:#2e8bff;color:#fff;cursor:pointer">Retry</button>
            <button id="luckCopyErr" style="margin-left:8px;padding:8px 12px;border-radius:6px;border:0;background:#777;color:#fff;cursor:pointer">Copy Error</button>
          </div>`;
          document.body.appendChild(ov);
          document.getElementById('luckRetryBtn').addEventListener('click',()=>{
            try{ document.getElementById('luckErrorOverlay').remove(); }catch(e){}
            // restart game cleanly
            game = new Game(); game.start();
          });
          document.getElementById('luckCopyErr').addEventListener('click',()=>{
            try{
              const txt = localStorage.getItem('luck_last_error') || 'no error logged';
              navigator.clipboard.writeText(txt);
              alert('Error details copied to clipboard');
            }catch(e){ alert('Copy failed: ' + e); }
          });
        }
      }catch(e){
        console.error('Error while handling game loop error', e);
      }
      return;
    }

    // frame debug counter
    window.__luck_debug.frames++;
    if(window.__luck_debug.frames - window.__luck_debug.lastLog >= 60){
      window.__luck_debug.lastLog = window.__luck_debug.frames;
      try{
        console.log('[luck] frame', window.__luck_debug.frames, 'score', game.score, 'obs', game.obstacles.length, 'items', (game.items||[]).length, 'layers', game.layers.map(l=>l.buildings.length));
      }catch(e){ console.log('[luck] debug read failed', e); }
    }

    if(game.running) requestAnimationFrame(loop);
  }

  function startOrJump(){
    if(!game) game = new Game();
    if(game.gameOver) return;
    // prevent duplicate calls from touchstart + pointerdown firing together
    try{ const now = Date.now(); if(__luck_lastInputMs && now - __luck_lastInputMs < 60) return; __luck_lastInputMs = now; }catch(e){}
    if(!game.running){
      try{ const ov = document.getElementById('luckErrorOverlay'); if(ov) ov.remove(); }catch(e){}
      // ensure audio is resumed in the same user gesture
      try{ ensureAudio(); if(audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume().then(()=>{ try{ console.log('[luck] audioCtx resumed from startOrJump'); }catch(e){} }).catch(e=>{ console.warn('audio resume failed', e); }); } }catch(e){}
      game.start();
      return;
    }
    game.player.jump();
  }

  // input
  window.addEventListener('keydown',(e)=>{ if(e.code==='Space'){ e.preventDefault(); startOrJump(); } });
  canvas.addEventListener('click',()=>{ startOrJump(); });
  // input binding: prefer touchstart on touch devices to avoid duplicate events
  console.log('[luck] binding input events, touch supported:', 'ontouchstart' in window);
  if('ontouchstart' in window){
    canvas.addEventListener('touchstart',(e)=>{ e.preventDefault(); try{ console.log('[luck] touchstart -> startOrJump'); }catch(e){} startOrJump(); }, {passive:false});
  } else {
    canvas.addEventListener('pointerdown',()=>{ try{ console.log('[luck] pointerdown -> startOrJump'); }catch(e){} startOrJump(); });
  }

  startBtn.addEventListener('click',()=>{
    if(!game) game = new Game();
    // If game is already running and not gameOver, ignore additional clicks to avoid duplicate loops
    if(game.running && !game.gameOver) return;
    // remove error overlay if present
    try{ const ov = document.getElementById('luckErrorOverlay'); if(ov) ov.remove(); }catch(e){}
    try{ ensureAudio(); if(audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume().then(()=>{ try{ console.log('[luck] audioCtx resumed from startBtn'); }catch(e){} }).catch(e=>{ console.warn('audio resume failed', e); }); } }catch(e){}
    game.start();
  });
  if(restartBtn){
    restartBtn.addEventListener('click',()=>{
      if(!game) game = new Game();
      try{ const ov = document.getElementById('luckErrorOverlay'); if(ov) ov.remove(); }catch(e){}
      try{ ensureAudio(); if(audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume().catch(e=>{ console.warn('audio resume failed', e); }); } }catch(e){}
      game.start();
    });
  }
  // mobile jump button
  const jumpBtn = document.getElementById('jumpBtn');
  if(jumpBtn){
    if('ontouchstart' in window){
      jumpBtn.addEventListener('touchstart',(e)=>{ e.preventDefault(); try{ console.log('[luck] jumpBtn touchstart'); }catch(e){} startOrJump(); }, {passive:false});
    } else {
      jumpBtn.addEventListener('pointerdown', (e)=>{ if(e.pointerType!=='mouse'){ try{ console.log('[luck] jumpBtn pointerdown'); }catch(e){} startOrJump(); } });
    }
  }
  // fullscreen removed — button not present
  function fitCanvas(){
    const containerWidth = canvas.parentElement.clientWidth;
    // reserve some vertical space for UI and buttons on mobile
    const reserved = 140; // px for top/bottom UI
    const availableHeight = Math.max(200, window.innerHeight - reserved);
    let scale;
    // if portrait (taller than wide), prefer filling height; otherwise fit width
    if(window.innerHeight > window.innerWidth){
      scale = Math.min(1, availableHeight / H, containerWidth / W);
    } else {
      scale = Math.min(1, containerWidth / W);
    }
    canvas.style.width = (W*scale) + 'px';
    canvas.style.height = (H*scale) + 'px';
    // adjust jump button size for small screens
    try{
      const jb = document.getElementById('jumpBtn'); if(jb){
        if(window.innerHeight > window.innerWidth){ jb.style.width='96px'; jb.style.height='96px'; }
        else { jb.style.width='88px'; jb.style.height='88px'; }
      }
    }catch(e){}
  }
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', fitCanvas);
  fitCanvas();
  // expose lightweight audio debug helpers for diagnosing playback issues
  try{
    window.__luck_audio = {
      created: function(){ return !!audioCtx; },
      state: function(){ return audioCtx ? audioCtx.state : 'none'; },
      resume: function(){ if(audioCtx) return audioCtx.resume().then(()=>{ console.log('audioCtx resumed'); }).catch(e=>{ console.warn('resume failed', e); }); else console.warn('no audioCtx'); }
    };
  }catch(e){ /* ignore in restricted contexts */ }
})();
