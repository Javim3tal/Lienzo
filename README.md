# Lienzo

Editor de dibujo sencillo para **macOS**, inspirado en el clásico programa de pintura de Windows. Funciona en Mac con Apple Silicon (M1, M2, M3, M4…) y con Intel.

> Lienzo es un proyecto independiente con código propio. No está afiliado a Microsoft ni usa su código, iconos o recursos.

## Instalación en tu Mac

1. Entra en la sección [**Releases**](../../releases/latest) de este repositorio.
2. Descarga el archivo **`Lienzo-x.y.z.dmg`**.
3. Abre el `.dmg` y arrastra **Lienzo** a la carpeta **Aplicaciones**.
4. La primera vez, macOS dirá que no puede verificar al desarrollador, porque la app no está firmada con una cuenta de desarrollador de Apple de pago:
   - Intenta abrir Lienzo y cierra el aviso.
   - Ve a **Ajustes del Sistema → Privacidad y seguridad**, baja hasta el mensaje sobre Lienzo y pulsa **Abrir igualmente**.
   - Desde entonces se abre normalmente.

<details>
<summary>Alternativa desde Terminal</summary>

```bash
xattr -dr com.apple.quarantine /Applications/Lienzo.app
```
</details>

## Funciones

**Herramientas:** lápiz, relleno con color, texto (fuente, tamaño, negrita, cursiva, subrayado y fondo opaco o transparente), borrador, selector de color y lupa.

**Pinceles:** pincel, dos pinceles caligráficos, aerógrafo y marcador.

**Formas:** línea, curva, óvalo, rectángulo, rectángulo redondeado, polígono, triángulos, rombo, pentágono, hexágono, cuatro flechas, estrellas de 4, 5 y 6 puntas, corazón y rayo. Contorno y relleno configurables. Con **⇧** se dibujan cuadrados, círculos y líneas a 45°.

**Selección:** rectangular o de forma libre, mover, mover una copia (⌥ + arrastrar), selección transparente, cortar, copiar y pegar con el portapapeles del sistema, eliminar y recortar.

**Imagen:** girar 90°/180°, voltear, cambiar tamaño (porcentaje o píxeles), sesgar, invertir colores, cambiar el tamaño del lienzo con los tiradores o desde *Propiedades*.

**Colores:** color 1 (clic) y color 2 (clic derecho o ctrl+clic), paleta de 20 colores, colores personalizados con el selector de macOS.

**Archivos:** abre PNG, JPEG, BMP, GIF, WebP, ICO, AVIF, SVG, HEIC y TIFF. Guarda en PNG, JPEG, BMP y WebP. Puedes abrir imágenes arrastrándolas a la ventana o con «Abrir con» desde Finder.

**Vista:** zoom del 5 % al 1600 %, pellizcando en el trackpad, con ⌘ + rueda o con el control de la barra de estado. Deshacer y rehacer hasta 30 pasos. Modo oscuro automático.

Todos los atajos de teclado están en **Ayuda → Atajos de teclado**.

## Cómo se crea el instalador

Cada cambio en la rama `main` lanza el flujo [`.github/workflows/build-mac.yml`](.github/workflows/build-mac.yml). Ese flujo compila la app en un Mac de GitHub Actions como binario universal (Intel + Apple Silicon), la firma de forma local (*ad hoc*), genera el `.dmg` y lo publica en Releases. Para sacar una versión nueva, sube el número de `version` en `package.json`.

## Desarrollo

Requiere [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm start
```

La interfaz está en `src/` (HTML, CSS y JavaScript sin dependencias). `main.js` es el proceso principal de Electron (ventana, menú, archivos) y `preload.js`, el puente seguro entre ambos.

## Licencia

[MIT](LICENSE)
