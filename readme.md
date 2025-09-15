# WhatsApp Bot Baileys

Bot de WhatsApp para gestión de grupos y comandos divertidos, construido con [Baileys](https://github.com/WhiskeySockets/Baileys).

La lógica de “eventos” fue eliminada para simplificar el uso. El bot ahora procesa solo mensajes que empiecen con `/`.

## Características

- Procesa únicamente comandos con prefijo `/` (los demás mensajes se ignoran).
- Mensaje de bienvenida configurable por grupo (`/bienvenido set ...`).
- Info del grupo y mención de administradores (`/info`, `/lideres`).
- Registro de actividad por usuario y ranking (`/masactivo`, `/menosactivo`, `/top`).
- Comandos divertidos con selección aleatoria de miembros: `/novios`, `/crush`, `/lucky`, `/simp`, `/pro`.
- Reconexión con backoff exponencial y detección de conflictos de sesión.
- QR de vinculación guardado como imagen PNG.
- Persistencia ligera en archivo (`bot_data.json`) y ranking en SQLite (`bot_data.sqlite`).

## Requisitos

- Node.js >= 16
- Una línea de WhatsApp válida para vincular

## Instalación

1) Clona el repositorio e instala dependencias:

```sh
npm install
```

2) Inicia el bot (dev o producción):

```sh
# Desarrollo (recarga automática)
npm run dev

# Producción
npm start
```

3) Escanea el QR que se guarda como `qr_whatsapp.png` con WhatsApp en tu teléfono (Dispositivos vinculados).

Notas:
- Las credenciales se guardan en `auth_info_baileys/` (excluidas del repositorio por `.gitignore`).
- Variables opcionales en `.env`: `DB_PATH` (por defecto `./bot_data.sqlite`), `LOG_LEVEL`.

## Uso de comandos

Comandos generales
- `/ayuda` — Muestra esta lista de comandos.
- `/info` — Muestra nombre y admins del grupo.
- `/lideres` — Menciona a todos los administradores.
- `/bienvenido @usuario` — Envía el mensaje de bienvenida al usuario indicado (también funciona respondiendo o con @número). 
- `/masactivo` — Menciona al usuario con más mensajes.
- `/menosactivo` — Menciona al usuario con menos mensajes.
- `/novios` — Empareja dos personas al azar.
- `/crush` — Dos personas que secretamente se gustan.
- `/lucky` — Elige a una persona con “día de suerte”.
- `/simp` — Declara al simp oficial del grupo.
- `/pro` — El pro en todo.
- `/top` — Top de usuarios por mensajes enviados (SQLite).

Comandos de administrador
- `/bienvenido set [mensaje]` — Configura el mensaje de bienvenida del grupo.

Consejos:
- Solo se consideran miembros del grupo (se excluye al propio bot en selecciones aleatorias).
- Si no hay suficiente gente para un comando aleatorio, el bot avisa.

## Estabilidad de conexión

El bot implementa:
- Backoff exponencial con jitter para reconectar en caso de caídas.
- Detección de conflicto de sesión (cuando otra sesión reemplaza esta). Si ves “conflict/replaced”:
  1) En el teléfono: WhatsApp > Dispositivos vinculados > cierra otras sesiones.
  2) Asegúrate de tener solo UNA instancia del bot corriendo.
- Si estás “logged out”: borra `auth_info_baileys/` y vuelve a vincular escaneando el QR.

## Desarrollo

- Recarga en caliente: `npm run dev` (controlado por `nodemon.json` que ignora archivos volátiles).
- Pruebas: `npm test` (Jest; tests básicos incluidos).

## Seguridad del repositorio

Este proyecto incluye un `.gitignore` que excluye:
- `auth_info_baileys/` (credenciales/sesiones)
- `node_modules/`, `bot_data.json`, `bot_data.sqlite`, `qr_whatsapp.png`, `.env` y artefactos locales

Nunca subas tus credenciales. Si crees que se filtraron, cierra sesiones vinculadas y vuelve a vincular el bot.

## Licencia

MIT
 
## Instalación en Termux (Android)

Sigue estos pasos para instalar y ejecutar el bot en Termux:

```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs-lts

# (Opcional) Permitir acceso al almacenamiento
termux-setup-storage

# Clona el repo y entra a la carpeta
git clone https://github.com/USUARIO/REPO.git bot2
cd bot2

# Instala dependencias
npm install

# Variables de entorno
cp .env.example .env
nano .env   # edita valores (LOG_LEVEL, GEMINI_API_KEY si aplica)

# Inicia el bot
npm start
```

Consejos para Termux:
- Si el QR no se ve bien en consola, revisa `qr_whatsapp.png`.
- Mantén Termux en primer plano durante el enlace para evitar que Android lo suspenda.
- Las credenciales quedan en `auth_info_baileys/` (no subir a GitHub).