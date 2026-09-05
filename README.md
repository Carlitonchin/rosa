# Siempre, tú.

Una rosa interactiva en Three.js con un anillo de oro grabado con la dedicatoria, sobre un fondo de terciopelo oscuro. La escena contiene únicamente la rosa y el anillo: no hay cabecera, pie, botones ni otros textos visibles. Pétalos, tallo, hojas, sépalos y espinas son geometría tridimensional generada en el navegador a partir de reglas botánicas.

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

El mensaje se graba en la cara exterior del anillo y se incluye en la descripción para lectores de pantalla. La tipografía es Cormorant Garamond en cursiva, autoalojada en `public/fonts`, con Georgia como alternativa. El grabado es un rebaje relleno de esmalte oscuro, como hacen los joyeros para que la letra se lea sobre el oro. Los mensajes demasiado largos reducen automáticamente el tamaño de la letra para caber. La misma configuración permite cambiar el color de los pétalos y el giro inicial.

## Interacción

- La escena gira automáticamente al abrirla, desplazando el texto visible de derecha a izquierda para leerlo en orden.
- Arrastra con el ratón o con un dedo para girar libremente y leer el anillo completo. El giro automático se pausa durante el gesto y se reanuda 2,5 segundos después de soltarlo.
- Pellizca con dos dedos o usa la rueda del ratón para acercar y alejar.
- Con el foco en la escena: flechas para girar, `+`/`-` para zoom y espacio para alternar el giro.

## Producción

```sh
npm run build
npm run preview
```

Publica la carpeta `dist/` en cualquier alojamiento estático. No requiere backend, claves, CDN de modelos ni fuentes remotas. Requiere WebGL 2.

## Detalles técnicos

**La flor.** Cuarenta pétalos siguen el ángulo áureo, de modo que la espiral del centro aparece por sí sola. Cada pétalo es una curva de nervio central integrada desde su inclinación en la base hasta el reflejo de la punta: los exteriores se abren y vuelcan hacia fuera, los interiores se enrollan alrededor del capullo. La lámina se ahueca a lo ancho, se pliega en las esquinas como en una rosa híbrida de té y ondula suavemente en el borde. Cinco sépalos lanceolados cuelgan bajo el receptáculo. Las hojas son compuestas, con cinco folíolos aserrados en los tallos bajos y tres en el alto, con el tinte cobrizo del brote joven.

**Materiales y luz.** Los pétalos llevan un material físico con brillo aterciopelado, venas y papilas procedurales, y un término de dispersión subsuperficial: una luz de contra atraviesa las láminas finas y las enciende por el borde. Una luz principal frontal modela la copa con sombra; el entorno es un pequeño estudio fotográfico prefiltrado (una caja de luz, una tira de contra, un relleno frío) que también se refleja en el oro. En escritorio se añade oclusión ambiental de pantalla para el contacto entre pétalos, una profundidad de campo leve enfocada entre el grabado y la flor, viñeta y grano de película.

**El anillo.** Una banda de oro con perfil en D y ajuste cómodo, generada por revolución. El texto se aplica a la cara exterior mediante mapas de color, rugosidad, metalicidad y relieve, de manera que las letras quedan rebajadas, mates y oscuras.

**Movimiento.** Los pétalos respiran con un desplazamiento en el sombreador de vértices y el tallo se mece con el aire de la sala; el grano de película es animado. Todo respeta `prefers-reduced-motion`, en cuyo caso la escena queda quieta y solo se vuelve a dibujar al interactuar.

**Rendimiento.** En móvil se reduce la densidad geométrica, la resolución de sombras y de texturas, y se omiten la oclusión ambiental y la profundidad de campo. Si la velocidad inicial es baja, se baja la resolución del render y se desactiva la oclusión ambiental. En pestañas ocultas se suspende el bucle. El encuadre se adapta al tamaño del contenedor, incluyendo cambios de orientación.

La rosa es una interpretación botánica procedural; no es un escaneo fotogramétrico de una flor real.
