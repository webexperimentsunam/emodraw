#!/usr/bin/env Rscript
# MAPAS CORPORALES · ANÁLISIS DIDÁCTICO
# Requiere únicamente: install.packages('jsonlite')
# Desde la raíz del proyecto:
# Rscript analisis/analizar.R ejemplos/participantes_demo.csv ejemplos/respuestas_demo.csv resultados_demo
# Rscript analisis/analizar.R analisis/datos/participantes_GRUPO.csv analisis/datos/respuestas_GRUPO.csv resultados
# Analiza intensidades autoinformadas, NO actividad fisiológica ni temperatura.

args <- commandArgs(trailingOnly=TRUE)
if(length(args)<2) stop('Uso: Rscript analisis/analizar.R PARTICIPANTES.csv RESPUESTAS.csv [CARPETA_SALIDA]')
if(!requireNamespace('jsonlite',quietly=TRUE)) stop("Instala jsonlite: install.packages('jsonlite')")
out_dir <- if(length(args)>=3) args[3] else 'resultados'
dir.create(out_dir,recursive=TRUE,showWarnings=FALSE)
W <- 36L; H <- 64L; L <- W*H
emotions <- c('alegria','tristeza','miedo','enojo','asco','sorpresa')
names_es <- c('Alegría','Tristeza','Miedo','Enojo','Asco','Sorpresa')

read_data <- function(path){
  if(!file.exists(path)) stop(paste('Archivo no encontrado:',path))
  read.csv(path,stringsAsFactors=FALSE,check.names=FALSE,fileEncoding='UTF-8-BOM',na.strings=c('NA'))
}
p <- read_data(args[1]); a <- read_data(args[2])
need_p <- c('id','class_code','student_name')
need_a <- c('participant_id','class_code','emotion','activation','deactivation')
if(!all(need_p %in% colnames(p))) stop('Faltan columnas en participantes.csv')
if(!all(need_a %in% colnames(a))) stop('Faltan columnas en respuestas.csv')
if(anyDuplicated(p$id)) stop('IDs de participantes duplicados.')
if(anyDuplicated(paste(a$participant_id,a$emotion))) stop('Dos respuestas de la misma emoción para la misma persona.')
if(any(!a$participant_id %in% p$id)) stop('Hay respuestas sin participante registrado.')
if(any(!a$emotion %in% emotions)) stop('Hay emociones no reconocidas.')

mask_file <- 'assets/mask.csv'
if(!file.exists(mask_file)) stop('Ejecuta Rscript desde la carpeta raíz, donde está assets/mask.csv')
mask_df <- read.csv(mask_file)
if(nrow(mask_df)!=L) stop('La máscara debe tener 2304 valores.')
inside <- mask_df$inside == 1
if(sum(inside)<50) stop('Máscara corporal incorrecta.')

parse_grid <- function(s){
  v <- jsonlite::fromJSON(s, simplifyVector=TRUE)
  if(!is.numeric(v)||length(v)!=L||any(!is.finite(v))||any(v<0|v>100))
    stop('Matriz inválida: se esperan 2304 números de 0 a 100.')
  as.numeric(v)
}

# Paleta diverging perceptual para clases. Negativo: azul/cian; positivo: rojo/amarillo.
palette_maps <- grDevices::colorRampPalette(c('#20d7e8','#2554d4','#111b2d','#ee3525','#fff06a'))(301)
plot_body <- function(x,title_text,limit=100){
  m <- matrix(x,nrow=H,ncol=W,byrow=TRUE)
  z <- t(m[H:1,,drop=FALSE]); par(mar=c(0.5,0.4,2.5,0.4))
  graphics::image(x=seq_len(W),y=seq_len(H),z=z,axes=FALSE,xlab='',ylab='',asp=1,
                  col=palette_maps,zlim=c(-limit,limit),useRaster=TRUE)
  title(main=title_text,cex.main=1.22)
}

results <- list(); tab_pixels <- list(); summary_list <- list()
for(i in seq_along(emotions)){
  em <- emotions[i]; label <- names_es[i]
  rows <- a[a$emotion==em,,drop=FALSE]; n <- nrow(rows)
  signed_mean <- rep(NA_real_,L); stats <- rep(NA_real_,L)
  t_stat <- rep(0,L); p_value <- rep(1,L); q_value <- rep(1,L)
  empty_count <- 0L
  if(n){
    up <- vapply(rows$activation,parse_grid, numeric(L))
    down <- vapply(rows$deactivation,parse_grid, numeric(L))
    # vapply devuelve matriz L x N (si N=1, sigue matriz)
    diff <- up - down
    signed_mean <- rowMeans(diff)
    empty_count <- sum(colSums(abs(diff))==0)
    if(n>=3){
      sd_values <- apply(diff,1,stats::sd)
      variable <- inside & is.finite(sd_values) & sd_values>0
      t_stat[variable] <- signed_mean[variable]/(sd_values[variable]/sqrt(n))
      p_value[variable] <- 2*stats::pt(-abs(t_stat[variable]),df=n-1)
      # Si todos los participantes asignaron exactamente el mismo valor no nulo,
      # SD=0 y el cociente t es indefinido. Para evitar atribuir certeza artificial,
      # estos píxeles se reportan como no evaluables (p=1).
      q_value[inside] <- stats::p.adjust(p_value[inside],method='BH')
    }
  }
  if(!n) signed_mean[inside] <- 0
  # Infografía estadística solo muestra píxeles con FDR q<0.05 y n>=3.
  stat_map <- rep(NA_real_,L);stat_map[inside] <- 0
  if(n>=3){
    significant <- inside & q_value < 0.05
    stat_map[significant] <- pmax(-15,pmin(15,t_stat[significant]))
  }
  mean_map <- rep(NA_real_,L);mean_map[inside] <- signed_mean[inside]
  results[[em]] <- list(n=n,average=mean_map,tmap=stat_map)
  tab_pixels[[em]] <- data.frame(emotion=em,x=mask_df$x[inside],y=mask_df$y[inside],
      n=n,mean_difference=round(signed_mean[inside],4),t=round(t_stat[inside],4),
      p=p_value[inside],q_fdr=q_value[inside],significant_fdr=q_value[inside]<0.05)
  summary_list[[em]] <- data.frame(emotion=em,n_participants=n,
      empty_responses=empty_count,
      n_significant_pixels=sum(inside & q_value<0.05),
      mean_abs_change=round(mean(abs(signed_mean[inside]),na.rm=TRUE),2),
      pixels_in_mask=sum(inside))
}

write.csv(do.call(rbind,tab_pixels),file.path(out_dir,'estadisticos_pixeles.csv'),row.names=FALSE,fileEncoding='UTF-8')
write.csv(do.call(rbind,summary_list),file.path(out_dir,'resumen_emociones.csv'),row.names=FALSE,fileEncoding='UTF-8')

for(mode in c('promedios','estadisticos')){
  path <- file.path(out_dir,paste0('figura_',mode,'.png'))
  grDevices::png(path,width=1700,height=1270,res=180,bg='white')
  par(mfrow=c(2,3),oma=c(1,1,2,1))
  for(i in seq_along(emotions)){
    r <- results[[emotions[i]]]
    vec <- if(mode=='promedios')r$average else r$tmap
    plot_body(vec,paste0(names_es[i],' (n=',r$n,')'),if(mode=='promedios')100 else 15)
  }
  mtext(if(mode=='promedios') 'Promedio: mayor activación (+) − menor activación (−), escala −100 a +100'
        else 'Pruebas t contra 0, FDR (Benjamini–Hochberg) por emoción, q < 0.05; valores t recortados a ±15',
        side=3,outer=TRUE,line=0.35,cex=0.95)
  grDevices::dev.off()
}

# Comparación exploratoria: correlación espacial de las medias de las seis emociones.
means <- vapply(emotions,function(em) results[[em]]$average[inside],numeric(sum(inside)))
colnames(means) <- emotions
sim <- suppressWarnings(stats::cor(means,use='pairwise.complete.obs',method='pearson'))
write.csv(sim,file.path(out_dir,'similitud_emociones.csv'),row.names=TRUE,fileEncoding='UTF-8')
grDevices::png(file.path(out_dir,'similitud_emociones.png'),width=1000,height=950,res=150,bg='white')
par(mar=c(8,8,4,3))
plot.new();plot.window(xlim=c(.5,6.5),ylim=c(.5,6.5),asp=1)
colors <- grDevices::colorRampPalette(c('#2754c6','white','#e93c2c'))(201)
for(ix in 1:6) for(iy in 1:6){
  v <- sim[ix,iy];color <- if(is.finite(v)) colors[1+round((v+1)*100)] else '#d5dce4'
  rect(ix-.47,7-iy-.47,ix+.47,7-iy+.47,col=color,border='white')
  if(is.finite(v))text(ix,7-iy,sprintf('%.2f',v),cex=.8)
}
axis(1,1:6,names_es,las=2,tick=FALSE);axis(2,6:1,names_es,las=2,tick=FALSE)
title('Similitud espacial entre emociones (Pearson)',line=2)
box();grDevices::dev.off()
cat('Análisis finalizado. Archivos guardados en:',normalizePath(out_dir),'\n')
cat('Nota: estas pruebas son una aproximación didáctica. No equivalen a una replicación exacta de todo el pipeline de Nummenmaa et al.\n')
