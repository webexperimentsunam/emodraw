# Mapas corporales de las emociones — actividad de clase

Proyecto web en **español**, pensado para GitHub Pages. Inspirado en Nummenmaa, Glerean, Hari y Hietanen (2014), *Bodily maps of emotions*, PNAS. DOI: https://doi.org/10.1073/pnas.1321664111

**Incluye:**
- `index.html`: página de estudiantes con **nombre obligatorio**, código del grupo, lectura de aviso, seis emociones, dos siluetas pintables (mayor/menor activación), envío de datos.
- `profesor.html`: enlace para compartir, generador de código, mapas grupales actualizados cada 20 segundos, conteos y exportación protegida de CSV.
- `sql/instalar_supabase.sql`: base de datos y funciones RPC para enviar, agregar y exportar; sin acceso público a nombres individuales.
- `analisis/analizar.R`: promedios, prueba t de una muestra contra 0 por píxel, corrección FDR Benjamini–Hochberg por emoción, figuras PNG, tablas CSV y similitud espacial entre emociones.
- `ejemplos/`: 14 estudiantes y 84 respuestas **COMPLETAMENTE FICTICIAS**, para probar el análisis y los mapas sin recopilar información real.
- `ejemplos/json_simulados/`: respuestas ficticias individuales para probar el modo sin conexión del panel del profesor.

## A. Publicar la web (se necesita GitHub)

1. Descomprime el ZIP en tu computadora. **No subas el archivo .zip sin descomprimir**: GitHub Pages necesita `index.html`, `profesor.html` y las carpetas directamente en el repositorio.
2. En GitHub, crea un repositorio, por ejemplo `mapas-emociones-clase`. Hazlo público si usarás GitHub Pages de forma pública.
3. Selecciona **Add file → Upload files** y arrastra los archivos y carpetas **que están dentro** de `mapas_corporales_clase/` a la raíz del repositorio. Comprueba que `index.html` aparece en la raíz.
4. Haz clic en **Commit changes**.
5. Ve a **Settings → Pages → Build and deployment → Deploy from a branch**, elige la rama `main` y carpeta `/(root)`; guarda.
6. Abre la URL que muestre GitHub Pages: `https://TU_USUARIO.github.io/mapas-emociones-clase/`. El panel docente estará en `https://TU_USUARIO.github.io/mapas-emociones-clase/profesor.html`.

**Sin Supabase:** la página de estudiantes funciona con descarga de JSON individual. El docente importa los JSON en `profesor.html`, visualiza mapas grupales (mínimo 5) y descarga los CSV. Con GitHub Pages por sí solo **no se almacenan respuestas de forma centralizada**: no hay actualizaciones grupales en vivo hasta configurar Supabase.

## B. Configurar almacenamiento compartido (Supabase)

1. Crea un proyecto en https://supabase.com/dashboard.
2. Abre **SQL Editor** y ejecuta **todo** el archivo `sql/instalar_supabase.sql`. Debe terminar sin errores. Puedes volver a ejecutar el archivo para restaurar funciones; no borra las respuestas existentes.
3. En **Project Settings → API Keys** (los nombres de menús pueden cambiar), copia la **Project URL** y la clave **publishable**, que comienza por `sb_publishable_...`, o la clave legacy `anon`. 
4. Abre `config.js` y coloca únicamente estas dos propiedades:

   ```js
   window.EMBODY_CONFIG = {
     supabaseUrl: "https://TU_PROYECTO.supabase.co",
     publishableKey: "sb_publishable_TU_CLAVE_PUBLICA",
     minGroupSize: 5,
     gridWidth: 36,
     gridHeight: 64
   };
   ```

5. Sube el `config.js` modificado a GitHub. Al recargar `index.html`, el alumnado enviará automáticamente sus seis respuestas.

**Nunca publiques** las claves `service_role`, `sb_secret_...`, tu contraseña, o credenciales de administrador en `config.js`, GitHub o archivos web. La publishable key es pública por diseño. Las tablas restringen acceso directo a datos individuales; las funciones permiten inserción pública y solo promedios colectivos cuando `n >= 5`.

### Autorizar al profesor para descargar nombres y respuestas

1. En Supabase abre **Authentication → Users → Add user** y crea tu usuario de correo y contraseña. Comprueba que está confirmado; puede ser necesario confirmar el email según el método de creación.
2. Copia el **User UID (UUID)** de ese usuario.
3. Ejecuta **aparte** en SQL Editor, sustituyendo la cadena entre comillas:

   ```sql
   INSERT INTO public.map_teachers(user_id)
   VALUES ('UUID_REAL_DEL_PROFESOR');
   ```

4. Abre `profesor.html`, introduce un código de grupo, inicia sesión con ese correo y contraseña y pulsa **Descargar CSV de participantes y respuestas**.
5. Guarda ambos archivos CSV (se descargan por separado). No necesitas instalar ningún servidor ni colocar contraseña en GitHub.

**Limitación:** los usuarios registrados en `map_teachers` tienen acceso a todos los códigos de grupo de este proyecto Supabase. Está diseñado para un único profesor / una sola actividad; en despliegues multiinstitucionales se necesitaría autorización por grupo y medidas de control adicionales.

### Organizar una sesión en el aula

1. Abre `profesor.html` y pulsa **Generar código**. Anota el código aleatorio (9 caracteres); compártelo solo con tu grupo.
2. Pulsa **Copiar enlace**. El enlace de alumno contiene el código y se rellena automáticamente en el formulario.
3. Pide que cada estudiante escriba su **nombre y apellido**, acepte el aviso de tratamiento de datos y dibuje las seis emociones. Cada respuesta se registra completa en una transacción al terminar.
4. Proyecta `profesor.html` y pulsa **Actualizar resultados**. La página también actualiza los mapas cada 20 segundos. El mapa de una emoción aparece desde que haya cinco respuestas completas de esa emoción.
5. Inicia sesión en el panel para descargar los CSV y analizarlos en R.

**Nota sobre duplicados:** si un estudiante completa y envía otra vez la actividad, se registra como nueva participación. Revisa nombres en `participantes_*.csv` antes de analizar resultados definitivos.

## C. Modo sin conexión / sin Supabase

1. Deja `config.js` vacío (valor por defecto).
2. Publica igualmente la página en GitHub Pages.
3. Cada estudiante rellena el formulario y al concluir elige **Descargar respuestas en JSON**. Debe enviar ese JSON al profesor por el canal de clase establecido.
4. En `profesor.html`, escribe el código de grupo, pulsa **Seleccionar JSON del alumnado**, elige varios archivos a la vez y luego **Descargar CSV importados**.
5. Para ver un ejemplo inmediato, importa a la vez todos los archivos de `ejemplos/json_simulados/`. El código de ejemplo es `DEMO2026`.

El modo JSON es útil para una clase pequeña, pero **no** da actualizaciones automáticas, ya que los archivos se cargan manualmente. Almacena esos JSON en un lugar privado: incluyen los nombres.

## D. Análisis en R

Instala R y en la consola de R ejecuta una sola vez:

```r
install.packages("jsonlite")
```

Abre una terminal **en la carpeta raíz** del proyecto (donde están `index.html` y `assets/`). Para **probar el análisis con datos ficticios**:

```bash
Rscript analisis/analizar.R ejemplos/participantes_demo.csv ejemplos/respuestas_demo.csv resultados_demo
```

Para **analizar respuestas reales** (reemplaza los nombres de archivos por los que descargaste):

```bash
Rscript analisis/analizar.R analisis/datos/participantes_GRUPO.csv analisis/datos/respuestas_GRUPO.csv resultados
```

Archivos creados dentro de la carpeta de salida:
- `figura_promedios.png`: promedio de activación menos desactivación en cada píxel de cada emoción.
- `figura_estadisticos.png`: valores **t** significativos tras FDR por emoción (valores visualmente recortados a ±15).
- `estadisticos_pixeles.csv`: coordenadas del píxel, n, media, t, p, q y significación.
- `resumen_emociones.csv`: número de personas, respuestas vacías y píxeles significativos.
- `similitud_emociones.csv` y `similitud_emociones.png`: correlaciones de Pearson entre mapas medios.

**Alternativa en Python (opcional, comprobada con los datos ficticios):**

```bash
pip install -r analisis/requirements_python.txt
python analisis/analizar.py ejemplos/participantes_demo.csv ejemplos/respuestas_demo.csv resultados_python
```

Las figuras obtenidas en el ejemplo ya están guardadas en `ejemplos/resultados_demo/`.

El script excluye píxeles fuera de la máscara. Cuando `n < 3` no calcula pruebas inferenciales. Píxeles con desviación estándar cero se marcan como no evaluables (p=1), para no producir significación artificial. La corrección FDR se aplica **separadamente por emoción**, no a todas las emociones en bloque. Los resultados son una adaptación didáctica, **no una réplica exacta** del artículo original ni un análisis confirmatorio validado. Los mapas son autoinformes: no medidas fisiológicas.

## E. Privacidad, consentimiento y uso responsable

- El **nombre es obligatorio**, por solicitud didáctica. Por tanto, las respuestas **no son anónimas para el profesor**. El panel público solo da acceso a medias y conteos. Evita proyectar la exportación de nombres.
- Antes de usarlo, confirma que este aviso breve satisface los requisitos de tu institución o adapta el texto, informa de finalidad, responsable, duración de conservación, canal para ejercer derechos y tratamiento del nombre. Si el grupo es de participación obligatoria, establece una alternativa razonable sin exponer sensaciones personales.
- Evita tratar los resultados como diagnósticos, síntomas clínicos, o evidencia de estado emocional individual.
- Para borrar **todas** las respuestas de un grupo desde SQL Editor (y los nombres asociados):

  ```sql
  DELETE FROM public.map_participants WHERE class_code='CODIGO_GRUPO';
  ```
  
  Las respuestas relacionadas se borran por `ON DELETE CASCADE`. Primero exporta si necesitas una copia autorizada.
- Los datos ficticios `DEMO2026` son solo un ejemplo técnico. **No uses sus mapas como resultado de investigación**.
- La función de envío acepta respuestas de navegadores que conozcan el código del grupo. Para clases públicas numerosas o estudios reales se recomienda añadir control de abusos, rate limiting, formularios de consentimiento institucionales y supervisión de seguridad.
- Configura políticas de retención, copias de seguridad y ubicación de almacenamiento adecuadas antes de recopilar datos de estudiantes.

## F. Guía técnica resumida

- Cada silueta se representa en una rejilla fija de **36 × 64 = 2304 posiciones**; la máscara válida es `assets/mask.csv` y los valores fuera del cuerpo son cero.
- Se guardan dos matrices enteras de **0 a 100** para cada emoción: `activation` y `deactivation`; la diferencia firmada es `activation - deactivation`.
- Los alumnos ven las siluetas y pintan con puntero/ratón. Las intensidades reflejan el número de pasadas en cada píxel; **no hay escala psicométrica calibrada**.
- El profesor observa **medias firmadas** para cada emoción; los estadísticos t con FDR se obtienen después en R.
- Cada envío incluye seis respuestas y se valida en el servidor; no se admiten lecturas públicas de tablas nominativas.
- El sitio es completamente estático: GitHub Pages entrega HTML/CSS/JS; Supabase proporciona API REST para datos compartidos y autenticación.

## Referencias técnicas

- Artículo original: https://doi.org/10.1073/pnas.1321664111
- Proyecto original emBODY: https://version.aalto.fi/gitlab/eglerean/embody
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Supabase (claves): https://supabase.com/docs/guides/getting-started/api-keys
- Supabase Auth: https://supabase.com/docs/guides/auth/passwords
