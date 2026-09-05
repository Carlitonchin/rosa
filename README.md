# Siempre, tú.

Una rosa interactiva en Three.js con un aro de dedicatoria, centrada a pantalla completa sobre fondo blanco. La escena contiene únicamente la rosa y el aro: no hay cabecera, pie, botones, partículas ni otros textos visibles. Pétalos, tallo, hojas, nervaduras, sépalos, espinas y gotas de rocío son geometría tridimensional generada en el navegador.

## Iniciar

```sh
npm install
npm run dev
```

Abre la dirección que muestra Vite. Para probar en un teléfono conectado a la misma red, usa la dirección de red que muestra el servidor.

## Cambiar la dedicatoria

Edita `DEDICATION` en `src/config.js`:

```js
export const DEDICATION = 'Te elegiría a ti. Una y mil vidas más.';
```

El mensaje se actualiza en el aro 3D y en la descripción para lectores de pantalla. El aro tiene fondo dorado y texto negro en Arial, con espaciado normal. El tramo sobrante queda vacío. Los mensajes demasiado largos reducen automáticamente el tamaño de la letra para caber. La misma configuración permite cambiar el color de los pétalos y el giro inicial.

## Interacción

- La escena gira automáticamente al abrirla, desplazando el texto visible de derecha a izquierda para leerlo en orden.
- Arrastra con el ratón o con un dedo para girar libremente y leer el aro completo. El giro automático se pausa durante el gesto y se reanuda 2,5 segundos después de soltarlo.
- Pellizca con dos dedos o usa la rueda del ratón para acercar y alejar.
- Con el foco en la escena: flechas para girar, `+`/`-` para zoom y espacio para alternar el giro.

## Producción

```sh
npm run build
npm run preview
```

Publica la carpeta `dist/` en cualquier alojamiento estático. No requiere backend, claves, CDN de modelos ni fuentes remotas. Requiere WebGL 2. Usa la fuente Arial del dispositivo, con Helvetica y sans-serif como alternativas.

## Detalles técnicos

34 pétalos distribuidos en siete capas, con las capas exteriores más abiertas y un centro en espiral. Cada superficie tiene curvatura longitudinal y transversal, un borde enrollado mediante un arco y ondulaciones suaves y asimétricas. Materiales físicos con brillo aterciopelado, microtextura, iluminación cálida y sombras. Follaje compuesto alterno con bordes dentados, venas geométricas, cinco sépalos, once espinas curvas y doce gotas.

El aro es una cinta cilíndrica dorada y opaca con tipografía negra en su cara exterior. La cara interior es dorada lisa, para evitar letras invertidas. Las proporciones de la textura coinciden con las de la cinta para no deformar los caracteres. El giro permite leer el mensaje por completo.

En móvil se reduce la densidad geométrica y la resolución de sombras. La resolución del render se adapta si la velocidad inicial es baja. Las sombras estáticas se calculan una sola vez. Al pausar el giro y terminar la inercia, la escena deja de renderizar; en pestañas ocultas también se suspende el bucle. El giro inicial respeta `prefers-reduced-motion`. El encuadre se adapta al tamaño del contenedor, incluyendo cambios de orientación.

La rosa es una interpretación botánica procedural detallada; no es un escaneo fotogramétrico de una flor real.
