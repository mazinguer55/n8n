# n8n Workflow Manager CLI

Esta herramienta permite conectarse a una instancia de n8n, iniciar sesión con un usuario existente y activar o desactivar workflows sin abrir la interfaz web. Está pensada para equipos que necesitan gestionar rápidamente las automatizaciones desde la terminal.

## Instalación y compilación

```bash
pnpm install
pnpm --filter @n8n/workflow-manager-app build
```

## Uso rápido

Una vez compilado el paquete, puedes ejecutar la utilidad con `node` directamente:

```bash
node packages/workflow-manager-app/dist/index.js interactive
```

### Ejemplo interactivo

```bash
node packages/workflow-manager-app/dist/index.js \
  --base-url http://localhost:5678 \
  --email admin@example.com \
  interactive
```

El asistente solicitará la contraseña (si no se proporcionó por CLI o variables de entorno) y mostrará la lista de workflows con opciones para activarlos o desactivarlos.

### Comandos disponibles

- `list`: muestra los workflows y su estado.
- `activate <workflowId>`: activa un workflow concreto.
- `deactivate <workflowId>`: desactiva un workflow concreto.
- `interactive`: abre el asistente paso a paso para gestionar múltiples workflows.

Puedes definir las credenciales por variables de entorno para evitar pasarlas como argumentos:

```bash
export N8N_BASE_URL="https://mi-servidor-n8n.com"
export N8N_EMAIL="usuario@empresa.com"
export N8N_PASSWORD="secreto"
node packages/workflow-manager-app/dist/index.js list
```
