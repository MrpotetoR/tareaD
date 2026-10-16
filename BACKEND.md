# Backend local

El servidor se inicia con:

```powershell
node .\server.js
```

La página queda disponible en el puerto definido por `PORT` en `.env` (actualmente `http://127.0.0.1:3001/uttecam/acceso.asp`).

## Recepción de credenciales

`POST /api/credentials`

```json
{
  "email": "persona@example.com",
  "password": "una-clave-de-8-o-mas-caracteres"
}
```

El backend normaliza el email, genera un hash `scrypt` con salt aleatorio y guarda únicamente:

- `email`
- `passwordHash`
- `receivedAt`

No hay endpoint de login ni comparación de contraseñas porque este flujo solo recibe los datos. La información queda en `data/credentials.json`, fuera de `dist`, por lo que no se publica como archivo estático.

Este servidor usa MySQL mediante las variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` del `.env`. Para producción se necesita HTTPS, una base de datos con controles de acceso, rate limiting, secretos fuera del código y una política clara de retención de credenciales.
