# Análisis en R

Lee `../README.md`, sección **D. Análisis en R**.

Ejemplo de ejecución desde la raíz del repositorio:

```bash
Rscript analisis/analizar.R ejemplos/participantes_demo.csv ejemplos/respuestas_demo.csv resultados_demo
```

Para visualizar resultados en directo, usa `profesor.html`. Para inferencia estadística, descarga los CSV nominativos después de autenticarte y ejecuta `analizar.R` localmente. Las figuras estadísticas usan pruebas t de una muestra contra cero en cada píxel de cada emoción, BH-FDR separado para cada emoción. Es un procedimiento docente simplificado; no constituye una reproducción completa del método original.
