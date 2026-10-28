/* Utilidades compartidas. No hay librerías de terceros ni credenciales privadas. */
(function () {
  'use strict';
  const CONFIG = window.EMBODY_CONFIG || {};
  const WIDTH = 36, HEIGHT = 64, LENGTH = WIDTH * HEIGHT;
  const EMOTIONS = [
    {id:'alegria', label:'Alegría', instruction:'Piensa en un momento en que sentiste mucha alegría.'},
    {id:'tristeza', label:'Tristeza', instruction:'Recuerda una experiencia de tristeza.'},
    {id:'miedo', label:'Miedo', instruction:'Imagina una situación que te produzca miedo.'},
    {id:'enojo', label:'Enojo', instruction:'Piensa en cómo experimentas el enojo.'},
    {id:'asco', label:'Asco', instruction:'Recuerda cómo se siente una reacción de asco.'},
    {id:'sorpresa', label:'Sorpresa', instruction:'Recuerda un acontecimiento que te sorprendió.'}
  ];
  const image = new Image(); image.src='assets/cuerpo.svg';
  const mask = window.BODY_MASK || new Array(LENGTH).fill(0);
  function configured() { return Boolean(CONFIG.supabaseUrl && CONFIG.publishableKey && !CONFIG.supabaseUrl.includes('TU_')); }
  function newGrid() { return new Array(LENGTH).fill(0); }
  function canonicalCode(value) { return String(value||'').trim().toUpperCase().replace(/\s+/g,''); }
  function validateCode(value) { return /^[A-Z0-9]{6,12}$/.test(canonicalCode(value)); }
  function notice(el, message, error=false) { el.textContent=message; el.hidden=false; el.classList.toggle('error',error); }
  function hideNotice(el) { el.hidden=true; }
  function colorFor(value, scale=100) {
    const t=Math.min(1,Math.abs(value)/scale);
    const base=[23,34,53]; const to=value>=0 ? (t>.6?[255,216,68]:[231,46,32]) : (t>.6?[29,208,236]:[32,62,211]);
    const f=Math.min(1, t*2);
    return `rgb(${base.map((v,i)=>Math.round(v+(to[i]-v)*f)).join(',')})`;
  }
  function draw(canvas,values,mode='signed') {
    const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,240,420);
    if(image.complete && image.naturalWidth) ctx.drawImage(image,0,0,240,420);
    const cw=240/WIDTH,ch=420/HEIGHT;
    if (values) for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++) {
      const k=y*WIDTH+x;if(!mask[k])continue;
      let v=values[k]||0;
      if(mode==='activation') v=Math.max(0,v);
      if(mode==='deactivation') v=-Math.max(0,v);
      if(Math.abs(v)<.01)continue;
      ctx.fillStyle=colorFor(v); ctx.fillRect(x*cw,y*ch,cw+.35,ch+.35);
    }
  }
  function drawLater(canvas,values,mode) { draw(canvas,values,mode); if(!image.complete || !image.naturalWidth)image.addEventListener('load',()=>draw(canvas,values,mode),{once:true}); }
  async function requestRpc(name, payload, accessToken='') {
    if(!configured())throw new Error('Primero configura Supabase en config.js.');
    const base=CONFIG.supabaseUrl.replace(/\/$/,'');
    const key=CONFIG.publishableKey;
    const response=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json','apikey':key,'Authorization':`Bearer ${accessToken || key}`},body:JSON.stringify(payload)});
    let data;try{data=await response.json();}catch{data=null;}
    if(!response.ok)throw new Error(data?.message || data?.error_description || `Error HTTP ${response.status}`);
    return data;
  }
  async function teacherSignIn(email,password) {
    const base=CONFIG.supabaseUrl.replace(/\/$/,'');
    const r=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json','apikey':CONFIG.publishableKey},body:JSON.stringify({email,password})});
    const data=await r.json();if(!r.ok)throw new Error(data.msg||data.error_description||data.message||'No fue posible autenticar.');return data;
  }
  function csv(rows,headers){const field=v=>'"'+String(v==null?'':typeof v==='object'?JSON.stringify(v):v).replace(/"/g,'""')+'"';return '\ufeff'+headers.map(field).join(',')+'\r\n'+rows.map(r=>headers.map(h=>field(r[h])).join(',')).join('\r\n')+'\r\n';}
  function download(name,content,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
  function filenamePart(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,40);}
  window.Embody={CONFIG,WIDTH,HEIGHT,LENGTH,EMOTIONS,mask,configured,newGrid,canonicalCode,validateCode,notice,hideNotice,draw,drawLater,requestRpc,teacherSignIn,csv,download,filenamePart};
})();
