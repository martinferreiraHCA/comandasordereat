# Comandas de cocina

Web app estática que toma el Excel de pedidos (el export de la app de pedidos) y arma
**hojas A4 en blanco y negro con tickets de comanda recortables**, agrupados por categoría.

Todo pasa dentro del navegador: el archivo **no se sube a ningún servidor**.

## Cómo se usa

1. Abrir la página.
2. Arrastrar el `.xlsx` (también acepta `.xls` y `.csv`).
3. Elegir la agrupación y los tickets por hoja.
4. **Imprimir / Guardar PDF**.

En el diálogo de impresión: papel **A4**, márgenes **ninguno / predeterminados**,
escala **100 %** y sin «encabezados y pies de página». Las hojas ya traen sus propios márgenes.

## Qué genera

- **Tickets recortables** con línea de corte punteada: clase, hora de retiro (grande),
  nombre del comensal, Nº de pedido, productos con su cantidad y las observaciones en un recuadro.
  El cuerpo de letra se agranda solo hasta llenar cada ticket, así no queda espacio desperdiciado.
- **Hoja de resumen de producción**: totales generales, pedidos por hora y cuántas unidades
  de cada producto hay que preparar por grupo. Sirve como hoja de trabajo de cocina.

## Opciones

| Opción | Para qué sirve |
|---|---|
| Agrupar por | Nivel (Kinder / Primaria / Secundaria), clase exacta, hora de retiro, producto principal o sin agrupar |
| Ordenar dentro del grupo | Hora, nombre, clase, producto o Nº de pedido |
| Cada grupo en hoja nueva | Separa físicamente los grupos. Si genera muchas hojas casi vacías, la app avisa cuántas se ahorran destildándolo |
| Tickets por hoja | 4 (2×2), 6 (2×3), 8 (2×4) o 12 (3×4) |
| Título y fecha | Lo que se imprime en el encabezado de cada hoja y en el pie de cada ticket |
| Hoja resumen | Agrega el resumen de producción adelante |
| Solo pedidos con observaciones | Para imprimir aparte los que tienen pedidos especiales |
| Marcas de corte | Muestra u oculta las líneas punteadas |
| Estado | Filtra por el estado del pedido (por ejemplo, solo `Pending`) |

Las opciones quedan guardadas en el navegador para la próxima vez.

## Formato del Excel

La app busca sola la fila de encabezados y acepta los nombres en inglés o en castellano:

| Columna | Alternativas reconocidas |
|---|---|
| `ID` | Pedido, Nº, Orden |
| `Channel` | Canal, Origen |
| `Commensal` | Comensal, Nombre, Alumno, Cliente |
| `Class` | Clase, Curso, Grupo, Grado |
| `Pick-up time` | Hora, Horario, Hora de retiro |
| `Products` | Productos, Ítems, Detalle |
| `Comments` | Comentarios, Observaciones, Notas |
| `Status` | Estado |

También lee las filas de arriba del encabezado (`Pick-up date:`, `Export date:`, `Total orders:`)
para completar la fecha automáticamente.

En **Products**, cada línea es un producto y se entiende el formato `3x Nombre del producto`.
En **Comments**, un `-` significa «sin observaciones».

Hay un modelo en [`ejemplo/ejemplo-pedidos.xlsx`](ejemplo/ejemplo-pedidos.xlsx) (datos ficticios),
y el botón «Probar con datos de ejemplo» carga esos mismos datos sin necesidad de archivo.

## Publicar en GitHub Pages

El repo ya trae el workflow `.github/workflows/deploy-pages.yml`.

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Mergear esta rama a `main` (el workflow publica en cada push a `main`),
   o correrlo a mano desde **Actions → Deploy a GitHub Pages → Run workflow**.
3. Queda en `https://<usuario>.github.io/comandasordereat/`.

## Correrlo local

Es HTML + CSS + JS sin build ni dependencias externas:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Estructura

```
index.html                 interfaz
assets/css/app.css         estilos de pantalla y de la hoja A4 (@page A4, blanco y negro)
assets/js/parser.js        lectura y normalización del Excel
assets/js/render.js        armado de hojas, agrupación, resumen y autoajuste de los tickets
assets/js/app.js           interfaz, opciones, vista previa e impresión
assets/js/xlsx.full.min.js SheetJS (incluido en el repo: funciona sin internet)
ejemplo/                   Excel modelo con datos ficticios
```
