'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const E=window.Embody, get=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  get('teacher-code').value=E.canonicalCode(params.get('grupo')||'');
  let session=null,offline=null;
  const cardRefs={};
  for(const em of E.EMOTIONS){
    const card=document.createElement('article');card.className='map-tile';
    const header=document.createElement('div');header.className='map-tile-head';
    const h=document.createElement('h3');h.textContent=em.label;
    const count=document.createElement('small');count.textContent='0 respuestas';header.append(h,count);
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=420;
    canvas.setAttribute('aria-label',`Mapa grupal de ${em.label}`);
    const waiting=document.createElement('div');waiting.className='waiting';waiting.textContent='Esperando respuestas';
    card.append(header,canvas,waiting);get('map-gallery').append(card);
    cardRefs[em.id]={count,canvas,waiting};E.drawLater(canvas,null);
  }
  function code(){return E.canonicalCode(get('teacher-code').value);}
  function updateLink(){
    const c=code(),url=new URL('index.html',location.href);
    if(E.validateCode(c))url.searchParams.set('grupo',c);
    get('participate-url').textContent=url.toString();
  }
  updateLink();get('teacher-code').addEventListener('input',updateLink);
  get('copy-link').addEventListener('click',async()=>{
    const text=get('participate-url').textContent;
    try{await navigator.clipboard.writeText(text);E.notice(get('teacher-notice'),'Enlace copiado. Envía también las instrucciones a tu grupo.');}
    catch{E.notice(get('teacher-notice'),`Copia este enlace: ${text}`);}
  });
  get('generate-code').addEventListener('click',()=>{
    const bytes=new Uint8Array(9);if(window.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<9;i++)bytes[i]=Math.floor(Math.random()*256);
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    get('teacher-code').value=Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');updateLink();
    E.notice(get('teacher-notice'),'Nuevo código generado. Comparte el enlace y el código con los estudiantes. Guárdalo para poder consultar los resultados.');
  });
  function display(counts,maps,source){
    const max=Math.max(0,...Object.values(counts).map(v=>Number(v)||0));get('total-count').textContent=max;
    get('threshold-label').textContent=`≥ ${E.CONFIG.minGroupSize||5}`;
    get('data-origin').textContent=source;
    for(const em of E.EMOTIONS){
      const r=cardRefs[em.id],n=Number(counts[em.id]||0),data=maps[em.id];
      r.count.textContent=`${n} respuesta${n===1?'':'s'}`;
      if(data?.signed && n>=(E.CONFIG.minGroupSize||5)){
        E.draw(r.canvas,data.signed,'signed');r.waiting.textContent='Promedio de activación − desactivación';
      } else {E.draw(r.canvas,null);r.waiting.textContent=n?`Se muestra desde ${E.CONFIG.minGroupSize||5} respuestas`:'Esperando respuestas';}
    }
  }
  async function refresh(){
    if(offline){const matches=offline.filter(a=>a.class_code===code());if(!matches.length){E.notice(get('teacher-notice'),'Los JSON importados no corresponden a este código de grupo.',true);return;}displayOffline(matches);return;}
    if(!E.validateCode(code())){E.notice(get('teacher-notice'),'Introduce un código de 6 a 12 letras o números.',true);return;}
    if(!E.configured()){E.notice(get('teacher-notice'),'Todavía no se configuró Supabase. Puedes importar los archivos JSON del alumnado para trabajar sin conexión.');return;}
    try{
      const data=await E.requestRpc('class_body_maps',{p_class_code:code()});
      display(data.counts||{},data.maps||{},'Actualización en línea');E.hideNotice(get('teacher-notice'));
    }catch(err){E.notice(get('teacher-notice'),`No se pudieron cargar los resultados: ${err.message}`,true);}
  }
  get('refresh').addEventListener('click',refresh);
  setInterval(()=>{if(!offline && E.configured() && E.validateCode(code()) && !document.hidden)refresh();},20000);
  async function signIn(){
    if(!E.configured()){E.notice(get('login-notice'),'Configura Supabase antes de utilizar el acceso del profesor.',true);return;}
    const email=get('teacher-email').value.trim(),password=get('teacher-password').value;
    if(!email||!password){E.notice(get('login-notice'),'Introduce correo y contraseña.',true);return;}
    const btn=get('teacher-login');btn.disabled=true;
    try{session=await E.teacherSignIn(email,password);get('teacher-password').value='';
      get('login-area').hidden=true;get('logged-in-area').hidden=false;get('signed-in-as').textContent=`Sesión: ${email}`;
      E.notice(get('login-notice'),'Sesión iniciada. La exportación exige que tu usuario esté autorizado en public.teachers.');
    }catch(err){E.notice(get('login-notice'),err.message,true);}finally{btn.disabled=false;}
  }
  get('teacher-login').addEventListener('click',signIn);
  get('teacher-logout').addEventListener('click',()=>{session=null;get('logged-in-area').hidden=true;get('login-area').hidden=false;E.notice(get('login-notice'),'Sesión cerrada.');});
  const PARTICIPANT_HEADERS=['id','class_code','student_name','created_at'];
  const RESPONSE_HEADERS=['participant_id','class_code','emotion','activation','deactivation','created_at'];
  function exportBoth(participants,responses,c){
    E.download(`participantes_${c}.csv`,E.csv(participants,PARTICIPANT_HEADERS),'text/csv;charset=utf-8');
    setTimeout(()=>E.download(`respuestas_${c}.csv`,E.csv(responses,RESPONSE_HEADERS),'text/csv;charset=utf-8'),250);
  }
  get('export-data').addEventListener('click',async()=>{
    if(!session){E.notice(get('login-notice'),'Inicia sesión.',true);return;}
    if(!E.validateCode(code())){E.notice(get('login-notice'),'Introduce primero un código válido.',true);return;}
    const b=get('export-data');b.disabled=true;
    try{
      const results=await E.requestRpc('export_class_body_maps',{p_class_code:code()},session.access_token);
      const participants=results.participants||[],responses=results.responses||[];
      exportBoth(participants,responses,code());E.notice(get('login-notice'),`Exportadas ${participants.length} personas y ${responses.length} respuestas. Guarda los CSV en la carpeta analisis/datos/.`);
    }catch(err){E.notice(get('login-notice'),`Exportación rechazada: ${err.message}. Comprueba el registro del usuario en public.teachers.`,true);}
    finally{b.disabled=false;}
  });
  function validateLocal(item){
    if(!item || typeof item.student_name!=='string'||!E.validateCode(item.class_code)||!Array.isArray(item.answers)||item.answers.length!==6)throw new Error('Archivo con estructura inválida.');
    const found=new Set();
    for(const a of item.answers){
      if(!E.EMOTIONS.some(e=>e.id===a.emotion)||found.has(a.emotion)||!['activation','deactivation'].every(k=>Array.isArray(a[k]) && a[k].length===E.LENGTH && a[k].every(v=>Number.isInteger(v)&&v>=0&&v<=100)))throw new Error('Los mapas no tienen la dimensión o los valores esperados.');
      found.add(a.emotion);
    }
    return {...item,class_code:E.canonicalCode(item.class_code)};
  }
  function displayOffline(rows){
    const counts={},maps={};
    for(const em of E.EMOTIONS){
      const responses=rows.map(item=>item.answers.find(a=>a.emotion===em.id)).filter(Boolean),n=responses.length;
      counts[em.id]=n;
      if(n>=(E.CONFIG.minGroupSize||5)){
        const signed=new Array(E.LENGTH).fill(0);
        for(const r of responses) for(let i=0;i<E.LENGTH;i++)signed[i]+=(r.activation[i]-r.deactivation[i])/n;
        maps[em.id]={signed};
      }
    }
    display(counts,maps,'Archivos locales');get('offline-summary').textContent=`${rows.length} archivo(s) importados para el grupo ${code()}. No se transmitieron datos.`;
    get('download-offline').hidden=false;get('clear-offline').hidden=false;
  }
  get('offline-files').addEventListener('change',async ev=>{
    const files=Array.from(ev.target.files||[]);if(!files.length)return;
    const valid=[],errors=[];
    for(const f of files){try{const item=validateLocal(JSON.parse(await f.text()));valid.push(item);}catch(err){errors.push(`${f.name}: ${err.message}`);}}
    if(!valid.length){E.notice(get('teacher-notice'),`Ningún archivo válido. ${errors.join('; ')}`,true);return;}
    const codes=[...new Set(valid.map(a=>a.class_code))];
    if(!codes.includes(code())){get('teacher-code').value=codes[0];updateLink();}
    offline=valid;displayOffline(offline.filter(a=>a.class_code===code()));
    E.notice(get('teacher-notice'),`Se importaron ${valid.length} JSON. ${errors.length?`Se descartaron ${errors.length} archivos inválidos.`:''}`);
  });
  get('download-offline').addEventListener('click',()=>{
    if(!offline)return;const chosen=offline.filter(a=>a.class_code===code());
    const participants=[],responses=[];
    chosen.forEach((person,idx)=>{
      const id=`offline-${String(idx+1).padStart(4,'0')}`;participants.push({id,class_code:person.class_code,student_name:person.student_name,created_at:''});
      for(const a of person.answers)responses.push({participant_id:id,class_code:person.class_code,emotion:a.emotion,activation:a.activation,deactivation:a.deactivation,created_at:''});
    });
    exportBoth(participants,responses,code());
  });
  get('clear-offline').addEventListener('click',()=>{offline=null;get('offline-files').value='';get('download-offline').hidden=true;get('clear-offline').hidden=true;
    get('offline-summary').textContent='Importa archivos individuales para visualizar un conjunto offline.';refresh();});
  if(E.configured() && E.validateCode(code()))refresh();
  else get('threshold-label').textContent=`≥ ${E.CONFIG.minGroupSize||5}`;
});
