'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const E=window.Embody;
  const get=id=>document.getElementById(id);
  const upCanvas=get('canvas-up'),downCanvas=get('canvas-down');
  const student={name:'',code:'',index:0,answers:E.EMOTIONS.map(e=>({emotion:e.id,activation:E.newGrid(),deactivation:E.newGrid()})),finished:false};
  const params=new URLSearchParams(location.search);
  get('class-code').value=E.canonicalCode(params.get('grupo')||'');
  get('mode-hint').textContent=E.configured()?'Tus respuestas se enviarán de forma segura al profesor.':'Modo sin conexión: descargarás un archivo JSON para entregarlo al profesor.';
  function answer(){return student.answers[student.index];}
  function render(){
    const em=E.EMOTIONS[student.index];get('emotion-index').textContent=student.index+1;
    get('emotion-title').textContent=em.label;get('emotion-description').textContent=em.instruction;
    get('progress-dots').innerHTML=E.EMOTIONS.map((_,i)=>`<span class="${i<student.index?'past':i===student.index?'current':''}"></span>`).join('');
    E.draw(upCanvas,answer().activation,'activation');E.draw(downCanvas,answer().deactivation,'deactivation');
    get('prev').disabled=student.index===0;get('next').textContent=student.index===E.EMOTIONS.length-1?'Enviar respuestas ✓':'Siguiente →';
    E.hideNotice(get('activity-notice'));get('download-backup').hidden=true;
  }
  get('begin').addEventListener('click',()=>{
    const name=get('student-name').value.trim().replace(/\s+/g,' '),code=E.canonicalCode(get('class-code').value);
    if(name.length<2 || name.length>90){E.notice(get('begin-notice'),'Escribe tu nombre (entre 2 y 90 caracteres).',true);return;}
    if(!E.validateCode(code)){E.notice(get('begin-notice'),'Introduce un código de grupo de 6 a 12 letras o números.',true);return;}
    if(!get('consent').checked){E.notice(get('begin-notice'),'Confirma que leíste cómo se utilizarán tus respuestas.',true);return;}
    student.name=name;student.code=code;get('welcome').hidden=true;get('activity').hidden=false;
    render();window.scrollTo({top:0,behavior:'smooth'});
  });
  for (const [canvas,which] of [[upCanvas,'activation'],[downCanvas,'deactivation']]) {
    let dragging=false,last=-1;
    const stamp=ev=>{
      const bounds=canvas.getBoundingClientRect(),x=(ev.clientX-bounds.left)*E.WIDTH/bounds.width,y=(ev.clientY-bounds.top)*E.HEIGHT/bounds.height;
      const cx=Math.floor(x),cy=Math.floor(y),k=cy*E.WIDTH+cx;
      if(k===last)return;last=k;
      const a=answer()[which];let change=false;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const xx=cx+dx,yy=cy+dy;
        if(xx<0||yy<0||xx>=E.WIDTH||yy>=E.HEIGHT)continue;
        const dist=Math.hypot(dx,dy);if(dist>2.1)continue;
        const p=yy*E.WIDTH+xx;if(!E.mask[p])continue;
        a[p]=Math.min(100,a[p]+(dist<1?28:dist<1.6?18:9));change=true;
      }
      if(change)E.draw(canvas,a,which);
    };
    canvas.addEventListener('pointerdown',ev=>{ev.preventDefault();dragging=true;last=-1;canvas.setPointerCapture(ev.pointerId);stamp(ev);});
    canvas.addEventListener('pointermove',ev=>{if(dragging){ev.preventDefault();stamp(ev);}});
    for(const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,()=>{dragging=false;last=-1;});
  }
  document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{
    const kind=b.dataset.clear==='up'?'activation':'deactivation';answer()[kind]=E.newGrid();
    E.draw(kind==='activation'?upCanvas:downCanvas,answer()[kind],kind);
  }));
  get('prev').addEventListener('click',()=>{if(student.index>0){student.index--;render();}});
  get('next').addEventListener('click',async()=>{
    if(student.index<E.EMOTIONS.length-1){student.index++;render();return;}
    if(student.finished)return;
    const b=get('next');b.disabled=true;b.textContent='Enviando…';
    const payload={student_name:student.name,class_code:student.code,answers:student.answers,version:'1.0',grid:{width:E.WIDTH,height:E.HEIGHT}};
    if(!E.configured()){
      student.finished=true;finish('Los datos están listos. Descarga el archivo JSON y entrégalo al profesor. No se enviaron datos a ningún servidor.',true,payload);return;
    }
    try{
      await E.requestRpc('submit_body_maps',{p_name:student.name,p_class_code:student.code,p_answers:student.answers});
      student.finished=true;finish('Tus seis mapas quedaron guardados. El profesor podrá analizar los resultados grupales cuando haya suficientes respuestas.',false,payload);
    }catch(err){E.notice(get('activity-notice'),`No se pudo enviar: ${err.message}. Puedes intentar de nuevo o descargar una copia de tus respuestas.`,true);
      get('download-backup').hidden=false;get('download-backup').onclick=()=>E.download(`mapas_${E.filenamePart(student.name)}_${student.code}.json`,JSON.stringify(payload),'application/json');
    }finally{b.disabled=false;b.textContent='Reintentar envío';}
  });
  function finish(message,canSave,payload){get('activity').hidden=true;get('completion').hidden=false;get('finish-text').textContent=message;get('finish-title').textContent=`Gracias, ${student.name}.`;
    get('save-json').hidden=!canSave;if(canSave)get('save-json').onclick=()=>E.download(`mapas_${E.filenamePart(student.name)}_${student.code}.json`,JSON.stringify(payload),'application/json');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  get('start-over').addEventListener('click',()=>location.reload());
});
