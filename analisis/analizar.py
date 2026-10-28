#!/usr/bin/env python3
"""Implementación alternativa verificable. La opción principal recomendada es analizar.R.
Uso: python analisis/analizar.py PARTICIPANTES.csv RESPUESTAS.csv [CARPETA_SALIDA]
Requiere: numpy scipy matplotlib (ver requirements_python.txt)
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from scipy.stats import t as student_t

W, H = 36, 64
EMOTIONS = {'alegria':'Alegría','tristeza':'Tristeza','miedo':'Miedo','enojo':'Enojo','asco':'Asco','sorpresa':'Sorpresa'}
CMAP = LinearSegmentedColormap.from_list('emociones',['#20d7e8','#2554d4','#111b2d','#ee3525','#fff06a'],N=301)
CMAP.set_bad('white')


def read_csv(path):
    with Path(path).open('r',encoding='utf-8-sig',newline='') as f:
        return list(csv.DictReader(f))


def parse_array(string):
    a=np.asarray(json.loads(string),dtype=float)
    if a.shape!=(W*H,) or not np.isfinite(a).all() or np.any((a<0)|(a>100)):
        raise ValueError('Cada matriz debe contener 2304 valores entre 0 y 100')
    return a


def correct_bh(p):
    order=np.argsort(p)
    sorted_p=p[order]
    adj=np.minimum.accumulate((sorted_p*len(p)/np.arange(1,len(p)+1))[::-1])[::-1]
    q=np.empty_like(p);q[order]=np.clip(adj,0,1)
    return q


def plot_six(data,filename,limit,title):
    fig,axes=plt.subplots(2,3,figsize=(12,12),constrained_layout=True)
    for ax,(em,label) in zip(axes.flat,EMOTIONS.items()):
        obj=data[em];n=obj['n'];values=np.asarray(obj['avg' if limit==100 else 'tmap'])
        ax.imshow(np.ma.masked_invalid(values.reshape(H,W)),cmap=CMAP,vmin=-limit,vmax=limit,interpolation='nearest',aspect='equal')
        ax.set_title(f'{label} (n={n})',fontweight='bold');ax.axis('off')
    fig.suptitle(title,fontsize=14,fontweight='bold')
    colorbar=fig.colorbar(plt.cm.ScalarMappable(cmap=CMAP,norm=plt.Normalize(-limit,limit)),ax=axes,shrink=.35,pad=.03)
    colorbar.set_label('Promedio firmado' if limit==100 else 'Estadístico t (FDR q < 0.05)')
    fig.savefig(filename,dpi=180,bbox_inches='tight');plt.close(fig)


def main():
    if len(sys.argv)<3: raise SystemExit('Uso: python analisis/analizar.py PARTICIPANTES.csv RESPUESTAS.csv [CARPETA_SALIDA]')
    participants=read_csv(sys.argv[1]);responses=read_csv(sys.argv[2]);out=Path(sys.argv[3] if len(sys.argv)>3 else 'resultados_python')
    out.mkdir(parents=True,exist_ok=True)
    valid_ids={p['id'] for p in participants}
    if len(valid_ids)!=len(participants):raise ValueError('Participantes con IDs duplicados')
    mask_rows=read_csv('assets/mask.csv')
    if len(mask_rows)!=W*H:raise ValueError('Máscara mal dimensionada')
    mask=np.asarray([int(r['inside'])==1 for r in mask_rows])
    seen=set();results={};summary=[];pixels=[]
    for r in responses:
        key=(r['participant_id'],r['emotion'])
        if key in seen:raise ValueError(f'Respuesta duplicada: {key}')
        seen.add(key)
        if key[0] not in valid_ids:raise ValueError(f'Participante desconocido: {key[0]}')
        if key[1] not in EMOTIONS:raise ValueError(f'Emoción desconocida: {key[1]}')
    for em in EMOTIONS:
        rs=[r for r in responses if r['emotion']==em];n=len(rs)
        if n:
            diff=np.vstack([parse_array(r['activation'])-parse_array(r['deactivation']) for r in rs])
            mean=diff.mean(axis=0);empty=int(np.count_nonzero(np.abs(diff).sum(axis=1)==0))
        else:
            diff=np.zeros((0,W*H));mean=np.zeros(W*H);empty=0
        t=np.zeros(W*H);p=np.ones(W*H);q=np.ones(W*H)
        if n>=3:
            std=np.std(diff,axis=0,ddof=1)
            variable=mask&(std>0)
            t[variable]=mean[variable]/(std[variable]/np.sqrt(n))
            p[variable]=2*student_t.sf(np.abs(t[variable]),df=n-1)
            q[mask]=correct_bh(p[mask])
        show=(q<.05)&mask
        avg_map=mean.astype(float);avg_map[~mask]=np.nan
        t_map=np.zeros(W*H);t_map[show]=np.clip(t[show],-15,15);t_map[~mask]=np.nan
        results[em]={'n':n,'avg':avg_map,'tmap':t_map}
        summary.append({'emotion':em,'n_participants':n,'empty_responses':empty,
                        'n_significant_pixels':int(show.sum()),'mean_abs_change':round(float(np.abs(mean[mask]).mean()),2),'pixels_in_mask':int(mask.sum())})
        for idx in np.where(mask)[0]:
            pixels.append({'emotion':em,'x':int(idx%W+1),'y':int(idx//W+1),'n':n,'mean_difference':round(float(mean[idx]),4),
                           't':round(float(t[idx]),4),'p':float(p[idx]),'q_fdr':float(q[idx]),'significant_fdr':bool(show[idx])})
    for name,rows in [('resumen_emociones.csv',summary),('estadisticos_pixeles.csv',pixels)]:
        with (out/name).open('w',newline='',encoding='utf-8-sig') as f:
            w=csv.DictWriter(f,list(rows[0]));w.writeheader();w.writerows(rows)
    plot_six(results,out/'figura_promedios.png',100,'Promedio: activación − desactivación')
    plot_six(results,out/'figura_estadisticos.png',15,'Estadísticos t significativos tras BH-FDR (por emoción)')
    stacked=np.stack([results[e]['avg'][mask] for e in EMOTIONS],axis=0)
    with np.errstate(divide='ignore',invalid='ignore'):
        sim=np.corrcoef(stacked)
    with (out/'similitud_emociones.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f);w.writerow(['emotion']+list(EMOTIONS));
        for em,arr in zip(EMOTIONS,sim):w.writerow([em]+list(arr))
    fig,ax=plt.subplots(figsize=(8,7));im=ax.imshow(np.ma.masked_invalid(sim),vmin=-1,vmax=1,cmap='coolwarm')
    ax.set_xticks(range(6),EMOTIONS.values(),rotation=45,ha='right');ax.set_yticks(range(6),EMOTIONS.values())
    for i in range(6):
        for j in range(6):
            if np.isfinite(sim[i,j]):ax.text(j,i,f'{sim[i,j]:.2f}',ha='center',va='center',fontsize=9)
    fig.colorbar(im,ax=ax,label='Correlación espacial de Pearson');fig.tight_layout()
    fig.savefig(out/'similitud_emociones.png',dpi=160);plt.close(fig)
    print(f'Análisis terminado: {out.resolve()}')
    print('Procedimiento didáctico, no reproducción exacta del artículo original.')

if __name__=='__main__':main()
