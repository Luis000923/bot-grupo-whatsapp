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

---

## 📱 Instalación en Termux (Android) - Rama Termux

Esta rama está específicamente adaptada para ejecutarse en Android usando Termux. Incluye optimizaciones de rutas, configuraciones específicas y compatibilidad mejorada.

### Preparación de Termux

```bash
# Actualizar paquetes
pkg update && pkg upgrade -y

# Instalar dependencias necesarias
pkg install -y git nodejs-lts python build-essential

# Permitir acceso al almacenamiento (opcional pero recomendado)
termux-setup-storage
```

### Instalación del Bot

```bash
# Clonar el repositorio y cambiar a la rama termux
git clone https://github.com/Luis000923/bot-grupo-whatsapp.git
cd bot-grupo-whatsapp
git checkout termux

# Instalar dependencias optimizadas para Termux
npm run setup-termux
```

### Configuración

```bash
# Crear archivo de configuración si no existe
cp .env.example .env 2>/dev/null || touch .env

# Editar configuración (opcional)
nano .env
```

Configuraciones importantes para Termux en `.env`:
```env
# Nivel de logging (error, warn, info, debug)
LOG_LEVEL=error

# Ruta personalizada para la base de datos (opcional)
# DB_PATH=/data/data/com.termux/files/home/bot_data.sqlite

# Tu API key de Gemini (opcional)
# GEMINI_API_KEY=tu_api_key_aqui

# Puerto para el dashboard web
PORT=3000
```

### Ejecución

```bash
# Iniciar el bot
npm run termux

# O usar el comando estándar
npm start
```

### Características específicas de la rama Termux

1. **Rutas adaptadas**: Todos los archivos se guardan en ubicaciones accesibles en Termux
2. **Detección automática**: El bot detecta si está ejecutándose en Termux y adapta su comportamiento
3. **Configuración optimizada**: Scripts específicos para instalación en Termux
4. **Sin Electron**: Removidas dependencias no compatibles con Android

### Archivos importantes en Termux

- **Base de datos**: `~/bot_data.sqlite` (en tu directorio home)
- **Autenticación**: `~/auth_info_baileys/` (credenciales de WhatsApp)
- **Código QR**: `~/qr_whatsapp.png` (imagen del QR para escanear)
- **Logs**: Los logs se muestran en consola

### Dashboard Web

El bot incluye un dashboard web accesible desde tu navegador:

```bash
# Después de iniciar el bot, accede a:
# http://localhost:3000/dashboard
# O desde otra red: http://[IP_de_tu_dispositivo]:3000/dashboard
```

### Solución de problemas en Termux

**El bot se cierra inesperadamente:**
```bash
# Evitar que Android mate el proceso
termux-wake-lock
```

**Error de permisos en archivos:**
```bash
# Verificar permisos del directorio
ls -la ~/
chmod 755 ~/auth_info_baileys 2>/dev/null || true
```

**Problemas de conexión:**
```bash
# Verificar que Node.js funciona correctamente
node --version
npm --version

# Reinstalar dependencias si es necesario
rm -rf node_modules package-lock.json
npm install
```

**QR no visible en terminal:**
- El QR se guarda como imagen en `~/qr_whatsapp.png`
- Puedes usar un explorador de archivos para verlo
- O acceder via el dashboard web

### Mantener el bot ejecutándose

Para que el bot siga funcionando:

1. **Wake Lock** (evita suspensión):
   ```bash
   termux-wake-lock
   npm start
   ```

2. **Usar tmux** (sesión persistente):
   ```bash
   pkg install tmux
   tmux new -s whatsapp-bot
   npm start
   # Presiona Ctrl+B, luego D para desconectar
   # Para reconectar: tmux attach -t whatsapp-bot
   ```

3. **Notificaciones persistentes**: Mantén Termux visible o úsalo con el wake lock activo.

### Comandos útiles para Termux

```bash
# Ver estado del bot
npm run termux

# Reinstalar dependencias para Termux
npm run setup-termux

# Ver logs en tiempo real (si usas tmux)
tmux attach -t whatsapp-bot
```

¡Tu bot de WhatsApp ya está listo para funcionar en Android con Termux! 🚀
